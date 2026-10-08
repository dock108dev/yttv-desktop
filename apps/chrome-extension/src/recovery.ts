// Durable ownership/geometry backup only. Never a guide target or audio authority.
export const MANAGED_RECOVERY_KEY = 'yttv-desktop.managed-recovery.v1';
export const WORKSPACE_RECOVERY_KEY = 'yttv-desktop.workspace-recovery.v1';
export async function recoveredSession(api: typeof chrome, keys: string[]): Promise<Record<string, any>> {
  const session = await api.storage.session.get(keys);
  const backup = (await api.storage.local.get(WORKSPACE_RECOVERY_KEY))[WORKSPACE_RECOVERY_KEY] as Record<string, unknown> | undefined;
  return Object.fromEntries(keys.map(key => [key, session[key] === undefined ? backup?.[key] : session[key]]));
}
const writeQueues = new WeakMap<object, Promise<void>>();
export async function saveWorkspaceSession(api: typeof chrome, values: Record<string, unknown>) {
  await api.storage.session.set(values);
  const next = (writeQueues.get(api) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    const backup = (await api.storage.local.get(WORKSPACE_RECOVERY_KEY))[WORKSPACE_RECOVERY_KEY] as Record<string, unknown> | undefined;
    await api.storage.local.set({ [WORKSPACE_RECOVERY_KEY]: { ...backup, ...values } });
  });
  writeQueues.set(api, next); await next;
}
