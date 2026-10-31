# Netflix adapter

Conservative `ProviderAdapter` for canonical `https://www.netflix.com/title/DIGITS` and `/watch/DIGITS`, with 1–20 digits. Queue parsing preserves existing `trackId` canonicalization; the live bridge accepts canonical URLs only. A URL is intent, not native player identity.

All main-content identity/readiness, title-to-episode association, controls/readback and ended capabilities remain unknown. No selectors are guessed and no private globals, credentials or streams are inspected. The document session key is not a native-player key. All commands return attention without writes. Negative fixtures do not establish actual Netflix behavior.

See [provider integration](../../docs/ARCHITECTURE.md#provider-integration) and [permission boundaries](../../docs/SECURITY.md#optional-netflix-access).
