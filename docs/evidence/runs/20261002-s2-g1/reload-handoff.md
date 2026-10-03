# S2-G1 — one prepared owner reload

Candidate **v0.1.10 / f24fa0471866e729**, normal verification PASS (**83 tests**, typecheck/build/existing-permission audit/docs). Installed candidate identity is not yet observed.

In the existing Chrome profile at chrome://extensions, reload only **YouTube TV Desktop — Local Beta**, existing ID **idaaiiafgopfpaojpnhaoefbefllioab**, already loaded from `/Users/michaelfuscoletti/Desktop/yttv-desktop/dist/chrome-extension`. Keep the current YouTube TV tab open and do not refresh it yet. Do not Remove, Load unpacked, duplicate the entry or reset storage. Report reload done; the agent refreshes only the designated tab and qualifies Sports once browser access is restored.

Extension management remains owner-only per [NEXT_TASK](../../../../NEXT_TASK.md). This candidate requests only existing storage and tv.youtube.com access. No key, account provisioning or local service is required. [Candidate](candidate.json), [baseline rollback018](rollback-installed-018/build-identity.json). If rollback is needed, restore those retained018 files to the existing load directory and owner reload that same entry; do not change its ID/storage.

Browser live inspection is currently blocked by an unavailable admin-policy check. Reload does not itself prove that check is restored. No candidate Watch/Add or live acceptance is claimed.

Owner reported **Reloaded** (recorded UTC 2026-10-03T01:18:35.590417+00:00). Extension reload step is complete by owner report. Subsequent supported page reload was denied by the unavailable admin-policy check. Do not repeat extension reload; next step is supported browser access recovery, then main-tab refresh and installed identity/live qualification.
