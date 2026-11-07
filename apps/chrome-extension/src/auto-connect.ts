import { CURRENT_MANAGED_FEED_LIMIT } from '../../../packages/quadbox/src/policy';
import type { ActionResult } from '../../../packages/ui/src/types';
export interface DetectedPlayer { id: number; label: string }
interface Host {
  detect(): Promise<DetectedPlayer[]>;
  controlled(): number[];
  capacity(): number;
  hasOriginal(): Promise<boolean>;
  blocked(): boolean;
  verifyControlled?(id: number): Promise<boolean>;
  connect(id: number, original: boolean): Promise<ActionResult>;
}
/** One bounded pass. The worker validates identities and serializes every connection. */
export async function autoConnectPlayers(host: Host): Promise<ActionResult> {
  let detected: DetectedPlayer[];
  try { detected = await host.detect(); }
  catch { return { ok: false, code: 'DETECTION_FAILED', reason: 'Could not check open YouTube TV players. Retry detection; your windows are unchanged.' }; }
  const candidates = detected.filter(p => !host.controlled().includes(p.id));
  if (host.capacity() + candidates.length > CURRENT_MANAGED_FEED_LIMIT)
    return { ok: false, code: 'TOO_MANY_PLAYERS', reason: `${detected.length} YouTube TV players detected. The remote supports four total players. Close extras or choose which players to connect below; no extra players were connected automatically.` };
  if (host.blocked()) return { ok: false, code: 'RECOVERY_REQUIRED', reason: 'Finish the interrupted opening or restore access to saved settings, then retry detection. Your current players are unchanged.' };
  const errors: string[] = [];
  if (host.verifyControlled) for (const player of detected.filter(p => host.controlled().includes(p.id))) {
    try { if (!await host.verifyControlled(player.id)) errors.push(`${player.label}: Controls are unavailable. Allow reconnect access or refresh this player when convenient, then retry detection.`); }
    catch { errors.push(`${player.label}: Controls could not reconnect. Retry detection or use native controls.`); }
  }
  for (const player of candidates) {
    try {
      if (host.controlled().includes(player.id)) continue;
      const result = await host.connect(player.id, !await host.hasOriginal());
      if (!result.ok) errors.push(`${player.label}: ${result.reason ?? 'Connection could not be confirmed.'}`);
    } catch { errors.push(`${player.label}: Connection failed. Retry detection or use its native controls.`); }
  }
  return errors.length ? { ok: false, code: 'CONNECTION_FAILED', reason: errors.join(' ') } : { ok: true };
}
