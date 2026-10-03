# Tests

`npm test` runs local fixture/unit, synthetic DOM and mocked Chrome cases; it has no live account/provider/player operations. Tests compile current source. `tests/ssot.test.ts` guards shared limits/navigation, unsupported commands/build options, inert saved schema and audio compensation/serialization. UI and worker tests protect guide program actions, cached/unavailable states, settings/history and keyboard isolation.

Use `npm run typecheck` and `npm run build -- --check` for compilation/permission validation while the installed candidate remains frozen. `npm run build` writes output and is reserved for authorized candidate preparation.

[Acceptance](../docs/ACCEPTANCE_AND_TEST_PLAN.md), [fixture catalog](fixtures/README.md), [module authority](../docs/ARCHITECTURE.md) and [run records](../docs/evidence/runs/README.md) distinguish local checks from actual playback and owner acceptance.

`tests/docs-check.test.ts` uses Python3 and disposable synthetic repositories to protect portable CI documentation checks, default repository-local checking and broken-link/anchor failures. Use Python3.14 for the CI runtime.
