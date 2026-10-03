# S2-L1 — one combined access and reload handoff

**Live delivery is blocked. The preparation is complete.** Installed playback remains v0.1.8 / a87877ca8e207785 / idaaiiafgopfpaojpnhaoefbefllioab. The NBA Free key is missing and the new local metadata permission is unapproved. These are one combined activation handoff, not separate viewing qualification tasks.

Review candidate: **v0.1.9 / 57058bd9d522e2bd**, [bundle inventory](candidate.json), [manifest](candidate-019-sports-bundle/manifest.json), [source decision](source-decision.md). Its directory is `/Users/michaelfuscoletti/Desktop/yttv-desktop/dist/sports-permission-candidate`. This candidate is **not installed**. The standard candidate **v0.1.9 / 9ed7cd8afadd5013** remains storage + tv.youtube.com only and performs zero sports requests without approved host access.

Exact requested addition to host_permissions:

```json
"http://127.0.0.1:4318/*"
```

Storage and https://tv.youtube.com/* remain the only existing permissions. No provider host, all-URLs, tabs, cookies, Google-auth or capture permission is added. Code requests just NBA JSON at `/v1/nba/snapshot`; Chrome ignores the host-permission path restriction. The relay binds only 127.0.0.1 port 4318, returns normalized sports metadata, rejects arbitrary routes/methods/website origins and never proxies streams. Provider authorization exists only in the local relay process.

## Owner access action

1. Use your own [BALLDONTLIE account](https://app.balldontlie.io/) to obtain an **NBA Free** key. If necessary, create the free account yourself and review its terms. Do not activate a trial or paid plan. The documented tier costs $0 and permits five requests/minute.
2. Copy project `.env.example` to `/Users/michaelfuscoletti/Desktop/yttv-desktop/.local/sports-provider.env`, set YTTV_NBA_API_KEY privately, and restrict that file to your user (mode 600). Keep the key out of chat, extension settings, screenshots and evidence. This path is ignored by Git and never bundled.
3. Confirm approval of the exact loopback host permission above. Then engineering can start `npm run sports:relay`, stage the reviewed candidate into the existing Loaded from folder and provide the single same-entry reload. Do **not** load the candidate as a duplicate unpacked extension or clear storage. After the owner reload, refresh only the designated YouTube TV page and verify v0.1.9 / 57058bd9d522e2bd / the existing ID in Shortcuts.

The agent has not provisioned an account, started authorized acquisition, applied new permissions, staged the sports candidate over the approved install directory or reloaded the installed extension. Standard-build verification temporarily wrote v0.1.9 to dist; the approved Loaded from folder was then restored byte-for-byte to v0.1.8. A copy of the original v0.1.8 bundle is retained for rollback. Ordinary playback was left unchanged, with the drawer closed again after identity inspection.

## Use after that handoff

Open Desktop → Sports. Search an NBA team, see the returned event, supplied score/state and retrieval/source-time labels. Yesterday/today/tomorrow are the initial schedule window. Other leagues remain unavailable; Fixture Lab is explicitly separate. If no NBA game is live, qualify the schedule/search path honestly and leave active-game qualification open.

For Watch/Add, observe the native Live guide first. Actions need a single fresh eligible NBA matchup with both teams; a network name is insufficient. Missing league/team corroboration or stale/cached observations leave the event visible with Watch/Add unavailable. Watch targets the main player; Add opens at most one muted managed feed and preserves the provider event ID. Navigation request and observed advancing playback are separate results. Do not repeat the completed 15m23s viewing trial unless a playback defect appears.

## Still unobserved

Actual NBA API contents, schedule completeness/current scoring, source latency, real team search and separately mapped Watch/Add on the installed candidate. No assertion is made about whether any game is currently live. Delay/overtime/suspension tests are synthetic replay only. Full U01–U18 and beta acceptance remain open.

[Offline UI review](offline-sports-unavailable.png) is visibly labeled not installed and contains no provider acquisition or protected playback.
