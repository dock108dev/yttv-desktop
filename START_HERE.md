# Start here

Prepared 2026-10-02. **Planning is ready; product feasibility remains untested.**

1. Read [PRODUCT](docs/PRODUCT.md) for the intended experience and preserved requirements.
2. Read [NEXT_TASK](NEXT_TASK.md) for exactly one bounded Phase 0 baseline.
3. Use [PHASE0_FEASIBILITY](docs/PHASE0_FEASIBILITY.md) to understand later gates and fallback decisions.
4. Copy the [session template](docs/evidence/templates/session.md) into a new dated run folder only when that run is actually started. The [evidence index](docs/evidence/README.md) explains evidence classes and sanitization.
5. Update the [decision log](docs/DECISIONS.md), [backlog](docs/BACKLOG.md) and next task after reviewing the evidence.

The setup performed here created documents and directories, checked their consistency, and initialized local git. There is no live session record and every playback/provider/browser test is **NOT RUN**. Browser versions, account stream allowance and channel entitlements have not been inspected.

The narrow next task is P0-A1: a later authorized Chrome/macOS two-session baseline using ordinary supported playback surfaces. It is a feasibility check, not the start of the full product. If the prerequisites are absent, record BLOCKED and stop.

The completed section 28 defines the Chrome core MVP: guide/navigation, Sports with actual game state, resolver, conditional arbitrary 2–4-feed QuadBox and the complete audio/expand/replace/final-game workflow. The [acceptance plan](docs/ACCEPTANCE_AND_TEST_PLAN.md) preserves all 18 user criteria and the representative flow. Safari is the next release gate; native macOS is a separate feasibility phase. Measurement budgets are engineering proposals, distinct from the user's requirements.

Find everything in the [documentation index](docs/README.md). The [Desktop tracker](../yttv_next_steps.md) always points back here.
