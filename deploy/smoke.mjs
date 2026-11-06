import assert from 'node:assert/strict';
const base = process.argv[2];
const create = await fetch(base+'/rooms', {method:'POST', headers:{Authorization:'Bearer '+process.env.HOST_KEY}});
assert.equal(create.status,201);
const {id,write} = await create.json();
const url = base+'/rooms/'+id;
const data = {name:'App.tsx',language:'typescriptreact',text:'export default 42'};
const headers = {Authorization:'Bearer '+write};
try {
  assert.equal((await fetch(url,{method:'PUT',body:JSON.stringify(data)})).status,403);
  assert.equal((await fetch(url,{method:'PUT',headers,body:JSON.stringify(data)})).status,204);
  assert.deepEqual(await (await fetch(url)).json(),data);
} finally {
  assert.equal((await fetch(url,{method:'DELETE',headers})).status,204);
}
assert.equal((await fetch(url)).status,404);
console.log('Room lifecycle OK');
