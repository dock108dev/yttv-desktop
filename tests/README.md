# Tests

Run `npm test` for fixture/domain, guide/navigation boundaries and fake Chrome safety/recovery cases. Run `npm run typecheck` and `npm run build` separately; the build audits permissions. Domain tests cover state truthfulness, mapping ambiguity, confirmed history, persistence and mute-only/fake audio transitions. Adapter tests use synthetic DOM. Chrome tests use mocked APIs and a fresh service-worker context.

See [acceptance](../docs/ACCEPTANCE_AND_TEST_PLAN.md), [fixture catalog](fixtures/README.md) and [run records](../docs/evidence/runs/README.md) for planned versus actual scope. Passing synthetic tests does not qualify real provider data, entitlement, DRM, playback, audible handoff or beta acceptance.
