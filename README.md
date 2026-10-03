# YouTube TV Desktop Client

A local Chrome extension for browsing the observed YouTube TV guide, finding Sports programs and controlling the original player plus one managed window. YouTube TV owns playback, sign-in and account controls. Guide-based Sports needs no API key; independent live scores are not supplied.

## Quickstart

Requirements: Node22 ([.nvmrc](.nvmrc)), npm, Python3.14 and desktop Chrome for the extension.

```sh
npm ci
npm run verify:source
npm run build
npm run preview
```

Open `http://127.0.0.1:4173` for the illustrative interface. Preview cannot sign in or play video. To use the extension, load `dist/chrome-extension` through Chrome's **Load unpacked** control, then open YouTube TV normally. [Development](docs/DEVELOPMENT.md) covers build effects and updating an existing installation; [usage](START_HERE.md) explains Guide, Sports and audio controls.

`verify:source` checks types, offline tests, compilation/permissions and docs without writing output. `build` replaces the bundle in `dist/chrome-extension`; keep a separate source copy when preserving an existing installed bundle. No environment variables or backend are needed.

## Support and limits

Current code supports YouTube TV only, with two total managed feeds and separate native player windows. Four-feed layouts, automatic tiling, monitor selection, Prime Video/Netflix and Safari/native clients are not implemented. Window count does not prove account concurrency allowance. Sports text comes from guide listings and does not confirm live game state.

The retained installed-build evidence concerns **v0.1.17 / 50a15df68eb2c3db**; newer source changes are separately checked. Offline tests are not installed-playback or release qualification. See [readiness evidence](docs/evidence/runs/20261002-c1-rg2/run.md) for the observed scope.

## Documentation

- [Development and CI](docs/DEVELOPMENT.md), [architecture](docs/ARCHITECTURE.md)
- [Security](docs/SECURITY.md), [failure recovery](docs/ERROR_HANDLING.md)
- [Documentation index](docs/README.md), [evidence](docs/evidence/README.md)

Protected streams and credentials are never extracted or proxied. Native account/player controls stay available; saved layouts grant no audio authority.
