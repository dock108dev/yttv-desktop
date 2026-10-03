# Sports discovery and fixtures

`src/guide.ts` classifies/searches authenticated guide program text; target eligibility delegates to the YouTube TV adapter. It does not infer live scores or game state. `src/index.ts` normalizes/searches explicit illustrative Fixture Lab events. No provider credentials, polling or external acquisition are part of current Sports. See [architecture](../../docs/ARCHITECTURE.md) and [guide tests](../../tests/guide-sports.test.ts).
