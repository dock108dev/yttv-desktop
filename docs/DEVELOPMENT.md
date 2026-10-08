# Development

Use Node.js 22 (`.nvmrc`), Python 3 and the root npm lockfile. Dependencies are installed once from the repository root:

```sh
npm ci
```

## Build and preview

`npm run build` bundles the content script, worker, remote and panel into `dist/chrome-extension`, audits manifest permissions and records the build's source fingerprint. It replaces that output, so retain any needed existing bundle first.

`npm run build -- --check` performs the same compilation and permission audit in memory without writing build files. It does not prepare files for preview or installation.

After building, `npm run preview` serves the fixture UI at `http://127.0.0.1:4173`. It reads existing build output, so rebuild to preview source changes. Stop the server with Ctrl+C. This preview has separate synthetic preferences and cannot authenticate or play video.

## Chrome installation and updates

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/chrome-extension`. Open YouTube TV and use the toolbar icon for the remote. Required access is storage and `https://tv.youtube.com/*`. Optional display access supplies monitor information; optional scripting access reconnects the designated player with the packaged content script.

For updates, close the remote, build, Reload the existing extension entry, then reopen the remote. Keep the same extension entry/ID and storage. Known surviving windows are recovered; changed tab IDs or missing ownership require deliberate existing-player connection. If controls remain disconnected, use Connection or refresh the player normally. Do not reinstall or clear storage as a repair.

## Tests

```sh
npm run typecheck
node --import tsx --test tests/ssot.test.ts
npm run docs:check
```

Choose affected test files for a focused change. `npm test` runs all synthetic tests. `npm run verify:source` combines typecheck, tests, in-memory build and docs checks. `npm run verify` also writes a new build; use it only when output replacement is intended. See [test coverage](../tests/README.md) and [CI](CI.md).

No tests use a live account. Observe live behavior manually when necessary; keep browser automation detached from protected playback. Compilation and mocks cannot confirm account allowance, visible video or heard audio.

## Maintenance

[Architecture](ARCHITECTURE.md) identifies module owners. Keep native selectors in the adapter and shared navigation/capacity/storage policy in their existing modules. Preserve public entry points and saved schemas. No formatter or ESLint policy is configured; TypeScript enforces strict types and unused symbols.

Keep credentials, personal state, generated output and internal working notes out of Git. Required fixtures and authored tools remain source inputs. The documentation checker validates deliverable Markdown links and workspace manifests without reading private trackers or generating inventories.
