# YouTube TV Desktop Client

A Chrome extension with a compact remote for up to four native YouTube TV and YouTube player windows, including the original. It keeps video and account controls in YouTube TV while managing playback controls, audio and window placement.

- Queue supported YouTube TV and ordinary YouTube links, then explicitly play the next item.
- Open, arrange and control up to four native player windows with the compact remote.
- Save screen layouts, manage guide channels and recover known windows after Reload.
- Prime Video and Netflix currently support counted native attention windows; their playback controls and identity remain unavailable.

Requires Google Chrome, Node.js 24 and Python 3 for development. Watching requires your own provider access; the four-window software limit does not establish account playback allowances. Safari/native clients and independent sports scores are not implemented.

See [usage](START_HERE.md) for controls and [architecture](docs/ARCHITECTURE.md) for implementation boundaries.

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
