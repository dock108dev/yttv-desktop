# Chrome extension

The root build bundles content, background worker, remote and panel entries into `dist/chrome-extension`. Content mounts an isolated Shadow DOM launcher. The worker owns validated commands, windows and storage; the remote manages up to four native player windows including the original.

The manifest requires storage and YouTube TV page access. Optional display access supports area selection; optional scripting reconnects the designated player using the packaged content script. Native account/player controls stay available.

Guide actions require fresh observed watch targets. Added windows are muted before navigation. Explicit audio selection uses shared mute-before-enable policy; focus, recovery and placement preserve audio choices. Worker restart recovers verified ownership rather than recreating players or replaying audio enable.

[Development](../../docs/DEVELOPMENT.md) · [Usage](../../START_HERE.md) · [Architecture](../../docs/ARCHITECTURE.md)
