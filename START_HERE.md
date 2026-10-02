# Start here

Updated 2026-10-02. The user expanded documentation setup into an overnight local Chrome implementation. The requested account was already signed in, and normal muted playback was observed. The [run record](docs/evidence/runs/20261002-local-beta/auth-baseline.md) states exactly what that establishes.

1. Read [Development](docs/DEVELOPMENT.md) for local build, load and fixture-preview instructions.
2. Read [NEXT_TASK](NEXT_TASK.md) for the active bounded qualification and stop conditions.
3. Read [PRODUCT](docs/PRODUCT.md) and [acceptance](docs/ACCEPTANCE_AND_TEST_PLAN.md) for the complete 18 criteria. A fixture Sports screen or managed-window fallback does not satisfy full live Sports/QuadBox acceptance.
4. Consult [Phase 0](docs/PHASE0_FEASIBILITY.md), [backlog](docs/BACKLOG.md), [decision log](docs/DECISIONS.md) and [sources](docs/SOURCES.md).

Every real test player stays muted overnight. Native YouTube TV controls remain accessible beneath the enhancement. If the extension fails, close its drawer or disable it and use normal playback.

Sports fixtures are illustrative; no production provider has been connected. Four-stream feasibility, audible audio handoff, Safari, Windows and native macOS remain separate unqualified gates. The Chrome core MVP spans guide/navigation, Sports/resolver and conditional QuadBox; Phase 1 single playback alone is an interim milestone.

The [Desktop tracker](../yttv_next_steps.md) points back here; the [documentation index](docs/README.md) lists the planning documents.
