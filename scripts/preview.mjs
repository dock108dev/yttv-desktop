import { resolve } from 'node:path';
import { createFixturePreviewServer } from './preview-server.mjs';
const server = createFixturePreviewServer(resolve(import.meta.dirname, '../dist/chrome-extension'));
server.on('error', () => { console.error('Local fixture preview unavailable; check its loopback port.'); process.exitCode = 1; });
server.listen(4173, '127.0.0.1', () => console.log('Local fixture preview: http://127.0.0.1:4173 (no real playback)'));
