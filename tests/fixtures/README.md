# Planned fixture catalog

No fixture test has executed; these are future case definitions, not real events/provider payloads. Use [mapping template](../../docs/evidence/templates/mapping-case.md) and the [acceptance plan](../../docs/ACCEPTANCE_AND_TEST_PLAN.md).

Planned IDs: normal-live; guide-ended-one-hour-still-live; mlb-extra-innings; football-overtime; weather-delay; suspended-resumed; late-start-not-yet-live; postponed-new-makeup-id; fresh-final; stale-live; missing-provider; empty-live-feed-tracked-id; source-timestamp-old-fetched-now; midnight-local-date; multiple-broadcast-tie; moved-network; affiliate-name-variant; unavailable-channel; unknown-entitlement; stale-target; quad-final-pane; audio-transfer-failure; previous-only-after-confirmed-switch; layout-revalidation.

Each future fixture needs a synthetic provenance label, stable IDs/timestamps, explicit expected visibility/status/availability, resolver input/output and test revision. Avoid real account state or copyrighted provider payloads unless permitted and sanitized. Add focused runnable cases with the implementation; don't manufacture a passing fixture suite during documentation setup.
