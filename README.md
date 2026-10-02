# YouTube TV Desktop Client

“YouTube TV provides the streams. We provide the desktop television experience.”

Status: **documentation and directory scaffold only**, prepared 2026-10-02. There is no runnable application, extension, playback harness or sports integration yet. No sign-in, installation, provider provisioning or live streaming test has been performed.

This project plans a modern desktop interface over authorized YouTube TV: a compact guide, previous/favorite/recent channels, independent sports discovery by actual game state, and conditional event-centric multiview. YouTube TV retains authentication, entitlements, protected playback, delivery, DVR, ads and account management.

Read [Start here](START_HERE.md), then the authoritative [next task](NEXT_TASK.md). The [Desktop tracker](../yttv_next_steps.md) is a short pointer; detailed status lives in this repository.

## Documentation

- [Product brief](docs/PRODUCT.md) — organized requirements and complete user acceptance
- [Architecture](docs/ARCHITECTURE.md) — boundaries, interfaces and proposed data models
- [Roadmap](docs/ROADMAP.md) and [backlog](docs/BACKLOG.md) — phases, priorities and dependencies
- [Phase 0 feasibility plan](docs/PHASE0_FEASIBILITY.md) and [evidence templates](docs/evidence/README.md)
- [Provider evaluation](docs/PROVIDER_EVALUATION.md), [risks and questions](docs/RISKS_AND_OPEN_QUESTIONS.md)
- [Acceptance and test plan](docs/ACCEPTANCE_AND_TEST_PLAN.md), [decision log](docs/DECISIONS.md)
- [Official source notes](docs/SOURCES.md), [development workflow](docs/DEVELOPMENT.md), [setup verification](docs/SETUP_VERIFICATION.md)

## Local setup

Verified destination: `/Users/michaelfuscoletti/Desktop/yttv-desktop`, alongside the existing Desktop projects. This is a private local git repository on `main`; no remote is configured. Proposed TypeScript/React workspaces are documented under `apps/` and `packages/`, with private placeholder manifests and no dependencies. No build system has been selected or installed.

Run the documentation check from this directory:

```sh
python3 scripts/check_docs.py
```

It validates local links, workspace placeholders and evidence-template readiness. It does not validate external service behavior or run playback tests. See [development](docs/DEVELOPMENT.md) for the distinction.
