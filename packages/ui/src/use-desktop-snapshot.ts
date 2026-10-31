import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultPreferences } from '../../storage/src/index';
import type { ClientBridge, DesktopSnapshot } from './types';

function initialSnapshot(): DesktopSnapshot {
  return { mode: 'extension', connection: 'waiting', playback: { playing: null, muted: null }, guide: [], preferences: defaultPreferences(), panes: [], capabilities: { navigation: false, guide: false, managedWindows: false, audio: false } };
}

export function useDesktopSnapshot(bridge: ClientBridge) {
  const [snapshot, setSnapshot] = useState<DesktopSnapshot>(initialSnapshot);
  const live = useRef(true);
  const refresh = useCallback(async () => {
    try {
      const next = await bridge.getSnapshot();
      if (live.current) setSnapshot(next);
    } catch {
      if (live.current) setSnapshot(previous => ({ ...previous, connection: 'unavailable', statusMessage: 'The browser bridge is unavailable. Your YouTube TV player remains separate.' }));
    }
  }, [bridge]);
  useEffect(() => {
    live.current = true;
    void refresh();
    const unsubscribe = bridge.subscribe(() => { void refresh(); });
    return () => { live.current = false; unsubscribe(); };
  }, [bridge, refresh]);
  return [snapshot, refresh] as const;
}

