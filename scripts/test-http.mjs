// Read-only smoke checks: no credentials, writes, or financial fixtures.
import assert from 'node:assert/strict';
const base = process.argv[2];
if (!base || !['http:', 'https:'].includes(new URL(base).protocol)) throw new Error('Pass the running app URL, e.g. node scripts/test-http.mjs http://localhost:5174');
const get = (path, options = {}) => fetch(new URL(path, base), { redirect: 'manual', signal: AbortSignal.timeout(20000), ...options });
for (const path of ['/', '/forgot-password']) {
  const response = await get(path);
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}
for (const path of ['/dashboard', '/wallets', '/transactions', '/budgets', '/insights', '/credit', '/settings', '/investments', '/investments/accounts', '/investments/stocks', '/investments/forex', '/investments/transfers', '/investments/analysis', '/reset-password']) {
  const response = await get(path);
  assert.equal(response.status, 303, `${path} must require sign-in`);
  assert.match(response.headers.get('location') ?? '', /^\/(?:\?|$)/);
}
assert.equal((await get('/session')).status, 401);
for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
  assert.equal((await get('/session', { method, headers: { Origin: 'https://untrusted.example' } })).status, 403);
}
assert.equal((await get('/auth/callback?next=http://[')).status, 303);
assert.equal((await get('/auth/callback?next=https://untrusted.example')).headers.get('location'), '/?auth=confirmation-failed');
console.log('PASS: public pages, security headers, 14 protected pages, session rejection, cross-origin requests and malformed callbacks');
