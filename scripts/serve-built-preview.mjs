// Local-only QA adapter for Nitro's built Cloudflare fetch handler. This does
// not deploy anything or modify the application's production server.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import worker from '../.output/server/index.mjs';
const root = resolve('.output/public');
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain' };
const assets = { async fetch(request) {
  const path = resolve(root, `.${new URL(request.url).pathname}`);
  if (!path.startsWith(`${root}/`)) return new Response('Not found', { status: 404 });
  try {
    const bytes = await readFile(path);
    return new Response(bytes, { headers: { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'public,max-age=3600' } });
  } catch { return new Response('Not found', { status: 404 }); }
} };
createServer(async (incoming, outgoing) => {
  try {
    const url = `http://127.0.0.1:5176${incoming.url}`;
    const request = new Request(url, { headers: incoming.headers });
    const response = await worker.fetch(request, { ASSETS: assets }, { waitUntil(promise) { void promise.catch(() => undefined); } });
    const headers = Object.fromEntries(response.headers);
    let bytes = Buffer.from(await response.arrayBuffer());
    if (/javascript|text|json/.test(headers['content-type'] || '') && incoming.headers['accept-encoding']?.includes('gzip')) {
      bytes = gzipSync(bytes); headers['content-encoding'] = 'gzip'; delete headers['content-length'];
    }
    outgoing.writeHead(response.status, headers); outgoing.end(bytes);
  } catch (error) { console.error(error); outgoing.writeHead(500); outgoing.end('Preview error'); }
}).listen(5176, '127.0.0.1', () => console.log('Built preview: http://127.0.0.1:5176'));
