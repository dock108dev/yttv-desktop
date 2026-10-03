# YouTube TV Desktop Client

“YouTube TV provides the streams. We provide the desktop television experience.”

A local Chrome candidate provides compact navigation, saved preferences, truthful cached guide recovery and a managed-window route. [Sports discovery from the existing YouTube TV guide](NEXT_TASK.md) is implemented on candidate010/f24fa0471866e729 (83-test verification PASS): browse/search available sports programs and use guarded Watch/Add without additional setup. Real qualification is blocked by unavailable browser policy access after owner-reported reload. [C1-Q2](docs/evidence/runs/20261002-c1-q2/run.md) passed practical single-feed audio and15m23s dual managed windows on last-observed installed **v0.1.8 / a87877ca8e207785 / idaaiiafgopfpaojpnhaoefbefllioab**. Full beta acceptance remains PARTIAL.

YouTube TV retains authentication, entitlements, protected playback, delivery, DVR, ads and account management. The temporary overnight mute hold is retired. Player and tab mute are read back separately; site mute is UNKNOWN, routing does not prove audible sound, and saved layouts never restore audio authority. Managed windows disclose separate original players. No protected media is extracted, proxied or captured.

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

Current S2-G1 state: browser access RECOVERED; installed010/f24fa0471866e729/same ID VERIFIED. Stopped at cached legacy Upcoming/episodic matchup presentation regression; repaired **011/343f238d6223baf3, 84-test normal verification PASS**. One owner repair reload pending, then fresh real qualification. [Canonical next task](NEXT_TASK.md). Earlier browser denials retained historically; no provider setup or new permissions.
