# Setup verification

Historical initial setup record, prepared 2026-10-02 before the later implementation request. Statements below describe that initial commit only. Current implementation/live status is in the [run records](evidence/runs/README.md). This document describes the scope of the machine-readable [validation record](setup-validation.json), generated after the scaffold check and now retained locally only (untracked/ignored; it may be unavailable in a fresh checkout). It is setup evidence, not application evidence.

## Checks actually performed for this setup

Read-only Desktop convention and ancestor/skill inspection; dated official-source review; local file/Markdown-link/anchor validation; required-document and private-workspace manifest checks; template status/readiness checks; planned package/app path verification. The validation record contains the exact run time, local result, counts and file SHA-256 inventory (excluding itself and this explanatory file to avoid a self-hash cycle).

The initial setup handoff instructed the engineer to check that the project and Desktop tracker are real files at the intended paths, rerun the checker from Desktop, create the initial local git commit and verify clean main with no remotes. Those are historical instructions, not current actions. Current commands and GitHub CI are described in [Development](DEVELOPMENT.md).

## What was not run

- Product unit/fixture/browser tests (no implementation exists)
- Chrome/macOS playback, multi-session/audio/navigation/composition/performance tests
- Safari/macOS or Chrome/Windows qualification
- YouTube TV sign-in, entitlement/account inspection, credentials or provider API requests
- Protected capture, DRM experiments, native WKWebView playback
- Extension/browser/dependency installation, remote repository, push or publication
- Owner product acceptance or observed completion of the supplied Chrome MVP flow

The documents and directories originally prepared P0-A1. [NEXT_TASK](../NEXT_TASK.md) now owns Q3-B1; current readiness is recorded separately. Templates labeled NOT RUN have not become actual evidence merely because they parse successfully.
