# Development

Use Node.js 24 (`.nvmrc`), Python 3 and the root npm lockfile. Dependencies are installed once from the repository root:

```sh
npm ci
```

## Build and preview

`npm run build` bundles the content script, worker, remote, panel and monitor drawing window into `dist/chrome-extension`, audits manifest permissions and records the build's source fingerprint. It replaces that generated output as part of normal local development. Git retains source; rebuildable bundles need no separate backup.

`npm run build -- --check` performs the same compilation and permission audit in memory without writing build files. It does not prepare files for preview or installation.

After building, `npm run preview` serves the fixture UI at `http://127.0.0.1:4173`. It reads existing build output, so rebuild to preview source changes. Stop the server with Ctrl+C. This preview has separate synthetic preferences and cannot authenticate or play video.

## Chrome installation and updates

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/chrome-extension`. Use the toolbar icon for the remote, then **New show**; opening YouTube TV first is unnecessary. Complete native sign-in if needed. Required access is storage and `https://tv.youtube.com/*`. Optional display access supplies monitor information for placement/drawing; optional scripting access reconnects the designated player with the packaged content script.

For updates, close the remote, build, Reload the existing extension entry, then reopen the remote. Keep the same extension entry/ID and storage. Known surviving windows are recovered; changed tab IDs or missing ownership require deliberate existing-player connection. If controls remain disconnected, use Connection or refresh the player normally. Do not reinstall or clear storage as a repair.

## Local build status

Checked October 25, 2026: local HEAD and GitHub main are `8376ee3`, extension **0.2.15**, with passing [hosted Ubuntu CI](CI.md#verified-execution). The expanded implementation was committed in `f9c85f1`; later commits updated documentation and dependencies. The private root npm package version (`0.1.0-beta.1`) and workspace package versions are bookkeeping; Chrome uses `apps/chrome-extension/manifest.json`.

The retained `dist/chrome-extension` also reports 0.2.15, but its recorded source fingerprint starts with `bc55c0b79f2b9e069`. The current in-memory build starts with `845ded4ccb9e078c1`. Comparing recorded inputs confirms older worker, remote, workspace, geometry, storage, shared UI and dependency inputs in the retained build. Matching version numbers do not establish matching source. Rebuild normally before the next local update, then follow the existing-entry update procedure above.

This audit passed strict typecheck and in-memory compilation/permission validation. It did not replace the retained bundle, install or Reload the extension, or inspect the installed runtime. Current installed identity and ordinary-use acceptance remain unverified.

## Tests

```sh
npm run typecheck
node --import tsx --test tests/ssot.test.ts
npm run docs:check
```

Choose affected test files for a focused change. `npm test` uses `scripts/test.mjs` to discover synthetic `.test.ts`/`.test.tsx` files recursively under tests/apps/packages, sharing CI's inventory. `npm run verify:source` combines typecheck, tests, in-memory build and docs checks. `npm run verify` also writes a new build; use it only when output replacement is intended. See [test coverage](../tests/README.md) and [CI](CI.md).

No tests use a live account. Observe live behavior manually when necessary; keep browser automation detached from protected playback. Compilation and mocks cannot confirm account allowance, visible video or heard audio.

## Maintenance

[Architecture](ARCHITECTURE.md) identifies module owners. Keep native selectors in the adapter and shared navigation/capacity/storage policy in their existing modules. Preserve public entry points and saved schemas. No formatter or ESLint policy is configured; TypeScript enforces strict types and unused symbols.

Keep credentials, personal state, generated output and internal working notes out of Git. Retain required fixtures and authored tools. The documentation checker validates repository Markdown links and workspace manifests, excluding ignored local files.

No environment variables or API keys are needed for the build, tests or fixture preview; `.env.example` documents this. Write generated reports to disposable output folders. Root `junit.xml`, `lcov.info` and `test-files.json` are also ignored.
