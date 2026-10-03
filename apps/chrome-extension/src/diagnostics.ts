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
        console.warn('YTTV_FAILURE', { ...row });
      }
    },
    snapshot: () => [...rows.values()].map(row => ({ ...row })),
  };
}
