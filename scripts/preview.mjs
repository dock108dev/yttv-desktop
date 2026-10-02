import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(import.meta.dirname, '../dist/chrome-extension');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  const path = resolve(root, '.' + (pathname === '/' ? '/demo.html' : decodeURIComponent(pathname)));
  if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    if (!(await stat(path)).isFile()) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(path));
  } catch { res.writeHead(404).end('Not found'); }
}).listen(4173, '127.0.0.1', () => console.log('Local fixture preview: http://127.0.0.1:4173 (no real playback)'));
