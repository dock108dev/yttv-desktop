# YouTube TV Desktop Client

A Chrome extension with a compact remote for up to four native YouTube TV player windows, including the original. It keeps video and account controls in YouTube TV while managing playback controls, audio and window placement.

- Press **New show** to open YouTube TV on your last channel, or the first available live channel—even with no player open. Add up to four shows from the remote.
- Remove windows, change channels, and use native Play/Pause and volume controls.
- Use **Arrange shows** for one to four shows: stacked, side by side, grid, a larger main show, or your own positions.
- Draw your TV area or each show’s box at full size on the chosen monitor, then reuse the saved layout.
- Choose a TV area, arrange windows automatically or manually, and Expand/Restore them.
- Return the original to its previous window where supported.
- Recover known windows after extension Reload; explicitly connect other existing players.
- Search native guide listings and discover sports programs from their text.

Requires Google Chrome, Node.js 24 and Python 3 for development. Watching requires your own YouTube TV access. The four-window software limit does not establish your account's simultaneous playback allowance. Safari/native clients, other streaming services and independent sports scores are not implemented.

## Quickstart

From the repository root:

```sh
npm ci
npm run build
npm run preview
```

Open `http://127.0.0.1:4173` for the illustrative fixture preview. It cannot sign in or play video. Building writes `dist/chrome-extension`; rebuild it in place during local development.

Load or update the extension from `dist/chrome-extension` following [development](docs/DEVELOPMENT.md#chrome-installation-and-updates). See [usage](START_HERE.md) for the remote and native sign-in flow.

## Checks

```sh
npm run typecheck
npm test
npm run docs:check
npm run build -- --check
```

The last command compiles in memory without replacing build output. Tests use synthetic data and mocked browsers; they do not prove live playback or entitlements.

[Documentation](docs/README.md) · [Architecture](docs/ARCHITECTURE.md) · [Troubleshooting](docs/ERROR_HANDLING.md) · [Security](docs/SECURITY.md) · [CI](docs/CI.md)
