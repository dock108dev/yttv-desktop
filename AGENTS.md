# Project instructions

Read README.md and the documentation relevant to the change. Use repository-owned instructions and portable paths. Keep changes focused on the Chrome YouTube TV client; do not modify sibling projects.

Keep native selectors and player controls in the YouTube TV adapter, capacity/audio policy in quadbox, and preference sanitation in storage. The Chrome worker owns managed identities and serialized browser mutations. Preserve saved schemas, native account controls and unrelated tabs/windows.

Do not decrypt DRM, proxy protected streams, extract credentials or bypass account/platform restrictions. Unavailable capabilities return a clear failure and native fallback. Synthetic tests do not establish playback, entitlements or provider state.

Preserve current player mute/volume choices. Focus, placement and recovery must not enable or transfer audio. Live account/player operations, capture, installation, extension Reload and publishing require a task that includes them. Do not attach browser automation to protected playback; live feedback is user-operated. Preserve the existing extension ID/storage during authorized updates; do not reinstall or clear storage as a recovery shortcut.

Run `npm run docs:check` for documentation changes. For behavior changes, use strict typecheck and meaningful focused tests. `npm run build -- --check` compiles without replacing a retained build. Avoid full CI, live-service or release campaigns unless warranted by the task. Do not commit or push unless requested.
