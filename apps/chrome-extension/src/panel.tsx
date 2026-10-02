import { mountDesktop } from '../../../packages/ui/src/index';
import { createDemoBridge } from '../../../packages/ui/src/demo';
import { createClientBridge } from './bridge';

const mount = document.getElementById('root');
if (!mount) throw new Error('Desktop UI root is missing.');
const demo = document.documentElement.dataset.mode === 'demo';
const bridge = demo ? createDemoBridge() : createClientBridge();
mountDesktop(mount, bridge, { demo });
