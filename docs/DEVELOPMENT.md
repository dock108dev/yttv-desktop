# Local development workflow

Updated 2026-10-02. TypeScript, React, esbuild and a pinned npm lockfile support the local Chrome client. Safari/native remain placeholders. Local build is distinct from live playback or release qualification.

## Build and tests

```sh
cd /Users/michaelfuscoletti/Desktop/yttv-desktop
npm ci
npm run typecheck
npm test
npm run build
npm run docs:check
npm run preview
```

`dist/chrome-extension` contains the MV3 bundle. The build fails if host access expands beyond `https://tv.youtube.com/*` or the permission list differs from storage. The preview server binds only 127.0.0.1:4173 and serves the explicit fixture demo; it has no backend/auth/protected playback. Tests use synthetic fixtures and fake audio ports; they do not qualify real playback or provider correctness.

## Approved local Chrome installation

The user approved loading this local extension with tv.youtube.com access, tab controls and local preferences. Open chrome://extensions, enable developer mode if needed, choose Load unpacked and select `/Users/michaelfuscoletti/Desktop/yttv-desktop/dist/chrome-extension`. Use Reload after rebuilding. Refresh only test-created YouTube TV tabs so the content script runs. Open the native Live guide to observe channel candidates, then use the Desktop drawer. Normal YTTV account/player controls stay on the page.

No cookies, credentials, webRequest, capture, broad tabs permission or all-sites access is requested. Public ordinary watch-page hrefs are volatile in-memory navigation targets, not protected media URLs. Saved layouts retain channel/event IDs; fresh targets must be revalidated.

All real player/tab audio is locked muted overnight. Selecting a pane changes window focus only. Audible audio focus remains NOT RUN and cannot be silently enabled from imported preferences.

## Scope and fallbacks

The local client provides a dense observed guide and shared state/fixture Sports contracts. Sports fixture actions cannot resolve against live guide evidence. The multi-view fallback controls separate ordinary muted browser windows; it does not render protected streams inside the controller. The total watch-session cap is conservative and does not establish the account allowance. Four sessions are disabled pending verified allowance and reliability.

## Evidence and source of truth

[NEXT_TASK](../NEXT_TASK.md) owns the active task; [ROADMAP](ROADMAP.md) phase sequencing; [BACKLOG](BACKLOG.md) task state. [Run records](evidence/runs/README.md) list checks actually performed, limitations and environment. Do not infer beta readiness from a successful build or fixture test. Preserve failed runs and qualify repaired revisions separately.

Private local git only; no remote, push, publication, purchases or provider accounts. Ignore dependencies, dist, secrets, browser profiles and raw protected/private evidence. Do not log account identifiers, tokens or protected content. Do not modify siblings.
