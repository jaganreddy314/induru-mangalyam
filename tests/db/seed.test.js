// The development seed applies cleanly and yields a usable demo (discoverable profiles).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb } from './harness.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let db;
after(async () => db?.close());

test('seed applies and demo profiles are discoverable to another approved family', async () => {
  db = await createTestDb('seed');
  const url = new URL(process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/postgres');
  url.pathname = `/${db.name}`;
  execFileSync('psql', [url.toString(), '-q', '-v', 'ON_ERROR_STOP=1', '-f', join(root, 'supabase/seed.sql')]);
  const father = { id: '00000000-0000-4000-8000-000000000011', aal: 'aal1', authAt: Math.floor(Date.now() / 1000) };
  const page = await db.rpc(father, 'discover', { p_filters: { gender: 'FEMALE' } });
  assert.deepEqual(page.items.map((i) => i.code).sort(), ['IM-DEMOLP2', 'IM-DEMOSG3']);
  const pending = { id: '00000000-0000-4000-8000-000000000041', aal: 'aal1', authAt: father.authAt };
  await assert.rejects(db.rpc(pending, 'discover'), /MEMBERSHIP_PENDING/);
});
