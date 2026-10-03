import { createNBAProvider } from '../packages/sports-engine/src/balldontlie';
import { SportsEngine } from '../packages/sports-engine/src/index';
import { SportsPoller } from '../packages/sports-engine/src/live';
import { createSportsRelay, SPORTS_RELAY_PORT } from '../packages/sports-engine/src/relay';

const key = process.env.YTTV_NBA_API_KEY?.trim();
if (!key || /[\r\n]/.test(key)) {
  console.error('NBA access unavailable. Supply YTTV_NBA_API_KEY in the private project configuration.');
  process.exit(1);
}
const provider = createNBAProvider({ request: url => fetch(url, {
  headers: { Authorization: key }, redirect: 'error', signal: AbortSignal.timeout(10_000),
}) });
const server = createSportsRelay(new SportsPoller(new SportsEngine(provider)));
server.listen(SPORTS_RELAY_PORT, '127.0.0.1', () => console.log('NBA sports metadata relay ready on loopback port 4318. Acquisition is demand-driven.'));
server.on('error', () => { console.error('Sports relay unavailable; check its local port.'); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close());
