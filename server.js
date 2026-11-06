const http = require('node:http');
const { randomBytes } = require('node:crypto');

const rooms = new Map();
const key = () => randomBytes(24).toString('hex');
const secret = process.env.HOST_KEY || key();
const idleLimit = 90000;

function expire() {
  for (const [id, room] of rooms) {
    if (Date.now() - room.active > idleLimit) rooms.delete(id);
  }
}
setInterval(expire, 15000).unref();

const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const send = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(data === undefined ? undefined : JSON.stringify(data));
  };
  if (req.method === "GET" && req.url === "/healthz") return send(200, { status: "ok" });
  const auth = req.headers.authorization;
  if (req.url === '/rooms' && req.method === 'POST') {
    if (auth !== 'Bearer ' + secret) return send(403);
    expire();
    if (rooms.size >= 100) return send(503);
    const id = key(), write = key();
    rooms.set(id, { write, version: 0, snapshot: null, active: Date.now() });
    return send(201, { id, write });
  }
  const match = /^\/rooms\/([0-9a-f]{48})$/.exec(req.url);
  const room = match && rooms.get(match[1]);
  if (!room) return send(404);
  if (req.method === 'GET') {
    const etag = '"' + room.version + '"';
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) return send(304);
    return send(200, room.snapshot);
  }
  if (auth !== 'Bearer ' + room.write) return send(403);
  if (req.method === 'DELETE') {
    rooms.delete(match[1]);
    return send(204);
  }
  if (req.method !== 'PUT') return send(405);
  try {
    let bytes = 0;
    const chunks = [];
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 2 * 1024 * 1024) return send(413);
      chunks.push(chunk);
    }
    if (bytes) {
      const data = JSON.parse(Buffer.concat(chunks).toString());
      if (typeof data.text !== 'string' || typeof data.name !== 'string' ||
          typeof data.language !== 'string') return send(400);
      room.snapshot = { text: data.text, name: data.name, language: data.language };
      room.version++;
    }
    room.active = Date.now();
    send(204);
  } catch {
    send(400);
  }
});
server.listen(Number(process.env.PORT || 7341), process.env.BIND || '127.0.0.1', () => {
  console.log('Code Stream listening on', server.address());
  if (!process.env.HOST_KEY) console.log('Host key for this run:', secret);
});
