# Project instructions

Read README.md, NEXT_TASK.md and the documents relevant to the requested change. NEXT_TASK.md owns the active task; docs/ROADMAP.md owns phase sequencing and docs/BACKLOG.md owns item status. The Desktop yttv_next_steps.md is a pointer, not an independent backlog.

This is currently a documentation-first project. Keep new work bounded to the current user request. Installation, account access, sign-in, live playback, capture, provider provisioning, remote repository work and publication require a task that expressly includes those actions. Documentation setup alone does not include them.

Preserve authorized YouTube TV playback and account controls. No DRM decryption, protected-stream proxying, credential extraction, reverse engineering of DRM or account/platform restriction circumvention. Capability failure must produce an explicit unavailable result and a supported fallback.

Keep YouTube TV selectors and browser details inside packages/yttv-adapter and the app browser bridges. Sports state is independent of DOM-derived guide data. Evidence must identify its revision, environment, timestamp, method, scope and class; fixtures and documentation checks never establish live playback feasibility. Do not log credentials, tokens, signed playback URLs or protected content.

Use the lightweight documentation check for planning edits. Add focused behavior tests when implementation exists. Update status with tests actually run, planned tests, limitations and a bounded next task. Do not modify sibling projects.
