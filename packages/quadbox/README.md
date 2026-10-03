# Managed feed policy and audio

`src/policy.ts` owns the current two-total managed-feed ceiling, independently of account allowance. `src/index.ts` serializes mute-all-before-enable-one audio handoff and compensates failures. The Chrome worker owns actual tab/window/session lifecycle; this package does not compose protected streams. [Policy/audio tests](../../tests/ssot.test.ts) use synthetic ports and do not prove audible output or service capacity. See [architecture](../../docs/ARCHITECTURE.md).
