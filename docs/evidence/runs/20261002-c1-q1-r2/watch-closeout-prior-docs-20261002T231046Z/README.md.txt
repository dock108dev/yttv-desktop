# YouTube TV Desktop Client

“YouTube TV provides the streams. We provide the desktop television experience.”

A local Chrome beta candidate is being built on this Mac. It surrounds the authorized YouTube TV player with compact navigation, local preferences, fixture-based Sports and a muted managed-window fallback. Existing-account authentication and two ordinary 720p players have been [observed with limits](docs/evidence/runs/20261002-local-beta/auth-baseline.md). [C1-Q1-R1](docs/evidence/runs/20261002-c1-q1-r1/run.md) identifies installed v0.1.6/a4fb694fb9dd7388 with 54 local tests PASS; single-playback foundation is PARTIAL at restart guide recovery. [R2 repair](docs/evidence/runs/20261002-c1-q1-r2/run.md) is locally verified on disk v0.1.7/9d07499eeceaf524 with 66 tests; replacement installed recovery awaits precise owner Version/Loaded from inspection and discrepancy resolution before any further reload. Full beta qualification remains open.

YouTube TV retains authentication, entitlements, protected playback, delivery, DVR, ads and account management. No protected media is extracted, proxied or captured. All test playback stays muted overnight.

Read [Start here](START_HERE.md), then the authoritative [next task](NEXT_TASK.md). The [Desktop tracker](../yttv_next_steps.md) is a pointer. [Development](docs/DEVELOPMENT.md) describes build/load instructions and evidence limits.

## Local build

```sh
cd /Users/michaelfuscoletti/Desktop/yttv-desktop
npm ci
npm run typecheck
npm test
npm run build
npm run preview
```

The build is in `dist/chrome-extension`. Chrome’s approved local extension uses only storage and tv.youtube.com host access. The fixture preview at http://127.0.0.1:4173 does not authenticate or play video. See the run record for which checks actually passed.

## Documentation

- [Product](docs/PRODUCT.md), [architecture](docs/ARCHITECTURE.md), [roadmap](docs/ROADMAP.md), [backlog](docs/BACKLOG.md)
- [Phase 0](docs/PHASE0_FEASIBILITY.md), [evidence](docs/evidence/README.md), [run records](docs/evidence/runs/README.md)
- [Provider evaluation](docs/PROVIDER_EVALUATION.md), [risks](docs/RISKS_AND_OPEN_QUESTIONS.md), [acceptance](docs/ACCEPTANCE_AND_TEST_PLAN.md)
- [Decision log](docs/DECISIONS.md), [official sources](docs/SOURCES.md), [initial setup verification](docs/SETUP_VERIFICATION.md)

Verified destination: `/Users/michaelfuscoletti/Desktop/yttv-desktop`, beside the other Desktop projects. Current local branch is main with an existing GitHub origin. The [handoff review](docs/evidence/runs/20261002-handoff-review/review.md) made no remote operations and selects installed Chrome foundation qualification next.
