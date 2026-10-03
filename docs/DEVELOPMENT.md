# Development and repository maintenance

The current implementation is a restricted Chrome MV3 client with TypeScript, React and esbuild. Safari/macOS and event-resolver workspaces are non-executable future boundaries. [Architecture](ARCHITECTURE.md) identifies authoritative modules; Mixed-service playback, automatic layouts and four-feed operation are not implemented.

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
| `npm run build -- --check` | Compile all three browser entry points in memory; audit storage and tv.youtube.com access |
| `npm run docs:check -- --repository-only` | Portable repository docs/workspace check |
| `npm run docs:check` | Repository-local docs/workspace check |
| `npm run build` | Write a complete bundle and identity to `dist/chrome-extension` |
| `npm run verify` | Typecheck/tests, then **write the bundle**, then check local docs |
| `npm run preview` | Serve existing fixture assets on127.0.0.1:4173 |

## Build, fixture preview and installation

`npm run build` and `npm run verify` write `dist/chrome-extension`; source checks print the current input fingerprint without writing a bundle. `npm run preview` serves the existing bundle, so build before previewing changed source. If retaining an installed bundle, build and preview in a separate source copy. Build identity does not inspect installed Chrome.

The build rejects unknown flags and any permissions beyond storage/tv.youtube.com before writing. Preview serves only demo HTML/panel JS/CSS with the [local HTTP protections](SECURITY.md); it cannot authenticate, acquire provider data or play protected video. Port conflict produces a clear local error; stop the other fixture process or retry after it exits.

To install, open `chrome://extensions`, enable Developer mode and use **Load unpacked** to choose `dist/chrome-extension` in your checkout. For an existing entry, use **Reload** rather than removing/reinstalling; refresh the relevant YouTube TV tab so it receives the new content script. Retaining the same entry preserves its extension ID and local settings. Loading is separate from building and does not prove playback capability. [Usage](../START_HERE.md) explains controls and recovery.

## Pull-request CI

[CI workflow](../.github/workflows/ci.yml) runs the stable **Repository checks** job on PRs, main pushes and manual dispatch. One Ubuntu24.04 job uses Node22/Python3.14, locked `npm ci`, typecheck, tests, the in-memory build and portable docs check. npm caches downloads; installation is clean each run. No extra platform matrix is asserted by this offline gate.

SHA-pinned Actions, read-only contents permission, disabled checkout credential persistence, no secrets,15-minute timeout and superseded-run cancellation bound the job. Seven-day `ci-diagnostics` logs are retained after success/failure unless cancelled. Weekly [Dependabot](../.github/dependabot.yml) covers npm and Actions without automatic merging. Existing GitHub-managed CodeQL supplies **Analyze (python)** and **Analyze (javascript-typescript)**. Local checks do not establish a hosted result; inspect the jobs on the PR being reviewed.

## Repository hygiene and evidence

[Ignore rules](../.gitignore) exclude dependencies/builds/caches, credentials, local configuration, browser profiles, `.local` reviews and generated diagnostics. Authored source/assets, the lockfile, required tests/fixtures and concise Markdown run notes remain source inputs. Generated run artifacts and the historical setup inventory are local-only; missing artifact links are disclosed rather than treated as live proof. Do not delete local evidence, retained bundles or rollback candidates to tidy Git.

Documentation checking uses repository files only and records known historical artifact references; other external filesystem dependencies, broken repository links/anchors and missing required docs/workspaces fail. `.local` is excluded from scans/inventories. [Regression tests](../tests/docs-check.test.ts) exercise these boundaries with disposable repositories.

The worker keeps session lifecycle, audio and command ordering together in `background.ts`; `index.tsx` renders bridge snapshots. Shared navigation/feed/audio policies live in their packages. Changes to these boundaries need ordering/state coverage. Legacy saved identifiers remain readable and inert; changing them requires an explicit schema migration.

Working plans and status live in [NEXT_TASK](../NEXT_TASK.md), [BACKLOG](BACKLOG.md) and [ROADMAP](ROADMAP.md). Historical build identities/results live in [run records](evidence/runs/README.md); they are not setup prerequisites.
