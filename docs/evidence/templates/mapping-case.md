# Event mapping case template — NOT RUN

Status: NOT RUN. Synthetic inputs may be designed here, but no implementation has executed them yet.

- Case ID / requirement / source revision: TBD
- Evidence class: FIXTURE / REPLAY / LIVE — choose and explain
- League / namespaced provider event ID / event identity: TBD
- Scenario: normal / OT / extra innings / delay / overrun / late start / multi-broadcast / moved network / stale / final / other
- Observation/fetch/source-update time (UTC) / freshness budget: TBD
- scheduledStart / scheduledEnd / actual state/statusDetail / score/period/clock: TBD
- Original network/channel / current broadcast candidates / source and timestamp: TBD
- Guide candidates / team-program names / league/start match / provenance: TBD
- Available user channel and entitlement state: UNKNOWN
- Supported target and current playback confirmation: UNKNOWN
- Resolver score components / conflicts / margin / resolution state: TBD
- Expected visible group, status/freshness label and Watch/Add eligibility: TBD
- Actual output / observed behavior: NOT RUN
- Result and missing/ambiguous evidence: NOT RUN
- Sanitized evidence references and stop reason: NONE

Critical case: scheduledEnd is one hour ago, fresh actual state remains active; expected discoverable event with eligible confirmed target. A fixture establishes logic only when implemented/tested, never actual live availability. Unknown/stale input must not fabricate finality, score or target.
