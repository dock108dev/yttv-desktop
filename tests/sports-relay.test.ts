import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { once } from 'node:events';
import { createSportsRelay, SPORTS_EXTENSION_ORIGIN } from '../packages/sports-engine/src/relay';
import { unavailableSports } from '../packages/sports-engine/src/live';

test('sports relay accepts only its fixed metadata route and extension origin, never proxy bodies or cookies', async () => {
  let acquisitions = 0;
  const server = createSportsRelay({ async refresh() { acquisitions++; return unavailableSports('ACCESS_REQUIRED'); } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address() as { port: number };
  const send = (path: string, method = 'GET', origin: string | undefined = SPORTS_EXTENSION_ORIGIN, host = '127.0.0.1:4318') => new Promise<{ status: number; body: string; cors?: string }>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: address.port, path, method, headers: { Host: host, ...(origin ? { Origin: origin } : {}) } }, res => {
      let body = ''; res.on('data', data => { body += data; }); res.on('end', () => resolve({ status: res.statusCode!, body, cors: res.headers['access-control-allow-origin'] as string | undefined }));
    }); req.on('error', reject); req.end();
  });
  try {
    const allowed = await send('/v1/nba/snapshot'); assert.equal(allowed.status, 200); assert.equal(allowed.cors, SPORTS_EXTENSION_ORIGIN);
    for (const denied of [await send('/v1/nba/snapshot', 'GET', 'https://tv.youtube.com'), await send('/v1/nba/snapshot', 'GET', 'https://evil.example'), await send('/v1/nba/snapshot', 'GET', undefined, 'evil.example'), await send('/v1/nba/snapshot?url=https://video.example'), await send('/v1/nba/snapshot', 'POST'), await send('/auth')]) assert.ok(denied.status >= 400);
    assert.equal(acquisitions, 1); assert.doesNotMatch(allowed.body, /Authorization|cookie|secret/i);
  } finally { server.close(); await once(server, 'close'); }
});
