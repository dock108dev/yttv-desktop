# Development and repository maintenance

**Paused by owner — 2026-10-03 EDT:** resume only on request.024 activation/retry is unconfirmed; follow [NEXT_TASK](../NEXT_TASK.md) for current-state observation, one-time activation if needed, explicit player recovery and the two-feed Add/Arrange check before the remaining four-player journey. No runtime work during pause.


**Current recovery checkpoint — 2026-10-03:**023 TV-area/start filled the requested area PASS OWNER_REPORTED. Owner then reports only NBC Add enabled after guide refresh, followed by Arrange failure “TV area or feed count is unavailable” and **0 /4 feeds**. Historical original tab is absent; two newer YTTV tabs exist but ownership/creation path is unqualified. No tab silently adopted or closed. Prepared **0.2.4 /1cdc745144268bcc**,116-test/typecheck/build/permission verification PASS: explicit existing-player choice when original missing, archived closed-original return record, no-playback/audio/movement during choice, useful missing-player error and disabled-channel explanations.023 retained. Installed repair NOT RUN; changed024 needs owner-only activation then Use this player → Start → Add/Arrange retry. [Evidence](evidence/runs/20261003-q3-b1-recovery/run.md). Two–four advancing, full controls/Return/stability and first-beta release remain OPEN; broader MVP separate; Prime/Netflix final deferred expansion.


**Current owner authorization — 2026-10-03:** approval of the muted workspace demonstration, existing-entry reload and native refresh are owner-confirmed complete. This supersedes earlier pending activation/approval instructions and the old paused-state baseline. Continue from the observed post-refresh state; no repeat approval/reload/refresh. Installed feature/count proof remains open. [Owner continuation](evidence/runs/20261003-q3-b1-r2/owner-continuation.md).

**Current engineering checkpoint — 2026-10-03:** prepared **0.2.2 /029d311113a6963f**, with **115/115 offline tests**, typecheck, production build/permission audit and docs PASS. Integrated remote → bridge → worker tests now cover four feeds, selected replacement, Close/reflow, native closure, reopen, restart and Return. Repaired Sports Replace, original/selected action labels, persistent feed numbers/selection, paused replacement labels and preservation of manual positioning. This is local fixture proof. The owner has now explicitly confirmed demonstration approval, extension reload and native refresh complete. Installed022 identity is to be recorded during the demonstration; workflow and advancing counts remain unqualified. Reobserve the current player after refresh instead of treating the old paused position as current. No repeat approval, reload or refresh is requested;109 current/retained candidate hashes matched in this review. [Repair and approved demonstration handoff](evidence/runs/20261003-q3-b1-r2/run.md).


**Current product direction —2026-10-03:** one compact remote creates/manages up to four TOTAL YTTV player windows as a readable automatically arranged workspace.021 /61a83fecdc9217c6 identity is owner-confirmed and source verification retained; integrated installed operation is unqualified. [New lead handoff](LEAD_ENGINEER_HANDOFF.md) supersedes the named-channel questionnaire. Preserve the current paused/muted state, complete available engineering first and request only necessary owner actions for a whole-workflow demonstration.

**Historical repair-stage disposition — 2026-10-03 (superseded by installed checkpoint above):** Q3-B1-R1 is COMPLETE for source/verification/freeze: **0.2.1 / 61a83fecdc9217c6**,113/113 offline tests, typecheck and production build/permission audit PASS. Healthy same-build dedupe, invalidated/different-build replacement and fresh usable current-build reconnect confirmation are covered.020 and017 rollback preserved. Changed021 owner-only activation/Connection observations are PENDING; one consolidated installed run remains OPEN for all four first-beta features and advancing counts. No native player/runtime/audio actions occurred. Prime/Netflix remain final deferred post-first-beta work, outside beta gates. This disposition supersedes earlier prospective reconnect-repair instructions; earlier candidate evidence retains its own scope. [Repair and installed run](evidence/runs/20261003-q3-b1-r1/run.md).

The current implementation is a restricted Chrome MV3 client with TypeScript, React and esbuild. Safari/macOS and event-resolver workspaces are non-executable future boundaries. [Architecture](ARCHITECTURE.md) identifies authoritative modules. Mixed-service playback is the final deferred post-first-beta expansion; no service adapters/access work is current. It remains unimplemented; remote/automatic layouts/four-feed capacity/TV area exist in the unqualified Q3-B1 candidate.

## Setup and source checks

Use Node22 from [.nvmrc](../.nvmrc), Python3.14 and the root npm lockfile. Run from the repository root:

```sh
npm ci
npm run verify:source
```

`verify:source` runs typecheck, offline tests, the in-memory production build/exact permission audit and portable documentation check. It does not replace `dist/chrome-extension`. Typecheck rejects unused locals/parameters. Tests use synthetic repositories, DOM/player fixtures and mocked Chrome; HTTP tests use temporary loopback servers. They do not access an owner account or provider.

The current build/tests/preview need no environment variables, API keys or backend. [.env.example](../.env.example) is informational. There is no existing formatter/linter command, hosted deployment or signing workflow.

Individual commands:

