# Development

Use Node.js 24 (`.nvmrc`), Python 3 and the root npm lockfile. CI selects Python 3.14. No environment variables or API keys are needed for the build, tests or fixture preview.

## Install dependencies

Run commands from the repository root:

```sh
npm ci
```

## Build and preview

```sh
npm run build
npm run preview
```

The build bundles the Chrome worker, remote, drawer, provider content scripts and monitor drawing window into `dist/chrome-extension`. It audits the exact manifest permissions and writes `build-identity.json`. The preview serves the existing output at `http://127.0.0.1:4173`; rebuild after source edits and stop the server with Ctrl+C. Preview preferences are separate from extension preferences. The preview cannot sign in or play video.

`npm run build -- --check` compiles and checks permissions in memory. It neither prepares preview files nor replaces an existing build. A normal build replaces generated output in place; bundles can be regenerated from source.

## Chrome installation and updates

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/chrome-extension`. Click the toolbar icon, then **New show**. Complete provider sign-in in the native window if needed. See [usage](../START_HERE.md) for controls and optional provider access.

For updates, close the remote, rebuild, Reload the existing extension entry, then reopen the remote. Keep the same extension ID and storage. Known surviving windows recover; changed tab IDs or missing ownership require explicit Connect. Use native controls or normal page refresh when reconnection is unavailable. Do not reinstall or clear storage as a repair.

Chrome's version comes from `apps/chrome-extension/manifest.json`. Root/workspace package versions are package bookkeeping. `build-identity.json` identifies generated inputs; matching version numbers alone do not prove a build matches current source. Neither compilation nor a build fingerprint identifies the revision currently loaded in Chrome.

## Tests

```sh
npm run typecheck
node --import tsx --test tests/ssot.test.ts
npm run docs:check
npm run build -- --check
```

Choose affected test files for a focused change. `npm test` discovers all synthetic `.test.ts`/`.test.tsx` files under tests, apps and packages. `npm run verify:source` combines strict types, all tests, in-memory compilation and docs checks. `npm run verify` also writes a new build; use it when output replacement is intended.

See [test coverage](../tests/README.md) and [CI](CI.md) for broader checks and reports. Automated checks use synthetic inputs; native playback, account access, audible output and physical monitor placement require user-operated review. Do not attach browser automation to protected playback.

## Contributing

Keep selectors and controls in service adapters, capacity/audio policy in quadbox, preference validation in storage, and serialized browser mutations in the Chrome worker. [Architecture](ARCHITECTURE.md) describes these boundaries. Preserve saved schemas, native account controls and unrelated tabs/windows.

Keep generated output, credentials and browser state out of Git. Required fixtures and authored assets belong in source control. Use portable repository paths in documentation, and run `npm run docs:check` after changing links or instructions.
