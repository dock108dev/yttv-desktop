import { mountDesktop } from '../../../../../packages/ui/src/index';
import { createDemoBridge } from '../../../../../packages/ui/src/demo';
import { unavailableSports } from '../../../../../packages/sports-engine/src/live';
const bridge = createDemoBridge();
const original = bridge.getSnapshot.bind(bridge);
bridge.getSnapshot = async () => { const base = await original(); return {...base,mode:'extension',connection:'unavailable',guide:[],statusMessage:'Offline interface review. No account, provider or playback connection.',sports:unavailableSports(),preferences:{...base.preferences,ui:{...base.preferences.ui,lastSurface:'SPORTS'}}}; };
mountDesktop(document.getElementById('root')!,bridge,{demo:false});
