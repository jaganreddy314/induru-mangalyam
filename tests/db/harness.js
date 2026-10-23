// Test harness: builds a throwaway database from the shim + migrations and lets tests
// call RPCs exactly as PostgREST would (role `authenticated` + request.jwt.claims).
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const baseUrl = process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/postgres';

export class RpcError extends Error {
  constructor(code, hint) {
    super(`${code}${hint ? `: ${hint}` : ''}`);
    this.code = code;
  }
}

export async function createTestDb(name) {
  const dbName = `induru_test_${name}`;
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  await admin.query(`drop database if exists ${dbName} with (force)`);
  await admin.query(`create database ${dbName}`);
  await admin.end();

  const url = new URL(baseUrl);
  url.pathname = `/${dbName}`;
  const files = [
    join(root, 'tests/db/shim.sql'),
    ...readdirSync(join(root, 'supabase/migrations')).sort().map((f) => join(root, 'supabase/migrations', f)),
  ];
  for (const file of files) {
    execFileSync('psql', [url.toString(), '-q', '-v', 'ON_ERROR_STOP=1', '-f', file], { stdio: ['ignore', 'ignore', 'pipe'] });
  }
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  return new TestDb(client, dbName);
}

class TestDb {
  constructor(client, name) {
    this.client = client;
    this.name = name;
  }

  async close() {
    await this.client.end();
  }

  sql(text, params) {
    return this.client.query(text, params);
  }

  async createUser(phone, { name } = {}) {
    const id = randomUUID();
    await this.sql('insert into auth.users (id, phone) values ($1, $2)', [id, phone.replace(/^\+/, '')]);
    const user = { id, phone, aal: 'aal1', authAt: Math.floor(Date.now() / 1000) };
    await this.rpc(user, 'ensure_profile', { p_locale: 'en' });
    if (name) await this.rpc(user, 'set_preferences', { p_display_name: name });
    return user;
  }

  async makeStaff(user, role) {
    await this.sql('insert into app.role_assignments (user_id, role) values ($1, $2)', [user.id, role]);
    user.aal = 'aal2';
  }

  /** Calls public.<fn>(named args) as `user`. Throws RpcError on raised or returned errors. */
  async rpc(user, fn, args = {}) {
    const names = Object.keys(args);
    const call = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`;
    const claims = user
      ? { sub: user.id, role: 'authenticated', aal: user.aal, amr: [{ method: 'otp', timestamp: user.authAt }] }
      : { role: 'anon' };
    await this.sql('begin');
    try {
      await this.sql(`set local role ${user ? 'authenticated' : 'anon'}`);
      await this.sql(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      const { rows } = await this.sql(call, names.map((n) => serialise(args[n])));
      await this.sql('commit');
      const r = rows[0].r;
      if (r && typeof r === 'object' && !Array.isArray(r) && r.error) throw new RpcError(r.error, r.message);
      return r;
    } catch (e) {
      if (!(e instanceof RpcError)) {
        await this.sql('rollback');
        if (e.code === 'P0001') throw new RpcError(e.message, e.hint);
        if (e.code === '42501') throw new RpcError('PERMISSION_DENIED', e.message);
      }
      throw e;
    }
  }

  /** Runs raw SQL as `user` (used to exercise storage.objects RLS policies). */
  async asUser(user, text, params = []) {
    const claims = { sub: user.id, role: 'authenticated', aal: user.aal, amr: [{ method: 'otp', timestamp: user.authAt }] };
    await this.sql('begin');
    try {
      await this.sql('set local role authenticated');
      await this.sql(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      const res = await this.sql(text, params);
      await this.sql('commit');
      return res.rows;
    } catch (e) {
      await this.sql('rollback');
      throw e;
    }
  }

  async audit(action, outcome) {
    const { rows } = await this.sql(
      'select * from app.audit_events where action = $1 and ($2::text is null or outcome = $2) order by occurred_at',
      [action, outcome ?? null],
    );
    return rows;
  }
}

function serialise(v) {
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) return JSON.stringify(v);
  return v;
}
