import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const assets = new Map([['/demo.html', 'text/html'], ['/panel.js', 'application/javascript'], ['/panel.css', 'text/css']]);
/** Synthetic public assets only; loopback is not an authorization boundary on its own. */
export function createFixturePreviewServer(root, host = '127.0.0.1:4173') {
  return createServer(async (req, res) => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" };
    const send = (status, body = '', type = 'text/plain') => {
      res.writeHead(status, { ...headers, 'Content-Type': type }); res.end(body);
    };
    if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== `http://${host}`) ||
        req.headers['sec-fetch-site'] === 'cross-site') return send(403, 'Forbidden');
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'Method unavailable');
    let path;
    try {
      const url = new URL(req.url, `http://${host}`);
      if (url.origin !== `http://${host}` || url.search) return send(404, 'Not found');
      path = decodeURIComponent(url.pathname); if (path === '/') path = '/demo.html';
    } catch { return send(400, 'Invalid path'); }
    const type = assets.get(path); if (!type) return send(404, 'Not found');
    try {
      const canonicalRoot = await realpath(root);
      const file = await realpath(resolve(root, `.${path}`));
      if (dirname(file) !== canonicalRoot) return send(403, 'Forbidden');
      const bytes = await readFile(file);
      return send(200, req.method === 'HEAD' ? '' : bytes, type);
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return send(404, 'Not found');
      console.warn('YTTV_PREVIEW_UNAVAILABLE'); return send(500, 'Preview unavailable');
    }
  });
}
