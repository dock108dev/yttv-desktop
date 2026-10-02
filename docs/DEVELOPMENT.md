# Local development workflow

Current project is planning-only. No dependency install, runnable extension, Swift project, application server or playback harness exists. Python 3 and git were found on this Mac; browser versions are uninspected. TypeScript/React/MV3 are proposed choices, not installed libraries or verified runtime behavior.

## Tree and entry points

`apps/` contains chrome-extension, safari-extension and macos placeholders. `packages/` contains core, ui, sports-engine, yttv-adapter, event-resolver, quadbox and storage placeholders. Each has a private manifest/README describing its role. The root manifest declares workspace paths but no dependencies, entry points or build command. Native placeholder manifest is only workspace bookkeeping; it does not imply Swift is an npm app.

`tests/fixtures/` is a planned case catalog; there are no implemented product tests. `docs/evidence/templates/` contains unexecuted record templates. `docs/evidence/runs/README.md` is empty-run guidance, not a session result. `scripts/check_docs.py` is the only implemented utility and performs offline scaffold/document checks.

```sh
cd /Users/michaelfuscoletti/Desktop/yttv-desktop
python3 scripts/check_docs.py
git status --short
```

Do not run npm install merely to inspect the plan: there are no dependencies. The optional root `docs:check` script calls the same Python checker. A runtime toolchain, dependency versions, lockfile and build/test scripts should be chosen in C1-01 after relevant feasibility gates and only within the requested implementation scope.

## Sources of truth

README/START_HERE route readers. NEXT_TASK owns the active bounded task. ROADMAP owns phase sequence. BACKLOG owns task status. DECISIONS retains rationale and evidence references. The Desktop `yttv_next_steps.md` is a pointer with the same next task and readiness; update it when the active task changes. Avoid independently maintained duplicate detailed plans.

For planning edits, check local links/readiness and read the affected documents. For behavior changes, add/run focused relevant tests and record fixture versus browser/live evidence. For a future experiment, use a new immutable dated run folder, record source revision/environment, complete the session/matrix, then update the decision and next task. If repaired, retain failed evidence and qualify the new revision separately.

## Repository and evidence hygiene

Private local git on main; no remote, push, GitHub repo, publication or scheduled automation. Initial commit records this planning baseline. Ignore node_modules/build outputs, local environment/secrets, browser profiles, raw captures and scratch evidence. Commit only sanitized reviewed measurements and metadata; ignore rules alone cannot make a secret safe. Do not embed credentials, protected content or signed playback URLs in a Markdown record.

No sibling project is a dependency. Do not copy another project's acceptance counts, runtime state or release authority. Git status/link validation does not establish playback qualification or product acceptance.
