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

The overnight hold is retired. Installed v0.1.8/a87877ca8e207785 implements normal audio controls and serialized real main-plus-one routing;68-test verification retained. [C1-Q2](evidence/runs/20261002-c1-q2/run.md) single-feed audio and15m23s720p managed-window trial PASS after owner-confirmed existing-entry reload. Never reinstall/duplicate/reset storage. Player/tab readback differs from heard sound; site mute remains UNKNOWN. Saved layouts never restore audio authority.

## Scope and fallbacks

The local client provides a dense observed guide and shared state/fixture Sports contracts. Sports fixture actions cannot resolve against live guide evidence. The multi-view fallback controls the original main player plus one separately muted-on-create browser window; it does not render protected streams inside the controller. The total watch-session cap is conservative and does not establish the account allowance. Four sessions are disabled pending verified allowance and reliability.

## Evidence and source of truth

[NEXT_TASK](../NEXT_TASK.md) owns the active task; [ROADMAP](ROADMAP.md) phase sequencing; [BACKLOG](BACKLOG.md) task state. [Run records](evidence/runs/README.md) list checks actually performed, limitations and environment. Do not infer beta readiness from a successful build or fixture test. Preserve failed runs and qualify repaired revisions separately.

Current work is local; preserve the existing GitHub origin. No remote operations, push, publication, purchases or provider accounts are included in the active task. Ignore dependencies, dist, secrets, browser profiles and raw protected/private evidence. Do not log account identifiers, tokens or protected content. Do not modify siblings.

## Current identified disk candidate

Installed **v0.1.8 / a87877ca8e207785 / idaaiiafgopfpaojpnhaoefbefllioab**, [C1-Q2 inventory](evidence/runs/20261002-c1-q2/candidate.json),68-test verify retained with unchanged hashes. Practical single-feed audio and reduced two-feed viewing PASS; full release/beta checks remain grouped.

C1-Q1-R1 identifies installed v0.1.6 with source-input build ID a4fb694fb9dd7388; [inventory](evidence/runs/20261002-c1-q1-r1/candidate-016.json). Shortcuts displays runtime version/build and, in installed content, extension ID. Existing installation updates use **Reload on the existing entry**, preserving ID/preferences, followed by refresh of the designated test tab only. Current task does not use Remove/Load unpacked/clear storage. Owner performs extension management per NEXT_TASK. A version/build shown in the loopback fixture preview identifies preview files only. `build-identity.json` records exact input hashes; it does not inspect installed Chrome.

## NBA sports candidate — prepared, not installed

Use [the combined owner handoff](evidence/runs/20261002-s2-l1/permission-review.md) before activating new access. `npm run build` retains the existing storage + tv.youtube.com audit. `npm run build:sports-candidate` builds a separate explicitly unapproved candidate with the sole extra http://127.0.0.1:4318/* host. Do not load it as a duplicate extension. `npm run sports:relay` reads only the ignored private `.local/sports-provider.env` supplied by the owner; `.env.example` is a blank template. The relay serves one sports metadata route and contains the provider key only in its process. No provider request is made without that supplied configuration.
