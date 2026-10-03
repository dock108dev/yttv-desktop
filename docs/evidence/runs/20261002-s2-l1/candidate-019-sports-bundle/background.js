// packages/core/src/index.ts
var EVENT_STATUSES = [
  "SCHEDULED",
  "PREGAME",
  "LIVE",
  "DELAYED",
  "HALFTIME",
  "OVERTIME",
  "EXTRA_INNINGS",
  "SUSPENDED",
  "FINAL",
  "POSTPONED",
  "CANCELLED",
  "UNKNOWN"
];
var ACTIVE_STATUSES = /* @__PURE__ */ new Set(["LIVE", "HALFTIME", "OVERTIME", "EXTRA_INNINGS"]);
var HELD_STATUSES = /* @__PURE__ */ new Set(["DELAYED", "SUSPENDED"]);
var DEFAULT_FRESHNESS_POLICY = {
  fetchMaxAgeMs: 9e4,
  sourceMaxAgeMs: 9e4,
  futureClockSkewMs: 3e4,
  uncertainRetentionMs: 2 * 60 * 6e4
};
function timestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function isoNow(now = Date.now()) {
  return new Date(now instanceof Date ? now.getTime() : now).toISOString();
}
function freshnessOf(event, now = Date.now(), policy = {}) {
  const limits = { ...DEFAULT_FRESHNESS_POLICY, ...policy };
  const fetched = timestamp(event.fetchedAt);
  const updated = timestamp(event.sourceUpdatedAt);
  if (fetched === null || fetched > now + limits.futureClockSkewMs) return "UNKNOWN";
  if (event.freshness === "UNKNOWN") return "UNKNOWN";
  if (event.freshness === "STALE" || now - fetched > limits.fetchMaxAgeMs) return "STALE";
  if (event.sourceUpdatedAt !== null && (updated === null || updated > now + limits.futureClockSkewMs)) return "UNKNOWN";
  if (updated !== null && now - updated > limits.sourceMaxAgeMs) return "STALE";
  return "FRESH";
}
function normalizeText(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}
function isPlaybackTarget(value) {
  if (!value || typeof value !== "object") return false;
  const target = value;
  if (target.kind !== "navigation" || typeof target.channelId !== "string" || !target.channelId || typeof target.url !== "string" || target.url.length > 8192 || timestamp(target.verifiedAt) === null || !["LIVE", "FIXTURE", "REPLAY"].includes(String(target.evidenceClass))) return false;
  try {
    const url = new URL(target.url);
    if (url.protocol !== "https:" || url.hostname !== "tv.youtube.com" || url.port || url.username || url.password || url.hash) return false;
    if (!/^\/(?:watch(?:\/[^/?#]+)?|live)(?:\/)?$/.test(url.pathname)) return false;
    if ([...url.searchParams.entries()].some(([key, value2]) => !["v", "channel", "channelId", "vp", "vpp"].includes(key) || value2.length > 4096)) return false;
    return true;
  } catch {
    return false;
  }
}

// packages/sports-engine/src/index.ts
function nullableText(value) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 300) : null;
}
function team(value) {
  if (!value || typeof value.id !== "string" || !value.id.trim() || typeof value.name !== "string" || !value.name.trim()) throw new Error("Event requires named home and away teams with stable IDs.");
  return {
    id: value.id,
    name: value.name.trim(),
    ...nullableText(value.shortName) ? { shortName: value.shortName } : {},
    ...Array.isArray(value.aliases) ? { aliases: value.aliases.filter((alias) => typeof alias === "string").slice(0, 30) } : {}
  };
}
function scoreValue(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
function normalizeEvent(input, options = {}) {
  if (!input.id || !input.league || input.scheduledStart !== null && timestamp(input.scheduledStart) === null) throw new Error("Event requires a stable ID, league and valid or unknown scheduled start.");
  const status = EVENT_STATUSES.includes(input.status) ? input.status : "UNKNOWN";
  const now = options.now ?? Date.now();
  const evidenceClass = ["FIXTURE", "REPLAY", "LIVE"].includes(String(input.evidenceClass)) ? input.evidenceClass : options.evidenceClass ?? "REPLAY";
  return {
    id: input.id,
    league: input.league,
    homeTeam: team(input.homeTeam),
    awayTeam: team(input.awayTeam),
    scheduledStart: input.scheduledStart === null ? null : new Date(input.scheduledStart).toISOString(),
    scheduledEnd: timestamp(input.scheduledEnd) !== null ? new Date(input.scheduledEnd).toISOString() : null,
    status,
    statusDetail: nullableText(input.statusDetail),
    score: input.score ? { home: scoreValue(input.score.home), away: scoreValue(input.score.away) } : null,
    period: nullableText(input.period),
    clock: nullableText(input.clock),
    broadcastNetworks: Array.isArray(input.broadcastNetworks) ? input.broadcastNetworks.filter((network) => network && nullableText(network.name)).map((network) => ({
      name: network.name.trim(),
      ...nullableText(network.networkId) ? { networkId: network.networkId } : {},
      ...nullableText(network.source) ? { source: network.source } : {},
      ...timestamp(network.observedAt) !== null ? { observedAt: network.observedAt } : {}
    })) : [],
    originalChannel: input.originalChannel ? { ...input.originalChannel } : null,
    currentChannel: input.currentChannel ? { ...input.currentChannel } : null,
    // Provider input cannot grant playback eligibility. Resolution uses a current observed guide instead.
    yttvTarget: null,
    providerEventId: input.providerEventId || input.id,
    source: input.source || options.source || "unverified",
    fetchedAt: timestamp(input.fetchedAt) !== null ? new Date(input.fetchedAt).toISOString() : isoNow(now),
    sourceUpdatedAt: timestamp(input.sourceUpdatedAt) !== null ? new Date(input.sourceUpdatedAt).toISOString() : null,
    freshness: ["FRESH", "STALE", "UNKNOWN"].includes(String(input.freshness)) ? input.freshness : "UNKNOWN",
    evidenceClass
  };
}
function mergeEventSnapshots(previous, incoming) {
  const events = new Map(previous.map((event) => [event.id, event]));
  for (const next of incoming) {
    const old = events.get(next.id);
    if (!old) {
      events.set(next.id, next);
      continue;
    }
    const oldFetched = timestamp(old.fetchedAt) ?? -Infinity;
    const nextFetched = timestamp(next.fetchedAt) ?? -Infinity;
    const oldUpdated = timestamp(old.sourceUpdatedAt);
    const nextUpdated = timestamp(next.sourceUpdatedAt);
    if (nextFetched < oldFetched || oldUpdated !== null && nextUpdated !== null && nextUpdated < oldUpdated) continue;
    if (old.source !== next.source || old.evidenceClass !== next.evidenceClass) continue;
    events.set(next.id, next);
  }
  return [...events.values()];
}

// packages/event-resolver/src/index.ts
function leagueKey(value) {
  const text = normalizeText(value);
  if (["ncaa football", "ncaaf", "college football", "ncaa fbs", "ncaa fcs"].includes(text)) return "ncaa football";
  return text;
}
function isFreshAt(value, now, maxAge) {
  const time = timestamp(value);
  return time !== null && time <= now + 3e4 && now - time <= maxAge;
}
function nameInProgram(team2, title) {
  const names = [team2.name, team2.shortName ?? "", ...team2.aliases ?? []].map(normalizeText).filter((name) => name.length >= 3);
  const padded = ` ${normalizeText(title)} `;
  return names.some((name) => padded.includes(` ${name} `));
}
function resolveEvent(event, entries, options = {}) {
  const now = options.now ?? Date.now();
  const minimum = options.minimumConfidence ?? 0.85;
  const margin = options.minimumMargin ?? 0.15;
  const candidates = [];
  for (const entry of entries) {
    const provenance = [];
    const reasons = [];
    const conflicts = [];
    let confidence = 0;
    const channelNames = [entry.channel.name, ...entry.channel.aliases ?? []].map(normalizeText);
    const networkMatches = event.broadcastNetworks.filter((network) => !!network.networkId && !!entry.channel.networkId && network.networkId === entry.channel.networkId || channelNames.includes(normalizeText(network.name)));
    const exactChannel = event.currentChannel?.id === entry.channel.id || event.originalChannel?.id === entry.channel.id;
    if (networkMatches.length || exactChannel) {
      confidence += 0.35;
      provenance.push({
        kind: "NETWORK",
        source: exactChannel ? event.source : networkMatches[0]?.source ?? event.source,
        at: networkMatches[0]?.observedAt ?? event.sourceUpdatedAt,
        detail: exactChannel ? "Stable event channel ID match." : "Exact network/channel ID or declared channel alias match.",
        weight: 0.35
      });
    }
    const teamIds = entry.teamIds ?? [];
    const home = teamIds.includes(event.homeTeam.id) || nameInProgram(event.homeTeam, entry.programTitle ?? "");
    const away = teamIds.includes(event.awayTeam.id) || nameInProgram(event.awayTeam, entry.programTitle ?? "");
    if (home || away) {
      const weight = Number(home) * 0.125 + Number(away) * 0.125;
      confidence += weight;
      provenance.push({ kind: "TEAMS", source: "available-guide", at: entry.observedAt, detail: home && away ? "Both event teams corroborated." : "Only one event team corroborated.", weight });
    }
    if (teamIds.length >= 2 && (!teamIds.includes(event.homeTeam.id) || !teamIds.includes(event.awayTeam.id))) conflicts.push("Guide identifies a different matchup.");
    if (entry.league) {
      if (leagueKey(entry.league) === leagueKey(event.league)) {
        confidence += 0.1;
        provenance.push({ kind: "LEAGUE", source: "available-guide", at: entry.observedAt, detail: "League agrees.", weight: 0.1 });
      } else conflicts.push("Guide league contradicts event league.");
    }
    const guideStart = timestamp(entry.programStart);
    const eventStart = timestamp(event.scheduledStart);
    if (guideStart !== null && eventStart !== null && Math.abs(guideStart - eventStart) <= (options.startWindowMs ?? 90 * 6e4)) {
      confidence += 0.1;
      provenance.push({ kind: "START", source: "available-guide", at: entry.observedAt, detail: "Scheduled start is within matching window; scheduled end does not finalize the event.", weight: 0.1 });
    }
    if (!event.broadcastNetworks.length && home && away && entry.league && leagueKey(entry.league) === leagueKey(event.league) && (ACTIVE_STATUSES.has(event.status) || HELD_STATUSES.has(event.status))) {
      confidence += 0.35;
      provenance.push({ kind: "TEAMS", source: "available-guide", at: entry.observedAt, detail: "Native league and both teams corroborate a provider active/held matchup without broadcast metadata.", weight: 0.35 });
    }
    const fresh = entry.metadataSource !== "CACHED" && isFreshAt(entry.observedAt, now, options.guideMaxAgeMs ?? 9e4);
    const targetShapeValid = isPlaybackTarget(entry.target) && entry.target.channelId === entry.channel.id && entry.target.evidenceClass === entry.evidenceClass;
    const targetVerified = targetShapeValid && isFreshAt(entry.target.verifiedAt, now, options.targetMaxAgeMs ?? 9e4);
    const targetState = targetVerified ? "VERIFIED" : targetShapeValid ? "STALE" : "UNAVAILABLE";
    if (fresh && targetVerified) {
      confidence += 0.2;
      provenance.push({ kind: "OBSERVATION", source: "available-guide", at: entry.observedAt, detail: "Fresh same-channel supported navigation target.", weight: 0.2 });
    }
    if (!networkMatches.length && !exactChannel && !home && !away) continue;
    if (!entry.available) reasons.push("Channel eligibility is unavailable or unconfirmed.");
    if (!fresh) reasons.push("Guide observation requires refresh.");
    if (!targetVerified) reasons.push("Current supported playback target is unverified or stale.");
    if (event.evidenceClass !== entry.evidenceClass) {
      conflicts.push("Fixture/replay sports evidence cannot establish a real live matchup or playback target.");
    }
    if (confidence < minimum) reasons.push("Insufficient corroboration; a network label alone is not a confirmed game target.");
    candidates.push({
      channel: { ...entry.channel },
      target: targetVerified ? entry.target : null,
      confidence: Math.round(confidence * 1e3) / 1e3,
      reasons,
      conflicts,
      provenance,
      eligible: entry.available,
      targetVerified,
      targetState,
      fresh,
      evidenceClass: entry.evidenceClass
    });
  }
  candidates.sort((a, b) => b.confidence - a.confidence || a.channel.name.localeCompare(b.channel.name));
  const uniqueCandidates = candidates.filter((candidate, index) => candidates.findIndex((other) => other.channel.id === candidate.channel.id) === index);
  const base = { eventId: event.id, candidates: uniqueCandidates, channel: null, selectedChannel: null, target: null, confidence: uniqueCandidates[0]?.confidence ?? 0 };
  if (!uniqueCandidates.length) return { ...base, state: "UNAVAILABLE", reasons: ["No observed available guide channel corroborates this event."] };
  if (freshnessOf(event, now) !== "FRESH") return { ...base, state: "STALE", reasons: ["Sports state requires refresh; no target is asserted."] };
  const usable = uniqueCandidates.filter((candidate) => candidate.eligible && candidate.targetVerified && candidate.fresh && !candidate.conflicts.length);
  if (!usable.length) {
    const staleOnly = uniqueCandidates.some((candidate) => candidate.eligible && (!candidate.fresh || candidate.targetState === "STALE") && !candidate.conflicts.length);
    return { ...base, state: staleOnly ? "STALE" : "UNAVAILABLE", reasons: [...new Set(uniqueCandidates.flatMap((candidate) => [...candidate.reasons, ...candidate.conflicts]))] };
  }
  const first = usable[0];
  const second = usable[1];
  if (first.confidence < minimum || second && first.confidence - second.confidence < margin - Number.EPSILON) return {
    ...base,
    state: "AMBIGUOUS",
    reasons: [first.confidence < minimum ? "More event/channel evidence is needed before enabling Watch/Add." : "Multiple available broadcasts are too close; explicit choice or stronger evidence is required."]
  };
  return {
    ...base,
    state: "CONFIRMED",
    channel: first.channel,
    selectedChannel: first.channel,
    target: first.target,
    confidence: first.confidence,
    reasons: ["Available channel and fresh supported target are corroborated; confidence is a heuristic, not a probability."]
  };
}

// packages/storage/src/index.ts
var DEFAULT_KEYBOARD_MAPPINGS = {
  guide: "g",
  sports: "s",
  quadbox: "q",
  previous: "p",
  mute: "m",
  pane1: "1",
  pane2: "2",
  pane3: "3",
  pane4: "4",
  expand: "Enter",
  restore: "Escape",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  watch: "w",
  search: "/",
  help: "?"
};
function normalizeKeyboardKey(value) {
  const key = value.trim();
  if (!key) return "";
  const named = ["Enter", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].find((item) => item.toLowerCase() === key.toLowerCase());
  return named ?? (/^[!-~]$/.test(key) ? key.toLowerCase() : null);
}
var PREFERENCES_KEY = "yttv-desktop.preferences.v1";
var RECENTS_LIMIT = 20;
function defaultPreferences() {
  return {
    schemaVersion: 1,
    favorites: [],
    hiddenChannels: [],
    channelOrder: [],
    recentChannels: [],
    currentChannel: null,
    previousChannel: null,
    favoriteTeams: [],
    favoriteLeagues: [],
    keyboardMappings: { ...DEFAULT_KEYBOARD_MAPPINGS },
    quadLayouts: [],
    lastQuad: null,
    ui: { denseGuide: true, theme: "dark", lastSurface: "GUIDE" },
    nightMuteLock: false
  };
}
var DEFAULT_PREFERENCES = defaultPreferences();
var object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
var identifier = (value) => typeof value === "string" && value.trim() && value.length <= 200 ? value : null;
var ids = (value, limit = 500) => Array.isArray(value) ? [...new Set(value.map(identifier).filter((id) => id !== null))].slice(0, limit) : [];
function sanitizeSavedLayout(value) {
  const input = object(value);
  const id = identifier(input.id);
  if (!id || !Array.isArray(input.panes) || input.panes.length < 1 || input.panes.length > 4) return null;
  const paneIds = /* @__PURE__ */ new Set();
  const panes2 = [];
  for (const raw of input.panes) {
    const pane = object(raw);
    const paneId = identifier(pane.id);
    if (!paneId || paneIds.has(paneId)) return null;
    paneIds.add(paneId);
    const channelId = identifier(pane.channelId);
    panes2.push({ id: paneId, eventId: identifier(pane.eventId), channelId, target: null });
  }
  const selected = identifier(input.selectedPaneId);
  return {
    id,
    name: typeof input.name === "string" ? input.name.slice(0, 100) : "Saved layout",
    panes: panes2,
    selectedPaneId: selected && paneIds.has(selected) ? selected : panes2[0]?.id ?? null
  };
}
function sanitizePreferences(value) {
  const input = object(value);
  const defaults = defaultPreferences();
  if (input.schemaVersion !== void 0 && input.schemaVersion !== 1 && input.schemaVersion !== 0) return defaults;
  const keyboard = object(input.keyboardMappings);
  const mappings = { ...defaults.keyboardMappings };
  const used = /* @__PURE__ */ new Set();
  for (const action of Object.keys(mappings)) {
    const proposed = typeof keyboard[action] === "string" && keyboard[action].length <= 24 ? keyboard[action].trim() : mappings[action];
    const normalized = normalizeKeyboardKey(proposed) ?? "";
    mappings[action] = normalized && used.has(normalized) ? "" : normalized;
    if (normalized) used.add(normalized);
  }
  const ui = object(input.ui);
  const layouts = Array.isArray(input.quadLayouts) ? input.quadLayouts.map(sanitizeSavedLayout).filter((layout) => layout !== null).slice(0, 20) : [];
  const uniqueLayouts = layouts.filter((layout, index) => layouts.findIndex((other) => other.id === layout.id) === index);
  return {
    schemaVersion: 1,
    favorites: ids(input.favorites),
    hiddenChannels: ids(input.hiddenChannels),
    channelOrder: ids(input.channelOrder),
    recentChannels: ids(input.recentChannels, RECENTS_LIMIT),
    currentChannel: identifier(input.currentChannel),
    previousChannel: identifier(input.previousChannel),
    favoriteTeams: ids(input.favoriteTeams),
    favoriteLeagues: ids(input.favoriteLeagues),
    keyboardMappings: mappings,
    quadLayouts: uniqueLayouts,
    lastQuad: sanitizeSavedLayout(input.lastQuad),
    ui: {
      denseGuide: typeof ui.denseGuide === "boolean" ? ui.denseGuide : defaults.ui.denseGuide,
      theme: ["dark", "light", "system"].includes(String(ui.theme)) ? ui.theme : defaults.ui.theme,
      lastSurface: ["WATCH", "GUIDE", "SPORTS", "QUADBOX"].includes(String(ui.lastSurface)) ? ui.lastSurface : defaults.ui.lastSurface
    },
    nightMuteLock: false
    // The temporary overnight hold is retired; this field conveys no audio authority.
  };
}
function recordConfirmedSwitch(preferences2, channelId, confirmed = true) {
  if (!confirmed || !identifier(channelId) || channelId === preferences2.currentChannel) return preferences2;
  return {
    ...preferences2,
    previousChannel: preferences2.currentChannel,
    currentChannel: channelId,
    recentChannels: [channelId, ...preferences2.recentChannels.filter((id) => id !== channelId)].slice(0, RECENTS_LIMIT)
  };
}

// packages/quadbox/src/index.ts
function createQuadState(options = {}) {
  return {
    panes: [],
    selectedPaneId: null,
    audioFocusId: null,
    layout: "GRID",
    expandedPaneId: null,
    previousLayout: null,
    maxPanes: options.maxPanes ?? 4,
    nightMuteLock: options.nightMuteLock ?? false,
    audioError: null
  };
}
function selectPane(state, paneId) {
  if (!state.panes.some((pane) => pane.id === paneId)) return state;
  return { ...state, selectedPaneId: paneId };
}
async function transferAudioFocus(state, paneId, port) {
  const target = state.panes.find((pane) => pane.id === paneId);
  if (!target) return state;
  const selected = selectPane(state, paneId);
  const failedMutes = /* @__PURE__ */ new Set();
  for (const pane of state.panes) if (pane.playbackSession) {
    try {
      await port.setMuted(pane.playbackSession, true);
    } catch {
      failedMutes.add(pane.id);
    }
  }
  const allMuted = { ...selected, panes: selected.panes.map((pane) => ({
    ...pane,
    muted: true,
    audioState: failedMutes.has(pane.id) || !pane.playbackSession ? "UNKNOWN" : "CONFIRMED_MUTED"
  })), audioFocusId: null };
  if (failedMutes.size) return { ...allMuted, audioError: "Mute confirmation failed; audio state is unknown for the failed session and requires retry." };
  if (state.nightMuteLock) return { ...allMuted, audioError: null };
  if (!target.playbackSession || target.availability !== "READY") return { ...allMuted, audioError: "Selected pane has no ready playback session." };
  try {
    await port.setMuted(target.playbackSession, false);
  } catch {
    let compensated = true;
    try {
      await port.setMuted(target.playbackSession, true);
    } catch {
      compensated = false;
    }
    return {
      ...allMuted,
      panes: allMuted.panes.map((pane) => pane.id === paneId ? { ...pane, audioState: compensated ? "CONFIRMED_MUTED" : "UNKNOWN" } : pane),
      audioError: compensated ? "Audio focus failed; all panes requested muted." : "Audio focus and fallback mute failed; selected session audio is unknown."
    };
  }
  return { ...allMuted, audioError: null, audioFocusId: paneId, panes: allMuted.panes.map((pane) => pane.id === paneId ? { ...pane, muted: false, audioState: "CONFIRMED_ENABLED" } : pane) };
}
function createAudioFocusController(port) {
  let queue = null;
  return {
    focus(state, paneId) {
      const next = (queue ?? Promise.resolve(state)).catch(() => state).then((previous) => transferAudioFocus({
        ...state,
        panes: state.panes.map((pane) => ({ ...pane, muted: previous.panes.find((old) => old.id === pane.id)?.muted ?? true })),
        audioFocusId: previous.audioFocusId
      }, paneId, port));
      queue = next;
      return next;
    }
  };
}

// packages/storage/src/guide-cache.ts
var GUIDE_CACHE_KEY = "yttv-desktop.guide-metadata.v1";
var GUIDE_CACHE_MAX_ROWS = 500;
var GUIDE_CACHE_MAX_BYTES = 512e3;
var PROGRAM_METADATA_MAX_AGE_MS = 24 * 60 * 6e4;
var safeText = (value, limit) => typeof value === "string" && Boolean(value.trim()) && value.length <= limit && !/[\x00-\x1f]|https?:\/\/|(?:token|credential|password|signature)=/i.test(value);
var pastTimestamp = (value, now) => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now;
function readGuideCache(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const cache = raw;
  if (cache.schemaVersion !== 1 || !pastTimestamp(cache.observedAt, now) || !Array.isArray(cache.rows) || !cache.rows.length || cache.rows.length > GUIDE_CACHE_MAX_ROWS) return null;
  try {
    if (JSON.stringify(raw).length > GUIDE_CACHE_MAX_BYTES / 4) return null;
  } catch {
    return null;
  }
  const ids2 = /* @__PURE__ */ new Set();
  const rows = [];
  for (const value of cache.rows) {
    if (!value || typeof value !== "object") return null;
    const row = value;
    if (!safeText(row.channel?.id, 200) || !safeText(row.channel?.name, 150) || ids2.has(row.channel.id) || row.evidenceClass !== "LIVE" || !pastTimestamp(row.observedAt, now) || Date.parse(row.observedAt) > Date.parse(cache.observedAt)) return null;
    ids2.add(row.channel.id);
    const programFresh = now - Date.parse(row.observedAt) <= PROGRAM_METADATA_MAX_AGE_MS;
    rows.push({
      channel: { id: row.channel.id, name: row.channel.name },
      programTitle: programFresh && safeText(row.programTitle, 300) ? row.programTitle : void 0,
      nextProgramTitle: programFresh && safeText(row.nextProgramTitle, 300) ? row.nextProgramTitle : void 0,
      observedAt: row.observedAt,
      evidenceClass: "LIVE",
      metadataSource: "CACHED",
      available: false,
      target: null
    });
  }
  return { schemaVersion: 1, observedAt: cache.observedAt, rows };
}
function createGuideMetadataStore(bridge, now = () => Date.now()) {
  let cache = null;
  let queue = Promise.resolve();
  return {
    async load() {
      try {
        cache = readGuideCache(await bridge.get(GUIDE_CACHE_KEY), now());
      } catch {
        cache = null;
      }
      return cache;
    },
    get rows() {
      return readGuideCache(cache, now())?.rows ?? [];
    },
    async retain(entries) {
      const applicable = entries.filter((row) => row.metadataSource !== "CACHED" && row.evidenceClass === "LIVE");
      if (!applicable.length) return;
      const observedAt = applicable.reduce((at, row) => Date.parse(row.observedAt) > Date.parse(at) ? row.observedAt : at, applicable[0].observedAt);
      const incoming = readGuideCache({ schemaVersion: 1, observedAt, rows: applicable }, now());
      if (!incoming) return;
      const merged = [...cache?.rows ?? []];
      let changed = false;
      for (const row of incoming.rows) {
        const index = merged.findIndex((old) => old.channel.id === row.channel.id);
        if (index < 0) {
          if (merged.length < GUIDE_CACHE_MAX_ROWS) {
            merged.push(row);
            changed = true;
          }
        } else if (Date.parse(row.observedAt) > Date.parse(merged[index].observedAt)) {
          merged[index] = row;
          changed = true;
        }
      }
      if (!changed) return;
      cache = { schemaVersion: 1, observedAt: cache && Date.parse(cache.observedAt) > Date.parse(observedAt) ? cache.observedAt : observedAt, rows: merged };
      const retained = cache;
      const next = queue.catch(() => void 0).then(() => bridge.set(GUIDE_CACHE_KEY, retained));
      queue = next;
      try {
        await next;
      } catch {
      }
    }
  };
}

// packages/yttv-adapter/src/index.ts
var TARGET_MAX_AGE_MS = 30 * 6e4;
function freshLiveTarget(entry, now = Date.now()) {
  const target = entry.target;
  if (entry.metadataSource === "CACHED" || !entry.available || entry.evidenceClass !== "LIVE" || !target || target.evidenceClass !== "LIVE" || target.channelId !== entry.channel.id || !navigationUrl(target.url)) return false;
  const age = now - Date.parse(target.verifiedAt);
  return Number.isFinite(age) && age >= 0 && age <= TARGET_MAX_AGE_MS;
}
function navigationUrl(value, base = "https://tv.youtube.com") {
  try {
    const url = new URL(value, base);
    if (url.origin !== "https://tv.youtube.com" || url.username || url.password || url.hash || !/^\/watch(?:\/[^/?#]+)?\/?$/.test(url.pathname)) return null;
    if ([...url.searchParams.keys()].some((key) => !["v", "vp", "vpp", "channel", "channelId"].includes(key))) return null;
    if (url.href.length > 8192) return null;
    return url.href;
  } catch {
    return null;
  }
}

// apps/chrome-extension/src/adapter.ts
var MESSAGE_NAMESPACE = "yttv-desktop.v1";
var envelope = (command) => ({ namespace: MESSAGE_NAMESPACE, ...command });
var isMessage = (value) => Boolean(value && typeof value === "object" && value.namespace === MESSAGE_NAMESPACE && typeof value.type === "string");

// packages/sports-engine/src/live.ts
var NBA_DISCLOSURE = "NBA \xB7 BALLDONTLIE \xB7 best-effort current game data. Source update time and delivery delay are unknown. Broadcast metadata is unavailable. Other leagues are not connected.";
function unavailableSports(state = "PERMISSION_REQUIRED") {
  return {
    provider: "balldontlie-nba",
    leagues: ["NBA"],
    events: [],
    state,
    disclosure: NBA_DISCLOSURE,
    fetchedAt: null,
    nextRefreshAt: null
  };
}

// apps/chrome-extension/src/sports.ts
var SPORTS_PERMISSION = "http://127.0.0.1:4318/*";
var SPORTS_URL = "http://127.0.0.1:4318/v1/nba/snapshot";
function validateSportsSnapshot(raw) {
  const value = raw;
  if (!value || value.provider !== "balldontlie-nba" || !Array.isArray(value.events) || value.events.length > 500 || !["READY", "UNAVAILABLE", "RATE_LIMITED", "ACCESS_REQUIRED"].includes(value.state)) throw new Error("Invalid sports metadata.");
  const events = value.events.map((event) => {
    if (!event || event.source !== value.provider || event.evidenceClass !== "LIVE" || event.league !== "NBA" || !/^balldontlie:nba:game:[1-9]\d{0,12}$/.test(event.id) || timestamp(event.fetchedAt) === null || event.id !== `balldontlie:nba:game:${event.providerEventId}`) throw new Error("Invalid sports identity.");
    return normalizeEvent({ ...event, originalChannel: null, currentChannel: null, broadcastNetworks: [], sourceUpdatedAt: null });
  });
  return {
    provider: value.provider,
    leagues: ["NBA"],
    state: value.state,
    events,
    disclosure: NBA_DISCLOSURE,
    fetchedAt: timestamp(value.fetchedAt) === null ? null : value.fetchedAt,
    nextRefreshAt: timestamp(value.nextRefreshAt) === null ? null : value.nextRefreshAt
  };
}
function createSportsClient(options) {
  const clock = options.clock ?? Date.now;
  const request = options.request ?? ((url, init2) => globalThis.fetch(url, init2));
  let current = unavailableSports();
  let next = 0;
  let failures = 0;
  let pending = null;
  function snapshot2() {
    return { ...structuredClone(current), events: current.events.map((event) => ({
      ...structuredClone(event),
      freshness: current.state === "READY" ? freshnessOf(event, clock()) : "STALE"
    })) };
  }
  async function perform() {
    if (!options.permitted()) {
      current = { ...current, state: "PERMISSION_REQUIRED" };
      return snapshot2();
    }
    try {
      const response = await request(SPORTS_URL, { redirect: "error", credentials: "omit", signal: AbortSignal.timeout(12e3) });
      if (!response.ok) throw new Error("Sports relay unavailable.");
      const incoming = validateSportsSnapshot(await response.json());
      current = { ...incoming, events: mergeEventSnapshots(current.events, incoming.events) };
      failures = current.state === "READY" ? 0 : failures + 1;
    } catch {
      current = { ...current, state: "UNAVAILABLE" };
      failures++;
    }
    next = clock() + Math.min(9e5, 6e4 * 2 ** Math.min(failures, 4));
    const providerNext = timestamp(current.nextRefreshAt);
    if (providerNext !== null) next = Math.max(next, Math.min(clock() + 9e5, providerNext));
    return snapshot2();
  }
  return {
    snapshot: snapshot2,
    restore(raw) {
      try {
        current = validateSportsSnapshot(raw);
      } catch {
      }
    },
    refresh() {
      if (pending) return pending;
      if (clock() < next) return Promise.resolve(snapshot2());
      pending = perform().finally(() => {
        pending = null;
      });
      return pending;
    }
  };
}

// apps/chrome-extension/src/background.ts
var SPORTS_SESSION_KEY = "yttv-desktop.nba-metadata.v1";
var sports = createSportsClient({ permitted: () => chrome.runtime.getManifest?.().host_permissions?.includes(SPORTS_PERMISSION) ?? false });
var SESSION_KEY = "yttv-desktop.managed-windows.v1";
var DRAWER_KEY = "yttv-desktop.open-drawers.v1";
var MAX_TOTAL_WATCH_SESSIONS = 2;
var guideMetadata = createGuideMetadataStore({
  get: async (key) => (await chrome.storage.local.get(key))[key],
  set: async (key, value) => {
    await chrome.storage.local.set({ [key]: value });
  }
});
var preferences = defaultPreferences();
var preferencesReadable = true;
var confirmedTabs = /* @__PURE__ */ new Set();
var panes = [];
var activePaneId;
var expandedPaneId;
var mainTabId;
var mainEvent;
var mainBounds;
var audioFocusId;
var audioError;
var handoffRunning = false;
var tabAudio = /* @__PURE__ */ new Map();
var observations = /* @__PURE__ */ new Map();
var openDrawers = /* @__PURE__ */ new Set();
var managedQueue = Promise.resolve();
var preferenceWriteQueue = Promise.resolve();
var drawerWriteQueue = Promise.resolve();
function runManaged(operation) {
  const next = managedQueue.catch(() => void 0).then(operation);
  managedQueue = next;
  return next;
}
var ok = (message) => ({ ok: true, message });
var fail = (code, reason) => ({ ok: false, code, reason });
var validId = (value) => typeof value === "string" && Boolean(value.trim()) && value.length <= 200;
var isYTTV = (url) => {
  try {
    return new URL(url ?? "").origin === "https://tv.youtube.com";
  } catch {
    return false;
  }
};
var isWatch = (url) => {
  try {
    return isYTTV(url) && new URL(url).pathname.startsWith("/watch");
  } catch {
    return false;
  }
};
var init = (async () => {
  try {
    const stored = await chrome.storage.local.get(PREFERENCES_KEY);
    preferences = sanitizePreferences(stored[PREFERENCES_KEY]);
  } catch {
    preferencesReadable = false;
  }
  await guideMetadata.load();
  sports.restore((await chrome.storage.session.get(SPORTS_SESSION_KEY).catch(() => ({})))[SPORTS_SESSION_KEY]);
  const storedDrawers = (await chrome.storage.session.get(DRAWER_KEY).catch(() => ({})))[DRAWER_KEY];
  if (Array.isArray(storedDrawers)) {
    for (const tabId of storedDrawers.slice(0, 1e3)) if (Number.isInteger(tabId) && tabId > 0) openDrawers.add(tabId);
  }
  const session = (await chrome.storage.session.get(SESSION_KEY).catch(() => ({})))[SESSION_KEY];
  const restoredEvent = session?.mainEvent;
  if (restoredEvent && validId(restoredEvent.eventId) && validId(restoredEvent.channelId)) mainEvent = restoredEvent;
  if (session && Array.isArray(session.panes)) {
    for (const raw of session.panes.slice(0, 3)) {
      if (!raw || typeof raw !== "object") continue;
      const pane = raw;
      if (!validId(pane.id) || !validId(pane.channelId) || !Number.isInteger(pane.tabId) || !Number.isInteger(pane.windowId)) continue;
      try {
        const tab = await chrome.tabs.get(pane.tabId);
        if (isYTTV(tab.url) && tab.windowId === pane.windowId) {
          panes.push({ ...pane, muted: true });
          await chrome.tabs.update(pane.tabId, { muted: true });
        }
      } catch {
      }
    }
    if (Number.isInteger(session.mainTabId)) {
      try {
        const tab = await chrome.tabs.get(session.mainTabId);
        if (isYTTV(tab.url) && !panes.some((p) => p.tabId === tab.id)) mainTabId = tab.id;
      } catch {
      }
    }
    if (panes.length && mainTabId) await chrome.tabs.update(mainTabId, { muted: true }).catch(() => void 0);
    if (typeof session.expandedPaneId === "string" && panes.some((pane) => pane.id === session.expandedPaneId)) expandedPaneId = session.expandedPaneId;
  }
})();
function controlledIds() {
  return [.../* @__PURE__ */ new Set([...mainTabId ? [mainTabId] : [], ...panes.map((p) => p.tabId)])];
}
function sourceId(tabId) {
  return tabId === mainTabId ? "main" : panes.find((p) => p.tabId === tabId)?.id;
}
async function readTabAudio(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    tabAudio.set(tabId, { tabMuted: typeof tab.mutedInfo?.muted === "boolean" ? tab.mutedInfo.muted : null, tabMuteReason: tab.mutedInfo?.reason });
  } catch {
    tabAudio.delete(tabId);
  }
}
function audioReadback(tabId) {
  const player = tabId ? observations.get(tabId)?.playback : void 0;
  const tab = tabId ? tabAudio.get(tabId) : void 0;
  const playerMuted = player?.muted ?? null;
  const tabMuted = tab?.tabMuted ?? null;
  return {
    playerMuted,
    tabMuted,
    siteMuted: null,
    tabMuteReason: tab?.tabMuteReason,
    volume: player?.volume ?? null,
    muted: playerMuted === true || tabMuted === true ? true : playerMuted === false && tabMuted === false ? false : null
  };
}
async function mainPane() {
  if (!mainTabId) return null;
  try {
    const tab = await chrome.tabs.get(mainTabId);
    if (!isYTTV(tab.url)) return null;
    const channelId = preferences.currentChannel ?? "main-player";
    const name = guideFor(mainTabId).find((e) => e.channel.id === channelId)?.channel.name ?? "Original player";
    return { id: "main", isMain: true, channelId, channelName: name, eventId: mainEvent?.eventId, tabId: mainTabId, windowId: tab.windowId, savedBounds: mainBounds, ...audioReadback(mainTabId), status: "Designated main player" };
  } catch {
    return null;
  }
}
async function controlledPanes() {
  const main = await mainPane();
  return [...main ? [main] : [], ...panes];
}
async function muteSource(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!isYTTV(tab.url)) throw new Error("Controlled source left YouTube TV");
  await chrome.tabs.update(tabId, { muted: true });
  await readTabAudio(tabId);
  if (tabAudio.get(tabId)?.tabMuted !== true) throw new Error("Browser mute readback failed");
  try {
    const reply = await chrome.tabs.sendMessage(tabId, envelope({ type: "PLAYER_AUDIO", muted: true }));
    const prior = observations.get(tabId);
    if (reply?.ok && prior) prior.playback = { ...prior.playback, ...reply.value };
  } catch {
  }
}
var audioController = createAudioFocusController({ async setMuted(sessionId, muted) {
  const tabId = Number(sessionId);
  if (!controlledIds().includes(tabId)) throw new Error("Uncontrolled source");
  if (muted) return muteSource(tabId);
  const tab = await chrome.tabs.get(tabId);
  if (!isYTTV(tab.url)) throw new Error("Source left YouTube TV");
  const reply = await chrome.tabs.sendMessage(tabId, envelope({ type: "PLAYER_AUDIO", muted: false }));
  if (!reply?.ok || reply.value?.muted !== false) throw new Error("Player unmute unconfirmed");
  const prior = observations.get(tabId);
  if (prior) prior.playback = { ...prior.playback, ...reply.value };
  await chrome.tabs.update(tabId, { muted: false });
  await readTabAudio(tabId);
  if (tabAudio.get(tabId)?.tabMuted !== false) throw new Error("Tab/site mute remains active");
} });
async function muteAll(preserveError = false) {
  audioFocusId = void 0;
  if (!preserveError) audioError = void 0;
  let failed = false;
  for (const tabId of controlledIds()) {
    try {
      await muteSource(tabId);
    } catch {
      failed = true;
    }
  }
  if (failed) audioError = "Some controlled sources could not confirm browser mute. Audio state is unknown; use native mute or close the added feed.";
  await notify();
  return failed ? fail("MUTE_FAILED", audioError) : ok("Browser mute confirmed for the designated main and added feed only.");
}
async function saveDrawers() {
  const tabIds = [...openDrawers];
  const next = drawerWriteQueue.catch(() => void 0).then(() => chrome.storage.session.set({ [DRAWER_KEY]: tabIds }));
  drawerWriteQueue = next;
  await next;
}
async function savePreferences() {
  if (!preferencesReadable) throw new Error("Preferences storage could not be read; existing values preserved.");
  const clean = sanitizePreferences(preferences);
  const next = preferenceWriteQueue.catch(() => void 0).then(() => chrome.storage.local.set({ [PREFERENCES_KEY]: clean }));
  preferenceWriteQueue = next;
  await next;
}
async function saveControlIdentity() {
  await chrome.storage.session.set({ [SESSION_KEY]: { panes, mainTabId, mainEvent, activePaneId, expandedPaneId } });
}
async function saveSessions() {
  await saveControlIdentity();
  preferences.lastQuad = panes.length ? {
    id: "managed-current",
    name: "Managed windows",
    panes: panes.map((pane) => ({ id: pane.id, channelId: pane.channelId, eventId: pane.eventId ?? null, target: null })),
    selectedPaneId: activePaneId ?? panes[0].id
  } : null;
  await savePreferences();
}
async function notify() {
  await chrome.runtime.sendMessage(envelope({ type: "STATE_CHANGED" })).catch(() => void 0);
  const tabs = await chrome.tabs.query({ url: "https://tv.youtube.com/*" });
  await Promise.all(tabs.map((tab) => tab.id ? chrome.tabs.sendMessage(tab.id, envelope({ type: "STATE_CHANGED" })).catch(() => void 0) : Promise.resolve()));
}
function cleanObservation(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.guide) || !Number.isFinite(Date.parse(raw.observedAt))) return null;
  const guide = raw.guide.slice(0, 500).filter((entry) => entry && entry.evidenceClass === "LIVE" && validId(entry.channel?.id) && typeof entry.channel.name === "string" && entry.channel.name.length <= 150 && Number.isFinite(Date.parse(entry.observedAt))).map((entry) => ({
    channel: { id: entry.channel.id, name: entry.channel.name },
    programTitle: typeof entry.programTitle === "string" ? entry.programTitle.slice(0, 300) : void 0,
    nextProgramTitle: typeof entry.nextProgramTitle === "string" ? entry.nextProgramTitle.slice(0, 300) : void 0,
    league: entry.league === "NBA" && /\bNBA\b/i.test(entry.programTitle ?? "") ? "NBA" : void 0,
    metadataSource: entry.metadataSource === "CACHED" ? "CACHED" : "OBSERVED",
    available: Boolean(entry.metadataSource !== "CACHED" && isPlaybackTarget(entry.target) && freshLiveTarget(entry)),
    target: entry.metadataSource !== "CACHED" && isPlaybackTarget(entry.target) && freshLiveTarget(entry) ? entry.target : null,
    observedAt: entry.observedAt,
    evidenceClass: "LIVE"
  }));
  return {
    guide,
    guideObservedAt: raw.guideObservedAt,
    currentChannelId: validId(raw.currentChannelId) && guide.some((entry) => entry.channel.id === raw.currentChannelId) ? raw.currentChannelId : void 0,
    currentProgram: typeof raw.currentProgram === "string" ? raw.currentProgram.slice(0, 300) : void 0,
    playback: {
      playing: typeof raw.playback?.playing === "boolean" ? raw.playback.playing : null,
      volume: typeof raw.playback?.volume === "number" && raw.playback.volume >= 0 && raw.playback.volume <= 1 ? raw.playback.volume : null,
      muted: typeof raw.playback?.muted === "boolean" ? raw.playback.muted : null,
      readyState: Number.isInteger(raw.playback?.readyState) ? raw.playback.readyState : null,
      currentTime: typeof raw.playback?.currentTime === "number" && Number.isFinite(raw.playback.currentTime) ? raw.playback.currentTime : null,
      width: typeof raw.playback?.width === "number" ? raw.playback.width : null,
      height: typeof raw.playback?.height === "number" ? raw.playback.height : null
    },
    observedAt: raw.observedAt,
    route: ["guide", "watch", "other"].includes(raw.route) ? raw.route : "other"
  };
}
async function observe(tabId, raw) {
  const clean = cleanObservation(raw);
  if (!clean) return;
  const prior = observations.get(tabId);
  if (prior && Date.parse(clean.observedAt) < Date.parse(prior.observedAt)) return;
  const observation = clean.guide.length || !prior?.guide.length ? clean : { ...clean, guide: prior.guide, guideObservedAt: prior.guideObservedAt };
  const advancing = observation.currentChannelId && observation.currentChannelId === prior?.currentChannelId && observation.route === "watch" && prior?.route === "watch" && observation.playback.playing && prior.playback.playing && typeof observation.playback.currentTime === "number" && typeof prior.playback.currentTime === "number" && observation.playback.currentTime > prior.playback.currentTime + 0.05;
  observations.set(tabId, observation);
  if (advancing) confirmedTabs.add(tabId);
  else confirmedTabs.delete(tabId);
  if (clean.route === "guide") await guideMetadata.retain(clean.guide);
  await readTabAudio(tabId);
  if (mainTabId === void 0 && !panes.some((pane2) => pane2.tabId === tabId)) {
    mainTabId = tabId;
    await saveControlIdentity();
  }
  if (tabId === mainTabId && observation.currentChannelId && advancing) {
    const updated = recordConfirmedSwitch(preferences, observation.currentChannelId);
    if (updated !== preferences && mainEvent && mainEvent.channelId !== observation.currentChannelId) mainEvent = void 0;
    if (updated !== preferences) {
      preferences = updated;
      await savePreferences();
    }
  }
  const pane = panes.find((item) => item.tabId === tabId);
  if (pane) {
    Object.assign(pane, audioReadback(tabId));
    pane.status = observation.currentChannelId === pane.channelId && advancing ? "Player observed advancing" : "Navigation requested; playback not confirmed";
  }
  if (!handoffRunning && panes.length && controlledIds().includes(tabId) && sourceId(tabId) !== audioFocusId && tabAudio.get(tabId)?.tabMuted === false) {
    await chrome.tabs.update(tabId, { muted: true }).catch(() => {
      audioError = "Inactive feed tab mute failed; audio state is unknown. Use Mute all.";
    });
    await readTabAudio(tabId);
  }
  await notify();
}
async function chooseTab(requestingTabId) {
  if (!mainTabId && requestingTabId && !panes.some((pane) => pane.tabId === requestingTabId)) {
    mainTabId = requestingTabId;
    await saveControlIdentity();
  }
  if (mainTabId) {
    try {
      const tab2 = await chrome.tabs.get(mainTabId);
      if (isYTTV(tab2.url)) return mainTabId;
    } catch {
      mainTabId = void 0;
    }
  }
  const tabs = await chrome.tabs.query({ url: "https://tv.youtube.com/*" });
  const tab = tabs.find((item) => item.active && !panes.some((pane) => pane.tabId === item.id)) ?? tabs.find((item) => !panes.some((pane) => pane.tabId === item.id));
  mainTabId = tab?.id;
  if (mainTabId) await saveControlIdentity();
  return mainTabId;
}
async function refreshObservations() {
  await Promise.all(controlledIds().map(async (tabId) => {
    try {
      const raw = await chrome.tabs.sendMessage(tabId, envelope({ type: "GET_OBSERVATION" }));
      if (cleanObservation(raw)) await observe(tabId, raw);
    } catch {
    }
  }));
}
function guideFor(tabId) {
  const candidate = tabId ? observations.get(tabId) : void 0;
  const source = candidate?.guide.length ? candidate : [...observations.values()].filter((item) => item.guide.length).sort((a, b) => Date.parse(b.guideObservedAt ?? b.observedAt) - Date.parse(a.guideObservedAt ?? a.observedAt))[0];
  const rows = guideMetadata.rows;
  for (const entry of source?.guide ?? []) {
    const index = rows.findIndex((row) => row.channel.id === entry.channel.id);
    if (index < 0) rows.push(entry);
    else if (Date.parse(entry.observedAt) >= Date.parse(rows[index].observedAt)) rows[index] = entry;
  }
  return rows.map((entry) => {
    const fresh = freshLiveTarget(entry);
    return { ...entry, available: Boolean(entry.available && fresh), target: fresh ? entry.target : null };
  });
}
async function snapshot(requestingTabId) {
  const tabId = await chooseTab(requestingTabId);
  if (tabId && !observations.has(tabId)) await refreshObservations();
  if (tabId) await readTabAudio(tabId);
  for (const pane of panes) await readTabAudio(pane.tabId);
  const observation = tabId ? observations.get(tabId) : void 0;
  const guide = guideFor(tabId);
  return {
    mode: "extension",
    connection: observation ? "connected" : "waiting",
    guideObservedAt: guide.length ? new Date(Math.max(...guide.map((row) => Date.parse(row.observedAt)))).toISOString() : void 0,
    currentConfirmed: Boolean(tabId && confirmedTabs.has(tabId) && observation?.currentChannelId === preferences.currentChannel),
    statusMessage: guide.length && !guide.some((entry) => entry.target) ? "Saved guide metadata \xB7 last observed, not current. Open native Live to validate navigation; playback stays unchanged." : guide.length ? "Observed guide candidates; playback and entitlement are confirmed only after an advancing player is observed. Audio labels describe player and tab routing; listening is a separate check." : "Open the native YouTube TV Live guide to observe channel navigation targets. Normal playback remains available.",
    currentChannelId: preferences.currentChannel ?? void 0,
    currentProgram: observation?.currentChannelId === preferences.currentChannel ? observation.currentProgram : void 0,
    playback: { playing: observation?.playback.playing ?? null, ...audioReadback(tabId) },
    guide,
    preferences,
    sports: sports.snapshot(),
    panes: [...tabId ? [await mainPane()] : [], ...panes].filter((pane) => Boolean(pane)).map(({ savedBounds: _bounds, ...pane }) => ({ ...pane, ...audioReadback(pane.tabId) })),
    activePaneId,
    expandedPaneId,
    audioFocusId,
    audioError,
    capabilities: { navigation: guide.some((entry) => Boolean(entry.target)), guide: guide.length > 0, managedWindows: true, audio: observation?.playback.muted !== null && observation?.playback.muted !== void 0 },
    observedAt: observation?.observedAt
  };
}
async function navigate(channelId, requestingTabId, eventId) {
  if (!validId(channelId)) return fail("INVALID_CHANNEL", "A channel identifier is required.");
  const tabId = await chooseTab(requestingTabId);
  if (!tabId) return fail("TARGET_UNAVAILABLE", "Open YouTube TV in Chrome and its native Live guide first.");
  if (!guideFor(tabId).some((entry) => entry.channel.id === channelId && freshLiveTarget(entry))) return fail("TARGET_UNAVAILABLE", "Refresh the native Live guide; this channel target is unavailable or stale.");
  if (eventId && !eventMapsTo(eventId, channelId)) return fail("EVENT_UNMAPPED", "Sports or guide state changed before navigation; refresh the event mapping.");
  try {
    const result = await chrome.tabs.sendMessage(tabId, envelope({ type: "NAVIGATE", channelId }));
    if (result?.ok && result.value) {
      await observe(tabId, result.value);
      return ok("Channel confirmed on the original player.");
    }
    return fail(result?.code ?? "UNKNOWN", result?.reason ?? "The original player did not confirm this channel.");
  } catch {
    return fail("NAVIGATION_PENDING", "A page navigation was requested. Wait for its new player observation; a dispatched request is not confirmed playback.");
  }
}
async function refreshSports() {
  const value = await sports.refresh();
  if (value.state !== "PERMISSION_REQUIRED") await chrome.storage.session.set({ [SPORTS_SESSION_KEY]: value });
  await notify();
  return value.state === "READY" ? ok("NBA metadata refreshed. Provider update time and latency remain unknown.") : fail(value.state, value.state === "PERMISSION_REQUIRED" ? "NBA relay permission awaits owner approval; installed playback is preserved." : "NBA metadata unavailable; retained games are preserved. Check the local relay and authorized project key.");
}
function eventMapsTo(eventId, channelId) {
  const state = sports.snapshot();
  const event = state.events.find((candidate) => candidate.id === eventId);
  const guide = guideFor(mainTabId);
  if (state.state !== "READY" || !event || resolveEvent(event, guide).channel?.id !== channelId) return false;
  return !state.events.some((other) => other.id !== eventId && resolveEvent(other, guide).channel?.id === channelId);
}
async function eventAction(eventId, add, requestingTabId) {
  if (!validId(eventId)) return fail("INVALID_EVENT", "A real provider event identifier is required.");
  const tabId = await chooseTab(requestingTabId);
  const state = sports.snapshot();
  const event = state.events.find((candidate) => candidate.id === eventId);
  if (state.state !== "READY" || !event) return fail("SPORTS_UNAVAILABLE", "Refresh NBA metadata before Watch/Add.");
  const guide = guideFor(tabId);
  const resolution = resolveEvent(event, guide);
  if (resolution.state !== "CONFIRMED" || !resolution.channel || !resolution.target) return fail("EVENT_UNMAPPED", resolution.reasons.join(" "));
  if (state.events.some((other) => other.id !== eventId && resolveEvent(other, guide).channel?.id === resolution.channel.id)) return fail("EVENT_AMBIGUOUS", "More than one provider event matches this airing.");
  if (add) return createPane(resolution.channel.id, eventId);
  const previousEvent = mainEvent;
  mainEvent = { eventId, channelId: resolution.channel.id };
  const result = await navigate(resolution.channel.id, requestingTabId, eventId);
  if (!result.ok && result.code !== "NAVIGATION_PENDING") mainEvent = previousEvent;
  await saveControlIdentity();
  return result;
}
function targetFor(channelId) {
  return guideFor(mainTabId).find((entry) => entry.channel.id === channelId && entry.available && entry.target);
}
async function requirePane(paneId) {
  const pane = paneId === "main" ? await mainPane() : panes.find((item) => item.id === paneId);
  if (!pane) return null;
  try {
    const tab = await chrome.tabs.get(pane.tabId);
    if (isYTTV(tab.url) && tab.windowId === pane.windowId) return pane;
  } catch {
  }
  panes = panes.filter((item) => item.id !== paneId);
  await saveSessions();
  return null;
}
async function createPane(channelId, eventId) {
  if (!validId(channelId) || eventId !== void 0 && !validId(eventId)) return fail("INVALID_INPUT", "A valid channel and optional event identifier are required.");
  await chooseTab();
  if (eventId && !eventMapsTo(eventId, channelId)) return fail("EVENT_UNMAPPED", "This event has no fresh unambiguous mapping to the requested channel.");
  const entry = targetFor(channelId);
  if (!entry?.target) return fail("TARGET_UNAVAILABLE", "Refresh the native Live guide; this target is unavailable or stale.");
  const watchTabs = (await chrome.tabs.query({ url: "https://tv.youtube.com/*" })).filter((tab) => isWatch(tab.url));
  if (watchTabs.length >= MAX_TOTAL_WATCH_SESSIONS || panes.length >= 1) return fail("SESSION_BOUND", "This viewing milestone permits the designated main feed plus one managed feed only. Other active playback also consumes account capacity.");
  if (eventId && (!eventMapsTo(eventId, channelId) || targetFor(channelId)?.target?.url !== entry.target.url)) return fail("EVENT_UNMAPPED", "Event mapping changed before managed-feed creation.");
  let newWindow;
  try {
    const created = await chrome.windows.create({ url: "about:blank", type: "popup", focused: false, width: 780, height: 520 });
    if (!created?.id) throw new Error("Missing managed window identity");
    newWindow = created;
    const tabId = created.tabs?.[0]?.id;
    if (!tabId) throw new Error("Missing managed tab identity");
    await chrome.tabs.update(tabId, { muted: true });
    await chrome.tabs.update(tabId, { url: entry.target.url, muted: true });
    const pane = {
      id: `pane-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channelId,
      channelName: entry.channel.name,
      eventId,
      tabId,
      windowId: created.id,
      muted: true,
      status: "Navigation requested; playback not confirmed"
    };
    await readTabAudio(mainTabId);
    if (!audioFocusId && audioReadback(mainTabId).muted === false) audioFocusId = "main";
    panes.push(pane);
    if (!activePaneId) activePaneId = "main";
    await saveSessions();
    await notify();
    return ok("Created a separate muted browser window. Playback remains unconfirmed until its player is observed.");
  } catch {
    if (newWindow?.id) panes = panes.filter((p) => p.windowId !== newWindow.id);
    if (newWindow?.id) await chrome.windows.remove(newWindow.id).catch(() => void 0);
    return fail("WINDOW_FAILED", "The managed browser window could not be created safely; the existing player was preserved.");
  }
}
async function replacePane(paneId, channelId, eventId) {
  const pane = await requirePane(paneId);
  const entry = targetFor(channelId);
  if (!pane || !entry?.target || eventId !== void 0 && !validId(eventId)) return fail("TARGET_UNAVAILABLE", "The pane or fresh channel target is unavailable.");
  if (eventId && !eventMapsTo(eventId, channelId)) return fail("EVENT_UNMAPPED", "This event has no fresh unambiguous mapping to the requested channel.");
  await muteSource(pane.tabId);
  if (audioFocusId === paneId) audioFocusId = void 0;
  observations.delete(pane.tabId);
  confirmedTabs.delete(pane.tabId);
  await chrome.tabs.update(pane.tabId, { url: entry.target.url, muted: true });
  Object.assign(pane, { channelId, channelName: entry.channel.name, eventId, muted: true, status: "Replacement requested; playback not confirmed" });
  await saveSessions();
  await notify();
  return ok("Only this feed was replaced, starting muted. Select it to enable audio.");
}
async function selectPane2(paneId) {
  const pane = await requirePane(paneId);
  if (!pane) return fail("PANE_UNAVAILABLE", "This controlled player was closed.");
  handoffRunning = true;
  try {
    const state = { ...createQuadState({ maxPanes: 2, nightMuteLock: false }), panes: (await controlledPanes()).map((item) => ({
      id: item.id,
      resolvedChannel: { id: item.channelId, name: item.channelName },
      playbackTarget: null,
      eventId: null,
      playbackSession: String(item.tabId),
      lastKnownEvent: null,
      availability: "READY",
      muted: audioReadback(item.tabId).muted !== false
    })) };
    const result = await audioController.focus(state, paneId);
    audioFocusId = result.audioFocusId ?? void 0;
    audioError = result.audioError ?? void 0;
    activePaneId = paneId;
    if (audioError) {
      await muteAll(true);
      return fail("AUDIO_HANDOFF_FAILED", audioError);
    }
    await chrome.tabs.update(pane.tabId, { active: true });
    await chrome.windows.update(pane.windowId, { focused: true });
    await saveSessions();
    await refreshObservations();
    await notify();
    return ok("Selected feed: player and tab audio enabled at its existing volume. Audible sound needs listening confirmation.");
  } catch {
    audioError = "Audio or window focus handoff failed. Controlled feeds were requested muted; check the readback.";
    await muteAll(true);
    return fail("AUDIO_HANDOFF_FAILED", audioError);
  } finally {
    handoffRunning = false;
  }
}
async function expandPane(paneId) {
  const pane = await requirePane(paneId);
  if (!pane) return fail("PANE_UNAVAILABLE", "This managed window was closed.");
  if (expandedPaneId && expandedPaneId !== paneId) await restoreLayout();
  if (!pane.savedBounds) {
    const window = await chrome.windows.get(pane.windowId);
    pane.savedBounds = { left: window.left, top: window.top, width: window.width, height: window.height, state: window.state };
  }
  await chrome.windows.update(pane.windowId, { state: "maximized", focused: true });
  if (paneId === "main") mainBounds = pane.savedBounds;
  expandedPaneId = paneId;
  await saveSessions();
  await notify();
  return ok("Expanded the browser window; restore returns its saved bounds.");
}
async function restoreLayout() {
  const pane = expandedPaneId ? await requirePane(expandedPaneId) : null;
  if (pane?.savedBounds) {
    const { state, ...bounds } = pane.savedBounds;
    await chrome.windows.update(pane.windowId, { state: "normal" });
    await chrome.windows.update(pane.windowId, bounds);
    if (state === "maximized" || state === "fullscreen") await chrome.windows.update(pane.windowId, { state });
    delete pane.savedBounds;
    if (pane.id === "main") mainBounds = void 0;
  }
  expandedPaneId = void 0;
  await saveSessions();
  await notify();
  return ok("Restored the managed window layout; audio selection is preserved.");
}
async function removePane(paneId) {
  if (paneId === "main") return fail("MAIN_PRESERVED", "The designated main player stays open.");
  const pane = await requirePane(paneId);
  if (!pane) return fail("PANE_UNAVAILABLE", "This managed window was already closed.");
  await muteSource(pane.tabId);
  if (audioFocusId === paneId) audioFocusId = void 0;
  await chrome.tabs.remove(pane.tabId);
  panes = panes.filter((item) => item.id !== paneId);
  if (activePaneId === paneId) activePaneId = "main";
  if (expandedPaneId === paneId) expandedPaneId = void 0;
  await saveSessions();
  await notify();
  return ok("Closed only the selected managed test tab.");
}
async function handle(command, sender) {
  await init;
  const contentSender = sender.id === chrome.runtime.id && sender.tab?.id && isYTTV(sender.url ?? sender.tab.url);
  const extensionSender = sender.id === chrome.runtime.id && (!sender.url || sender.url.startsWith(chrome.runtime.getURL("")));
  if (!contentSender && !extensionSender) return fail("INVALID_SENDER", "This request is outside the local extension boundary.");
  switch (command.type) {
    case "GET_DRAWER_STATE":
      return contentSender ? { opened: openDrawers.has(sender.tab.id) } : fail("INVALID_SENDER", "Drawer state belongs to the requesting YouTube TV tab.");
    case "SET_DRAWER_STATE": {
      if (!contentSender || typeof command.opened !== "boolean") return fail("INVALID_SENDER", "Only the current YouTube TV content tab can set its drawer state.");
      if (command.opened) openDrawers.add(sender.tab.id);
      else openDrawers.delete(sender.tab.id);
      await saveDrawers();
      return ok();
    }
    case "OBSERVE":
      if (contentSender) await observe(sender.tab.id, command.observation);
      return ok();
    case "GET_SNAPSHOT":
      return snapshot(contentSender ? sender.tab.id : void 0);
    case "REFRESH_SPORTS":
      return refreshSports();
    case "WATCH_EVENT":
      return runManaged(() => eventAction(command.eventId, false, contentSender ? sender.tab.id : void 0));
    case "ADD_EVENT":
      return runManaged(() => eventAction(command.eventId, true, contentSender ? sender.tab.id : void 0));
    case "FOCUS_MAIN": {
      const pane = await mainPane();
      if (!pane) return fail("PANE_UNAVAILABLE", "Original player unavailable.");
      await chrome.tabs.update(pane.tabId, { active: true });
      await chrome.windows.update(pane.windowId, { focused: true });
      if (openDrawers.has(pane.tabId)) await chrome.tabs.sendMessage(pane.tabId, envelope({ type: "TOGGLE_DESKTOP" })).catch(() => void 0);
      return ok("Focused the existing original player.");
    }
    case "OPEN_NATIVE_GUIDE": {
      const tabId = await chooseTab(contentSender ? sender.tab.id : void 0);
      if (!tabId) return fail("TARGET_UNAVAILABLE", "Open YouTube TV in Chrome first.");
      await chrome.tabs.update(tabId, { url: "https://tv.youtube.com/live" });
      return ok("Opened native Live in this tab. Fresh guide observations are required before Watch/Add.");
    }
    case "NAVIGATE": {
      const result = await navigate(command.channelId, contentSender ? sender.tab.id : void 0);
      if (result.ok || result.code === "NAVIGATION_PENDING") {
        mainEvent = void 0;
        await saveControlIdentity();
      }
      return result;
    }
    case "PREVIOUS":
      return preferences.previousChannel ? navigate(preferences.previousChannel, contentSender ? sender.tab.id : void 0) : fail("NO_PREVIOUS", "No confirmed previous channel yet.");
    case "PREFERENCE": {
      const { currentChannel: _current, previousChannel: _previous, recentChannels: _recent, nightMuteLock: _mute, ...patch } = command.patch ?? {};
      preferences = sanitizePreferences({ ...preferences, ...patch, ui: { ...preferences.ui, ...patch.ui }, nightMuteLock: false });
      await savePreferences();
      await notify();
      return ok("Local preferences saved.");
    }
    case "CREATE_PANE":
      return runManaged(() => createPane(command.channelId, command.eventId));
    case "REPLACE_PANE":
      return runManaged(() => replacePane(command.paneId, command.channelId, command.eventId));
    case "SELECT_PANE":
      return runManaged(() => selectPane2(command.paneId));
    case "EXPAND_PANE":
      return runManaged(() => expandPane(command.paneId));
    case "RESTORE_LAYOUT":
      return runManaged(restoreLayout);
    case "REMOVE_PANE":
      return runManaged(() => removePane(command.paneId));
    case "MUTE":
      return runManaged(() => muteAll());
    case "AUDIO":
      return runManaged(async () => {
        if (command.muted !== void 0 && typeof command.muted !== "boolean" || command.volume !== void 0 && (!Number.isFinite(command.volume) || command.volume < 0 || command.volume > 1)) return fail("INVALID_AUDIO", "Invalid audio choice.");
        const pane = await requirePane(activePaneId ?? "main");
        if (!pane) return fail("PANE_UNAVAILABLE", "Open the original player first.");
        try {
          if (command.volume !== void 0) {
            const reply = await chrome.tabs.sendMessage(pane.tabId, envelope({ type: "PLAYER_AUDIO", volume: command.volume }));
            if (!reply?.ok || Math.abs((reply.value?.volume ?? -1) - command.volume) > 1e-3) throw new Error("volume");
            const prior = observations.get(pane.tabId);
            if (prior) prior.playback.volume = reply.value.volume;
          }
          if (command.muted === true) {
            await muteSource(pane.tabId);
            if (audioFocusId === pane.id) audioFocusId = void 0;
          }
          if (command.muted === false) return selectPane2(pane.id);
          await notify();
          return ok("Player audio choice read back; system volume unchanged.");
        } catch {
          audioError = "Player audio operation failed; use the original player or retry.";
          await notify();
          return fail("AUDIO_FAILED", audioError);
        }
      });
    case "REFRESH":
      await refreshObservations();
      await notify();
      return ok("Refreshed observable player and guide state.");
    default:
      return fail("UNSUPPORTED", "This operation is unavailable.");
  }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isMessage(message) || ["STATE_CHANGED", "GET_OBSERVATION", "TOGGLE_DESKTOP", "PLAYER_AUDIO"].includes(message.type)) return false;
  void handle(message, sender).then(sendResponse, () => sendResponse(fail("UNKNOWN", "The extension operation failed; underlying YouTube TV playback is preserved.")));
  return true;
});
chrome.tabs.onRemoved.addListener((tabId) => {
  const removedSourceId = sourceId(tabId);
  if (audioFocusId === removedSourceId) audioFocusId = void 0;
  if (activePaneId === removedSourceId) activePaneId = "main";
  if (expandedPaneId === removedSourceId) expandedPaneId = void 0;
  observations.delete(tabId);
  tabAudio.delete(tabId);
  confirmedTabs.delete(tabId);
  if (mainTabId === tabId) mainTabId = void 0;
  void init.then(async () => {
    if (openDrawers.delete(tabId)) await saveDrawers();
  });
  const removed = panes.some((pane) => pane.tabId === tabId);
  panes = panes.filter((pane) => pane.tabId !== tabId);
  if (removed) void init.then(saveSessions).then(notify);
});
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url) {
    observations.delete(tabId);
    confirmedTabs.delete(tabId);
  }
  if (isYTTV(tab.url) && controlledIds().includes(tabId) && panes.length && !handoffRunning && sourceId(tabId) !== audioFocusId && change.mutedInfo?.muted === false)
    void chrome.tabs.update(tabId, { muted: true }).catch(() => {
      audioError = "Inactive feed mute failed; use Mute all and inspect audio readback.";
    });
});
