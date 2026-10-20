# Managed feed policy and audio

`src/policy.ts` owns the current four-total managed-feed ceiling, including pending creations, independently of account allowance; UI and worker Add/Connect use `canAddManagedFeed`. `src/index.ts` serializes mute-all-before-enable-one audio handoff and compensates failures. The Chrome worker owns actual tab/window/session lifecycle; this package does not compose protected streams. [Policy/audio tests](../../tests/ssot.test.ts) use synthetic ports and do not prove audible output or service capacity. See [architecture](../../docs/ARCHITECTURE.md).

`src/geometry.ts` owns logical outer-window area/layout geometry. Auto retains readability scoring; explicit Top/bottom deterministically divides exactly two players into full-width rows with an eight-unit gap. One fills; three/four retain automatic bounds and disclose the remembered pair preference. The remote preview and worker placement use the same planner.
