const http = require('node:http');
const { randomBytes } = require('node:crypto');

const rooms = new Map();
const idleLimit = 12 * 60 * 60 * 1000;
const jsonLimit = 2 * 1024 * 1024;
const token = () => randomBytes(24).toString('hex');
const code = () => String(100000 + Math.floor(Math.random() * 900000));
function expire() { for (const [id, room] of rooms) if (Date.now() - room.active > idleLimit) rooms.delete(id); }
setInterval(expire, 60000).unref();
function visible(id, room) { return { id, name: room.name, files: room.files, version: room.version, active: room.active }; }
function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(data === undefined ? undefined : JSON.stringify(data));
}
async function body(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > jsonLimit) throw Object.assign(new Error('too large'), { status: 413 }); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); }
  catch { throw Object.assign(new Error('invalid json'), { status: 400 }); }
}
function validFiles(files) {
  const entries = files && typeof files === 'object' && !Array.isArray(files) ? Object.entries(files) : [];
  return entries.length <= 100 && entries.every(([name, text]) => name && name.length <= 240 && typeof text === 'string');
}
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/healthz') return send(res, 200, { status: 'ok' });
    if (req.method === 'POST' && req.url === '/rooms') {
      expire(); if (rooms.size >= 1000) return send(res, 503, { error: 'room limit' });
      const data = await body(req);
      if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 80) return send(res, 400, { error: 'invalid name' });
      let id; do id = code(); while (rooms.has(id));
      const write = token();
      rooms.set(id, { name: data.name.trim(), write, files: validFiles(data.files) ? data.files : { 'index.ts': '// Код занятия\n' }, version: 1, active: Date.now() });
      return send(res, 201, { id, write, room: visible(id, rooms.get(id)) });
    }
    const match = /^\/rooms\/(\d{6})$/.exec(req.url);
    const room = match && rooms.get(match[1]);
    if (!room) return send(res, 404, { error: 'Комната не найдена' });
    if (req.method === 'GET') {
      const etag = `"${room.version}"`; res.setHeader('ETag', etag);
      if (req.headers['if-none-match'] === etag) return send(res, 304);
      room.active = Date.now(); return send(res, 200, visible(match[1], room));
    }
    if (req.headers.authorization !== `Bearer ${room.write}`) return send(res, 403, { error: 'read only' });
    if (req.method === 'DELETE') { rooms.delete(match[1]); return send(res, 204); }
    if (req.method !== 'PUT') return send(res, 405, { error: 'method' });
    const data = await body(req);
    if (data.name !== undefined && (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 80)) return send(res, 400, { error: 'invalid name' });
    if (data.files !== undefined && !validFiles(data.files)) return send(res, 400, { error: 'invalid files' });
    if (data.name !== undefined) room.name = data.name.trim(); if (data.files !== undefined) room.files = data.files;
    room.version++; room.active = Date.now(); return send(res, 200, visible(match[1], room));
  } catch (error) { send(res, error.status || 500, { error: error.status ? error.message : 'internal error' }); }
});
server.listen(Number(process.env.PORT || 7341), process.env.BIND || '127.0.0.1', () => console.log('Efir listening on', server.address()));
