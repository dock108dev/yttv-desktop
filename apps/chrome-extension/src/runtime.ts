/** Extension reloads invalidate old isolated worlds even while the host page survives. */
export function isInvalidatedContext(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /extension context invalidated|extension context.*(?:invalid|unavailable)|context invalidated/i.test(message);
}
export function createExtensionLifecycle() {
  let active = true; let invalidated = false;
  const cleanups = new Set<() => void>(); const invalidationListeners = new Set<() => void>();
  const safely = (callback: () => void) => { try { callback(); } catch { /* Cleanup can itself encounter the dead extension context. */ } };
  const cleanup = () => { for (const callback of cleanups) safely(callback); cleanups.clear(); };
  const invalidate = () => {
    if (!active) return;
    active = false; invalidated = true;
    for (const callback of invalidationListeners) safely(callback);
    invalidationListeners.clear(); cleanup();
  };
  return {
    get active() { return active; },
    get invalidated() { return invalidated; },
    invalidate,
    async guard<T>(operation: () => T | Promise<T>): Promise<T | undefined> {
      if (!active) return undefined;
      try {
        const value = await operation();
        return active ? value : undefined;
      } catch (error) {
        // The operation is invoked INSIDE try: promise.catch alone cannot catch a synchronous API throw.
        if (isInvalidatedContext(error)) invalidate();
        return undefined;
      }
    },
    addCleanup(callback: () => void) {
      if (!active) { safely(callback); return () => undefined; }
      cleanups.add(callback); return () => cleanups.delete(callback);
    },
    onInvalidated(callback: () => void) {
      if (invalidated) { safely(callback); return () => undefined; }
      invalidationListeners.add(callback); return () => invalidationListeners.delete(callback);
    },
    dispose() { if (!active) return; active = false; invalidationListeners.clear(); cleanup(); },
  };
}
export type ExtensionLifecycle = ReturnType<typeof createExtensionLifecycle>;
