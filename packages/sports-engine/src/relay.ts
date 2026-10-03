import { createServer, type Server } from 'node:http';
import type { SportsPoller } from './live';

export const SPORTS_RELAY_PORT = 4318;
export const SPORTS_EXTENSION_ORIGIN = 'chrome-extension://idaaiiafgopfpaojpnhaoefbefllioab';
/** Fixed loopback metadata route. No arbitrary URLs, request bodies, video, cookies or account auth. */
export function createSportsRelay(poller: Pick<SportsPoller, 'refresh'>): Server {
  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    const send = (status: number, value: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        ...(origin === SPORTS_EXTENSION_ORIGIN ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}) });
      response.end(JSON.stringify(value));
    };
    if (request.headers.host !== `127.0.0.1:${SPORTS_RELAY_PORT}` || (origin && origin !== SPORTS_EXTENSION_ORIGIN)) return send(403, { error: 'FORBIDDEN' });
    if (request.method !== 'GET' || request.url !== '/v1/nba/snapshot') return send(404, { error: 'UNAVAILABLE' });
    try { send(200, await poller.refresh()); }
    catch { send(503, { error: 'UNAVAILABLE' }); } // Never serialize provider errors/keys/payloads.
  });
}