| Command | Effect |
| --- | --- |
| `npm run typecheck` | Strict TypeScript checks, including unused locals/parameters |
| `npm test` | Current offline test suite |
| `npm run build -- --check` | Compile all four browser entry points in memory; audit storage and tv.youtube.com access plus optional system.display/scripting |
| `npm run docs:check -- --repository-only` | Portable repository docs/workspace check |
| `npm run docs:check` | Repository-local docs/workspace check |
| `npm run build` | Write a complete bundle and identity to `dist/chrome-extension` |
| `npm run verify` | Typecheck/tests, then **write the bundle**, then check local docs |
| `npm run preview` | Serve existing fixture assets on127.0.0.1:4173 |

## Build, fixture preview and installation

`npm run build` and `npm run verify` write `dist/chrome-extension`; source checks print the current input fingerprint without writing a bundle. `npm run preview` serves the existing bundle, so build before previewing changed source. If retaining an installed bundle, build and preview in a separate source copy. Build identity does not inspect installed Chrome.

The build rejects unknown flags and any permissions beyond exact storage/tv.youtube.com and optional system.display/scripting before writing. Preview serves only demo HTML/panel JS/CSS with the [local HTTP protections](SECURITY.md); it cannot authenticate, acquire provider data or play protected video. Port conflict produces a clear local error; stop the other fixture process or retry after it exits.

To install, open `chrome://extensions`, enable Developer mode and use **Load unpacked** to choose `dist/chrome-extension` in your checkout. For an existing entry, use **Reload** rather than removing/reinstalling; for the preserved paused main, use the remote Connection → Reconnect original player optional scripting gesture instead of refreshing the native page. Retaining the same entry preserves its extension ID and local settings. Loading is separate from building and does not prove playback capability. [Usage](../START_HERE.md) explains controls and recovery.

## Pull-request CI

[CI workflow](../.github/workflows/ci.yml) runs the stable **Repository checks** job on PRs, main pushes and manual dispatch. One Ubuntu24.04 job uses Node22/Python3.14, locked `npm ci`, typecheck, tests, the in-memory build and portable docs check. npm caches downloads; installation is clean each run. No extra platform matrix is asserted by this offline gate.

SHA-pinned Actions, read-only contents permission, disabled checkout credential persistence, no secrets,15-minute timeout and superseded-run cancellation bound the job. Seven-day `ci-diagnostics` logs are retained after success/failure unless cancelled. Weekly [Dependabot](../.github/dependabot.yml) covers npm and Actions without automatic merging. Existing GitHub-managed CodeQL supplies **Analyze (python)** and **Analyze (javascript-typescript)**. Local checks do not establish a hosted result; inspect the jobs on the PR being reviewed.

## Repository hygiene and evidence

[Ignore rules](../.gitignore) exclude dependencies/builds/caches, credentials, local configuration, browser profiles, `.local` reviews and generated diagnostics. Authored source/assets, the lockfile, required tests/fixtures and concise Markdown run notes remain source inputs. Generated run artifacts and the historical setup inventory are local-only; missing artifact links are disclosed rather than treated as live proof. Do not delete local evidence, retained bundles or rollback candidates to tidy Git.

Documentation checking uses repository files only and records known historical artifact references; other external filesystem dependencies, broken repository links/anchors and missing required docs/workspaces fail. `.local` is excluded from scans/inventories. [Regression tests](../tests/docs-check.test.ts) exercise these boundaries with disposable repositories.

The worker keeps session lifecycle, audio and command ordering together in `background.ts`; `index.tsx` renders bridge snapshots. Shared navigation/feed/audio policies live in their packages. Changes to these boundaries need ordering/state coverage. Legacy saved identifiers remain readable and inert; changing them requires an explicit schema migration.

Working plans and status live in [NEXT_TASK](../NEXT_TASK.md), [BACKLOG](BACKLOG.md) and [ROADMAP](ROADMAP.md). Historical build identities/results live in [run records](evidence/runs/README.md); they are not setup prerequisites.

## Current candidate, workflow proof and release order

022 /029d311113a6963f is prepared and frozen with115-test verification.021 remains the last owner-confirmed installed identity;021/020/017 evidence and output are retained. Integrated remote/bridge/worker coverage now exercises the full muted fixture journey, selection/labels across reopen/restart, layout failure and manual positioning. [Exact repair and activation handoff](evidence/runs/20261003-q3-b1-r2/run.md).

Owner explicitly confirms muted demonstration approval, existing-entry reload and native refresh are complete. Do not repeat those steps or ask again. Observe current post-refresh playback and record runtime identity during the journey; Reconnect is needed only if controls are actually disconnected. Current-source proof does not qualify installed operation.

The extension-page inspection boundary remains; use only supported tools and minimal owner demonstration steps. Current paused/muted state is protected, but is not an obstacle to local implementation/fixture checks. The approved muted demonstration may change content/position; audio enable/transfer remains outside its scope. Return the same original where supported and leave it paused/player-muted at its then-current position. The earlier named-channel proposal remains superseded. [Current task](../NEXT_TASK.md).

First beta is YTTV only; Prime/Netflix remain the last deferred post-first-beta expansion after preceding planned work completes or is explicitly owner-deferred. Broader MVP and platform gates remain separately tracked.
