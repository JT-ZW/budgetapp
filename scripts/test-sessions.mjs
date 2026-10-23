// Isolated PostgreSQL tests. Never connects to a real Supabase project.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';

const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const session = '33333333-3333-4333-8333-333333333333';
const second = '44444444-4444-4444-8444-444444444444';
const rpc = async (id, action, idle = 0) => (await db.query(
  'select public.budget_app_session($1,$2,$3) as expires', [id, action, idle]
)).rows[0].expires;
const asUser = async (id) => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
};
try {
  await db.exec(`
    create role authenticated; create role anon; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema auth to authenticated,anon;
  `);
  await db.exec(readFileSync('supabase/migrations/0007_app_sessions.sql', 'utf8'));
  await db.query('insert into auth.users values ($1),($2)', [owner, other]);
  await asUser(owner);
  assert.equal(await rpc(session, 'check'), null, 'old logins cannot silently acquire a new app session');
  assert.ok(await rpc(session, 'start'));
  const initial = await rpc(session, 'check');
  assert.equal(String(await rpc(session, 'check')), String(initial), 'background checks do not extend expiry');
  await assert.rejects(() => db.query('select * from public.budget_app_sessions'), /permission denied/);
  await assert.rejects(() => db.query('update public.budget_app_sessions set revoked_at=null'), /permission denied/);
  await asUser(other);
  assert.equal(await rpc(session, 'check'), null, 'another user cannot read the session');
  assert.equal(await rpc(session, 'touch'), null, 'another user cannot extend the session');
  await rpc(session, 'end');
  await asUser(owner);
  assert.ok(await rpc(session, 'check'), 'another user cannot revoke the session');
  await db.exec('reset role');
  await db.query("update public.budget_app_sessions set last_active_at=clock_timestamp()-interval '9 minutes' where id=$1", [session]);
  await asUser(owner);
  const before = await rpc(session, 'check');
  const after = await rpc(session, 'touch', 10000);
  assert.ok(new Date(after) > new Date(before), 'real activity extends an active session');
  await db.exec('reset role');
  await db.query("update public.budget_app_sessions set last_active_at=clock_timestamp()-interval '10 minutes' where id=$1", [session]);
  await asUser(owner);
  assert.equal(await rpc(session, 'touch'), null, 'activity cannot revive an expired session');
  assert.equal(await rpc(session, 'check'), null);
  await assert.rejects(() => rpc(session, 'start'), /duplicate key/, 'a revoked id cannot be reused');
  await rpc(second, 'start');
  await rpc(second, 'endAll');
  assert.equal(await rpc(second, 'check'), null, 'password changes revoke all user sessions');
  await db.exec('reset role; set role anon');
  await assert.rejects(() => rpc(second, 'start'), /permission denied/);
  console.log('PASS: migration, expiry, activity, no revival, owner isolation, revocation, grants');
} finally {
  await db.close();
}

// Exercise the actual request hook with isolated authentication/session responses.
globalThis.__sessionTest = { user: null, expires: null, rpcError: null, ended: 0 };
const dataModule = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
let hookSource = ts.transpileModule(readFileSync('src/hooks.server.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
}).outputText;
const imports = {
  '$env/static/public': dataModule(`export const PUBLIC_SUPABASE_URL='https://example.supabase.co'; export const PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';`),
  '@supabase/ssr': dataModule(`export function createServerClient() { return {
    auth: { getUser: async () => ({data:{user:globalThis.__sessionTest.user},error:null}) },
    rpc: async () => ({data:globalThis.__sessionTest.expires,error:globalThis.__sessionTest.rpcError})
  }; }`),
  '$lib/server/session': dataModule(`export const SESSION_COOKIE='budget_app_session'; export async function endSession(){globalThis.__sessionTest.ended++;}`),
  '@sveltejs/kit': import.meta.resolve('@sveltejs/kit')
};
for (const [name, url] of Object.entries(imports)) hookSource = hookSource.replaceAll(`'${name}'`, `'${url}'`);
const { handle } = await import(dataModule(hookSource));
const state = globalThis.__sessionTest;
const request = (path, { method = 'GET', origin, cookie = session } = {}) => handle({
  event: {
    locals: {}, url: new URL(path, 'https://budget.example'),
    request: new Request(new URL(path, 'https://budget.example'), { method, headers: origin ? { origin } : {} }),
    cookies: { get: () => cookie, getAll: () => [], set() {}, delete() {} }
  },
  resolve: async () => new Response('private content')
});
await assert.rejects(() => request('/dashboard'), (e) => e.status === 303);
state.user = { id: owner };
await assert.rejects(() => request('/dashboard', { cookie: null }), (e) => e.status === 303);
await assert.rejects(() => request('/credit', { method: 'POST', origin: 'https://budget.example' }), (e) => e.status === 303);
assert.equal((await request('/session')).status, 401);
state.expires = new Date(Date.now() + 600000).toISOString();
const permitted = await request('/dashboard');
assert.equal(permitted.status, 200);
assert.equal(permitted.headers.get('cache-control'), 'private, no-store');
assert.equal(permitted.headers.get('x-frame-options'), 'DENY');
assert.equal((await request('/')).status, 200, 'login page remains available to signed-in users');
await assert.rejects(() => request('/session', { method: 'POST', origin: 'https://attacker.example' }), (e) => e.status === 403);
await assert.rejects(() => request('/session', { method: 'POST' }), (e) => e.status === 403);
state.rpcError = { message: 'database unavailable' };
await assert.rejects(() => request('/dashboard'), (e) => e.status === 503, 'session failures deny protected data');
delete globalThis.__sessionTest;
console.log('PASS: route and action guards, cross-origin rejection, no-cache headers, fail-closed checks');
