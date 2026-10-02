# Official source notes

Reviewed public official documentation on 2026-10-02 UTC. No authenticated service, provider API or live stream was used. Findings below are public-documentation evidence only; recheck time-sensitive policies/limits before execution. Descriptions of implications are planning inferences, explicitly separated from vendor statements.

| Source | Documented finding | Boundary / planning inference |
| --- | --- | --- |
| [YouTube TV multiview help](https://support.google.com/youtubetv/answer/13418774?co=GENIE.Platform%3DDesktop&hl=en) | The computer help page says native multiview is unavailable in a browser; add-on content requires relevant subscription | Does not establish that independent browser sessions or a custom composition route work or are permitted. Check current docs again before a later test |
| [YouTube TV membership overview](https://tv.youtube.com/welcome/) | Describes up to three simultaneous streams with membership and unlimited home streams through the 4K Plus add-on | Account, location, content/add-on exceptions and other household usage must be checked; no purchase or account access here. Four is not assumed |
| [YouTube TV supported devices](https://support.google.com/youtubetv/answer/7129767?hl=en) | Describes computer support and Safari/Chrome troubleshooting | Does not qualify installed browser versions, extension augmentation, protected capture or WKWebView |
| [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) | Content scripts operate in isolated execution environments and can exchange messages with extension components | Plan a narrow bridge; DOM access is no stable YouTube TV API contract |
| [Chrome Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) | Provides persistent extension UI alongside browsing | Candidate navigation surface; no proof of embedded protected-player compatibility |
| [Chrome tabCapture](https://developer.chrome.com/docs/extensions/reference/api/tabCapture) | Access to a current-tab media stream is initiated after user invokes the extension | No documented YouTube TV protected-video allowance/compatibility established by this source; capture remains gated |
| [Apple Safari extensions](https://developer.apple.com/safari/extensions/) | Documents converting other-browser web extensions into a Safari project | Supports investigating shared code; not proof of identical browser APIs or YTTV playback |
| [Apple WKWebView](https://developer.apple.com/documentation/webkit/wkwebview) | Defines a native web-content view; detailed page body was limited by dynamic rendering | No YTTV authenticated/DRM/multiview compatibility conclusion. Native spike remains unverified |
| [TheSportsDB API](https://www.thesportsdb.com/free_sports_api) | Describes free JSON sports data and premium keys/two-minute livescores | Actual initial-league live/broadcast coverage, state accuracy, limits and intended-use rights unverified |
| [SportsDataIO developer overview](https://sportsdata.io/developers) | Trial is scrambled; Discovery Lab is next-day delayed; commercial Leagues API is a separate real-time product | Scrambled/replay/delayed data cannot qualify actual current live game state; complete per-league rights/coverage/cost review before selection |
| [Sportradar NBA status workflow](https://developer.sportradar.com/basketball/docs/nba-ig-game-status-workflow) | Delayed games can resume under the same ID or become postponed; makeup events use new IDs | Useful NBA normalization evidence only; don't generalize identity/state details across leagues |

No claim is made that existing YES/FOX/ESPN examples are carried for this user, that an official YTTV integration API exists, that protected frames can be captured/recomposed, or that a given provider plan covers every required league/network/state. No legal permission opinion was inferred from a browser API page.

## Local convention evidence

Read-only inspection found Desktop siblings `beat-mario`, `dex`, `italian`, `prediction-arb`, `savings`, plus `mario_next_steps.md`, `dex_next_steps.md`, `italy_next_steps.md`, `prediction_arb_next_steps.md` and `savings_next_steps.md`. Inspected Dex tracker and Savings/Italian planning docs use explicit current status, evidence limits, milestones and a bounded next action. No source code or private user data was needed.

Applicable ancestor paths were checked for AGENTS.md; none contained instructions. `/Users/michaelfuscoletti/.codex/AGENTS.md` was present and empty. A hidden-file scan found no AGENTS.md or `.agents` skill files in the inspected Desktop projects or setup workspace, and relevant home/Desktop `.agents` locations were absent. Therefore no project-specific skill was applied to this new folder. The runtime local Codex memory summary was read only as historical convention background and was corroborated against current Desktop files.

The Library skill routed this explicitly local Desktop request to local tools. This setup does not create a Library copy or cloud Page. New project AGENTS.md records the ongoing boundaries in this repository.
