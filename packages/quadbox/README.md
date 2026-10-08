# Managed feed policy and audio

`src/policy.ts` owns the current four-total managed-feed ceiling, including pending creations, independently of account allowance; UI and worker Add/Connect use `canAddManagedFeed`. `src/index.ts` serializes mute-all-before-enable-one audio handoff and compensates failures. The Chrome worker owns actual tab/window/session lifecycle; this package does not compose protected streams. [Policy/audio tests](../../tests/ssot.test.ts) use synthetic ports and do not prove audible output or service capacity. See [architecture](../../docs/ARCHITECTURE.md).
