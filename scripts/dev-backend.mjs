#!/usr/bin/env node
// LOCAL TESTER BACKEND — for trying the apps without Docker or a hosted Supabase project.
//
// Serves the small slice of the Supabase HTTP API the apps use (phone OTP auth, TOTP for staff,
// RPC, private storage) on http://127.0.0.1:54321, backed by the REAL migrations on a local
// PostgreSQL database. Every RPC runs as role `authenticated` with JWT claims, exactly like
// PostgREST, so permissions, RLS, state machines and audit behave as in production.
//
// Tester code: every phone number and the staff authenticator accept 123456. This file must never
// be deployed; it refuses to bind to anything but 127.0.0.1.
//
//   node scripts/dev-backend.mjs           # create the dev database on first run, then serve
//   node scripts/dev-backend.mjs --reset   # drop and rebuild it from migrations + seed
import http from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 54321;
const HOST = '127.0.0.1';
const TESTER_CODE = '123456';
const SECRET = 'induru-local-tester-backend-not-for-production';
const BASE_URL = process.env.DEV_DATABASE_URL_BASE ?? 'postgres://localhost:5432/postgres';
const DB_NAME = 'induru_dev';
const STORAGE_DIR = join(root, '.dev-storage');
const TTL = 3600;

// ---------- database ----------
async function ensureDatabase(reset) {
  const admin = new pg.Client({ connectionString: BASE_URL });
  await admin.connect();
  const exists = (await admin.query('select 1 from pg_database where datname = $1', [DB_NAME])).rowCount > 0;
  if (exists && !reset) { await admin.end(); return false; }
  await admin.query(`drop database if exists ${DB_NAME} with (force)`);
  await admin.query(`create database ${DB_NAME}`);
  await admin.end();
  const files = [
    join(root, 'tests/db/shim.sql'),
    ...readdirSync(join(root, 'supabase/migrations')).sort().map((f) => join(root, 'supabase/migrations', f)),
    join(root, 'supabase/seed.sql'),
  ];
  for (const f of files) execFileSync('psql', [dbUrl(), '-q', '-v', 'ON_ERROR_STOP=1', '-f', f], { stdio: ['ignore', 'ignore', 'inherit'] });
  rmSync(STORAGE_DIR, { recursive: true, force: true });
  return true;
}
function dbUrl() { const u = new URL(BASE_URL); u.pathname = `/${DB_NAME}`; return u.toString(); }

let pool;
const argTypes = new Map();
async function fnArgs(fn) {
  if (argTypes.has(fn)) return argTypes.get(fn);
  const { rows } = await pool.query(
    `select p.proargnames as names, array(select format_type(t, null) from unnest(p.proargtypes) t) as types
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [fn]);
  if (!rows.length) return null;
  const map = Object.fromEntries((rows[0].names ?? []).map((n, i) => [n, rows[0].types[i]]));
  argTypes.set(fn, map);
  return map;
}

/** Runs `work(client)` inside a transaction as the caller, PostgREST-style. */
async function asCaller(claims, requestId, work) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${claims ? 'authenticated' : 'anon'}`);
    await c.query(`select set_config('request.jwt.claims', $1, true), set_config('request.headers', $2, true)`,
      [JSON.stringify(claims ?? { role: 'anon' }), JSON.stringify({ 'x-request-id': requestId ?? randomUUID() })]);
    const out = await work(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally { c.release(); }
}

// ---------- tokens ----------
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function sign(payload) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  return `${head}.${body}.${createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`;
}
function verify(token) {
  const [h, b, s] = String(token ?? '').split('.');
  if (!s || createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url') !== s) return null;
  const p = JSON.parse(Buffer.from(b, 'base64url').toString());
  return p.exp && p.exp < Date.now() / 1000 ? null : p;
}
const bearer = (req) => verify((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));
const claimsOf = (p) => (p && p.role === 'authenticated' ? { sub: p.sub, role: 'authenticated', aal: p.aal, amr: p.amr, phone: p.phone, session_id: p.session_id } : null);

async function isStaff(userId) {
  const { rowCount } = await pool.query('select 1 from app.role_assignments where user_id = $1 and revoked_at is null', [userId]);
  return rowCount > 0;
}
async function userJson(id, phone) {
  const now = new Date().toISOString();
  return {
    id, aud: 'authenticated', role: 'authenticated', phone, phone_confirmed_at: now, confirmed_at: now,
    app_metadata: { provider: 'phone', providers: ['phone'] }, user_metadata: {}, identities: [], created_at: now, updated_at: now,
    factors: (await isStaff(id)) ? [{ id: `totp-${id}`, factor_type: 'totp', status: 'verified', friendly_name: 'Tester authenticator', created_at: now, updated_at: now }] : [],
  };
}
async function session(sub, phone, aal, amr) {
  const now = Math.floor(Date.now() / 1000);
  const sid = randomUUID();
  const base = { sub, phone, aal, amr, session_id: sid, role: 'authenticated', aud: 'authenticated' };
  return {
    access_token: sign({ ...base, iat: now, exp: now + TTL }), token_type: 'bearer', expires_in: TTL, expires_at: now + TTL,
    refresh_token: sign({ ...base, typ: 'refresh', iat: now, exp: now + 30 * 86400 }), user: await userJson(sub, phone),
  };
}

// ---------- http ----------
function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
}
const authErr = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg });
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}
const json = (buf) => { try { return buf.length ? JSON.parse(buf.toString()) : {}; } catch { return {}; } };

