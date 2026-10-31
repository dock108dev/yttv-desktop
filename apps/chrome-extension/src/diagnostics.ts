import { CURRENT_MANAGED_FEED_LIMIT } from '../../../packages/quadbox/src/policy';
import type { DesktopSnapshot } from '../../../packages/ui/src/types';

/** Static codes only: never accept exceptions, messages, URLs or page/provider payloads. */
export type FailureCode =
  | 'PREFERENCES_READ_FAILED'
  | 'PREFERENCES_WRITE_FAILED'
  | 'SESSION_READ_FAILED'
  | 'SESSION_WRITE_FAILED'
  | 'AUDIO_LOG_WRITE_FAILED'
  | 'RESTORE_AUDIO_FAILED'
  | 'WINDOW_CLEANUP_FAILED'
  | 'TAB_CLOSE_FAILED'
  | 'GUIDE_SYNC_FAILED'
  | 'COMMAND_FAILED'
  | 'NOTIFY_FAILED'
  | 'CONTEXT_INVALIDATED'
  | 'BRIDGE_FAILED'
  | 'CLEANUP_FAILED'
  | 'INVALID_COMMAND'
  | 'INVALID_SENDER';

export function createFailureDiagnostics(clock = () => new Date().toISOString()) {
  const rows = new Map<FailureCode, { code: FailureCode; count: number; firstAt: string; lastAt: string }>();
  return {
    record(code: FailureCode) {
      const at = clock();
      const previous = rows.get(code);
      const row = { code, count: (previous?.count ?? 0) + 1, firstAt: previous?.firstAt ?? at, lastAt: at };
      rows.set(code, row);
      // Log first occurrence and powers of two; counters retain every failure within this context.
      if (row.count === 1 || Number.isInteger(Math.log2(row.count))) {
        console.warn(`YTTV_FAILURE ${code}`, { ...row });
      }
    },
    snapshot: () => [...rows.values()].map(row => ({ ...row })),
  };
}

/** Select bounded diagnostic fields; restored text never grants control or enters snapshots verbatim. */
export function restoredAudioDiagnostics(priorLog: unknown): NonNullable<DesktopSnapshot['audioDiagnostics']> {
  if (!Array.isArray(priorLog)) return [];
  return priorLog.slice(-16).filter(row => row &&
    typeof row.at === 'string' && row.at.length <= 40 && Number.isFinite(Date.parse(row.at)) &&
    typeof row.workerStartedAt === 'string' && row.workerStartedAt.length <= 40 && Number.isFinite(Date.parse(row.workerStartedAt)) &&
    typeof row.muted === 'boolean' && Number.isInteger(row.feeds) && row.feeds >= 0 && row.feeds <= CURRENT_MANAGED_FEED_LIMIT &&
    ['main', 'added'].includes(row.source) && ['main', 'added', 'none'].includes(row.authority) &&
    ['requested', 'confirmed', 'failed'].includes(row.result)).map(row => ({ at: row.at, workerStartedAt: row.workerStartedAt,
      source: row.source, cause: 'restored audio request', muted: row.muted, feeds: row.feeds, authority: row.authority, result: row.result }));
}
