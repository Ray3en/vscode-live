import assert from 'node:assert/strict';
const base = process.argv[2];
const created = await fetch(base + '/rooms', { method: 'POST', body: JSON.stringify({ name: 'Smoke', files: { 'App.tsx': 'one' } }) });
assert.equal(created.status, 201);
const { id, write } = await created.json();
assert.match(id, /^\d{6}$/);
const url = `${base}/rooms/${id}`;
try {
  assert.equal((await fetch(url, { method: 'PUT', body: '{}' })).status, 403);
  const update = await fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${write}` }, body: JSON.stringify({ files: { 'App.tsx': 'two', 'api.ts': 'three' } }) });
  assert.equal(update.status, 200);
  assert.deepEqual((await (await fetch(url)).json()).files, { 'App.tsx': 'two', 'api.ts': 'three' });
} finally {
  assert.equal((await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${write}` } })).status, 204);
}
console.log('Room lifecycle OK');