async function handle(req, res) {
  res.setHeader('access-control-allow-origin', req.headers.origin ?? '*');
  res.setHeader('access-control-allow-headers', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('access-control-expose-headers', '*');
  if (req.method === 'OPTIONS') return send(res, 204);
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const path = decodeURIComponent(url.pathname);
  const raw = await readBody(req);

  // ---- auth ----
  if (path === '/auth/v1/otp' && req.method === 'POST') {
    const { phone } = json(raw);
    console.log(`  otp      ${phone} → tester code ${TESTER_CODE}`);
    return send(res, 200, {});
  }
  if (path === '/auth/v1/verify' && req.method === 'POST') {
    const { phone, token } = json(raw);
    if (token !== TESTER_CODE) return authErr(res, 403, 'otp_expired', 'Token has expired or is invalid');
    const digits = String(phone).replace(/^\+/, '');
    let { rows } = await pool.query('select id from auth.users where phone = $1', [digits]);
    if (!rows.length) rows = (await pool.query('insert into auth.users (phone) values ($1) returning id', [digits])).rows;
    console.log(`  sign-in  +${digits}`);
    return send(res, 200, await session(rows[0].id, digits, 'aal1', [{ method: 'otp', timestamp: Math.floor(Date.now() / 1000) }]));
  }
  if (path === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
    const p = verify(json(raw).refresh_token);
    if (!p || p.typ !== 'refresh') return authErr(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token');
    return send(res, 200, await session(p.sub, p.phone, p.aal, p.amr));
  }
  if (path === '/auth/v1/user' && req.method === 'GET') {
    const p = bearer(req);
    if (!p) return authErr(res, 401, 'bad_jwt', 'invalid JWT');
    return send(res, 200, await userJson(p.sub, p.phone));
  }
  if (path === '/auth/v1/logout') return send(res, 204);
  let m = path.match(/^\/auth\/v1\/factors\/([^/]+)\/(challenge|verify)$/);
  if (m) {
    const p = bearer(req);
    if (!p) return authErr(res, 401, 'bad_jwt', 'invalid JWT');
    if (m[2] === 'challenge') return send(res, 200, { id: randomUUID(), type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 });
    if (json(raw).code !== TESTER_CODE) return authErr(res, 422, 'mfa_verification_failed', 'Invalid TOTP code entered');
    console.log(`  mfa      +${p.phone} → aal2`);
    const s = await session(p.sub, p.phone, 'aal2', [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }, ...(p.amr ?? [])]);
    return send(res, 200, s);
  }
  if (path.startsWith('/auth/v1/')) return authErr(res, 404, 'not_found', `Not available in the tester backend: ${path}`);

  // ---- rpc ----
  m = path.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/);
  if (m) {
    const fn = m[1];
    const types = await fnArgs(fn);
    if (!types) return send(res, 404, { code: 'PGRST202', message: `Could not find the function public.${fn}` });
    const args = json(raw);
    const names = Object.keys(args).filter((n) => n in types);
    const values = names.map((n) => {
      const v = args[n];
      if (v === null || v === undefined) return null;
      if (/^jsonb?$/.test(types[n])) return JSON.stringify(v);
      return v;
    });
    const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}::${types[n]}`).join(', ')}) as r`;
    try {
      const r = await asCaller(claimsOf(bearer(req)), req.headers['x-request-id'], async (c) => (await c.query(sql, values)).rows[0].r);
      return send(res, 200, r === '' ? null : r);
    } catch (e) {
      if (e.code !== 'P0001') console.warn(`  rpc ${fn} failed: ${e.code} ${e.message}`);
      return send(res, e.code === '42501' ? 403 : 400, { code: e.code ?? 'XX000', message: e.message, details: e.detail ?? null, hint: e.hint ?? null });
    }
  }

  // ---- storage (private buckets; policies enforced through storage.objects RLS) ----
  m = path.match(/^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/);
  if (m && req.method === 'POST') {
    const [, bucket, name] = m;
    try {
      const ok = await asCaller(claimsOf(bearer(req)), null, async (c) =>
        (await c.query('select 1 from storage.objects where bucket_id = $1 and name = $2', [bucket, name])).rowCount > 0);
      if (!ok) return send(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      const token = sign({ bucket, name, exp: Math.floor(Date.now() / 1000) + Number(json(raw).expiresIn ?? 60) });
      return send(res, 200, { signedURL: `/object/sign/${bucket}/${name}?token=${token}` });
    } catch (e) { return send(res, 400, { statusCode: '403', error: 'Unauthorized', message: e.message }); }
  }
  if (m && req.method === 'GET') {
    const t = verify(url.searchParams.get('token'));
    const file = join(STORAGE_DIR, m[1], m[2]);
    if (!t || t.bucket !== m[1] || t.name !== m[2] || !existsSync(file)) return send(res, 400, { statusCode: '400', error: 'InvalidJWT', message: 'Invalid or expired link' });
    const type = existsSync(`${file}.type`) ? readFileSync(`${file}.type`, 'utf8') : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', 'content-disposition': 'inline' });
    return res.end(readFileSync(file));
  }
  m = path.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/);
  if (m && (req.method === 'POST' || req.method === 'PUT')) {
    const [, bucket, name] = m;
    let bytes = raw;
    let type = req.headers['content-type'] ?? 'application/octet-stream';
    if (type.startsWith('multipart/form-data')) {
      const form = await new Request('http://x', { method: 'POST', headers: { 'content-type': type }, body: raw }).formData();
      const file = [...form.values()].find((v) => typeof v === 'object');
      bytes = Buffer.from(await file.arrayBuffer());
      type = file.type || 'application/octet-stream';
    }
    try {
      const id = await asCaller(claimsOf(bearer(req)), null, async (c) =>
        (await c.query('insert into storage.objects (bucket_id, name) values ($1, $2) returning id', [bucket, name])).rows[0].id);
      const file = join(STORAGE_DIR, bucket, name);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, bytes);
      writeFileSync(`${file}.type`, type);
      return send(res, 200, { Id: id, Key: `${bucket}/${name}` });
    } catch (e) { return send(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' }); }
  }
  m = path.match(/^\/storage\/v1\/object\/([^/]+)$/);
  if (m && req.method === 'DELETE') {
    const names = json(raw).prefixes ?? [];
    const removed = await asCaller(claimsOf(bearer(req)), null, async (c) =>
      (await c.query('delete from storage.objects where bucket_id = $1 and name = any($2) returning name', [m[1], names])).rows.map((r) => r.name));
    for (const n of removed) { rmSync(join(STORAGE_DIR, m[1], n), { force: true }); rmSync(join(STORAGE_DIR, m[1], `${n}.type`), { force: true }); }
    return send(res, 200, removed.map((name) => ({ name, bucket_id: m[1] })));
  }

  return send(res, 404, { message: `Not available in the tester backend: ${req.method} ${path}` });
}

// ---------- start ----------
const reset = process.argv.includes('--reset');
const created = await ensureDatabase(reset);
pool = new pg.Pool({ connectionString: dbUrl(), max: 8 });
http.createServer((req, res) => handle(req, res).catch((e) => { console.error(e); send(res, 500, { message: 'tester backend error' }); }))
  .listen(PORT, HOST, () => {
    console.log(`\nInduru Mangalyam tester backend · http://${HOST}:${PORT} · database ${DB_NAME}${created ? ' (freshly seeded)' : ''}`);
    console.log(`Tester code for every number and for staff two-factor: ${TESTER_CODE}\n`);
  });
