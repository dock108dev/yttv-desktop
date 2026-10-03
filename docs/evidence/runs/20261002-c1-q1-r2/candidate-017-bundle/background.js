// packages/core/src/index.ts
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
    nightMuteLock: true
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
    nightMuteLock: typeof input.nightMuteLock === "boolean" ? input.nightMuteLock : true
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

// apps/chrome-extension/src/background.ts
var SESSION_KEY = "yttv-desktop.managed-windows.v1";
var DRAWER_KEY = "yttv-desktop.open-drawers.v1";
var MAX_TOTAL_WATCH_SESSIONS = 3;
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
  preferences.nightMuteLock = true;
  const storedDrawers = (await chrome.storage.session.get(DRAWER_KEY).catch(() => ({})))[DRAWER_KEY];
  if (Array.isArray(storedDrawers)) {
    for (const tabId of storedDrawers.slice(0, 1e3)) if (Number.isInteger(tabId) && tabId > 0) openDrawers.add(tabId);
  }
  const session = (await chrome.storage.session.get(SESSION_KEY).catch(() => ({})))[SESSION_KEY];
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
    if (typeof session.activePaneId === "string" && panes.some((pane) => pane.id === session.activePaneId)) activePaneId = session.activePaneId;
    if (typeof session.expandedPaneId === "string" && panes.some((pane) => pane.id === session.expandedPaneId)) expandedPaneId = session.expandedPaneId;
  }
})();
async function saveDrawers() {
  const tabIds = [...openDrawers];
  const next = drawerWriteQueue.catch(() => void 0).then(() => chrome.storage.session.set({ [DRAWER_KEY]: tabIds }));
  drawerWriteQueue = next;
  await next;
}
async function savePreferences() {
  if (!preferencesReadable) throw new Error("Preferences storage could not be read; existing values preserved.");
  const clean = sanitizePreferences({ ...preferences, nightMuteLock: true });
  const next = preferenceWriteQueue.catch(() => void 0).then(() => chrome.storage.local.set({ [PREFERENCES_KEY]: clean }));
  preferenceWriteQueue = next;
  await next;
}
async function saveSessions() {
  await chrome.storage.session.set({ [SESSION_KEY]: { panes, activePaneId, expandedPaneId } });
  preferences.lastQuad = panes.length ? {
    id: "managed-current",
    name: "Managed windows \u2014 muted",
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
  await chrome.tabs.update(tabId, { muted: true }).catch(() => void 0);
  if (mainTabId === void 0 && !panes.some((pane2) => pane2.tabId === tabId)) mainTabId = tabId;
  if (tabId === mainTabId && observation.currentChannelId && advancing) {
    const updated = recordConfirmedSwitch(preferences, observation.currentChannelId);
    if (updated !== preferences) {
      preferences = updated;
      await savePreferences();
    }
  }
  const pane = panes.find((item) => item.tabId === tabId);
  if (pane) {
    pane.muted = true;
    pane.status = observation.currentChannelId === pane.channelId && advancing ? "Player observed advancing; muted" : "Navigation requested; playback not confirmed";
  }
  await notify();
}
async function chooseTab(requestingTabId) {
  if (requestingTabId && !panes.some((pane) => pane.tabId === requestingTabId)) mainTabId = requestingTabId;
  if (mainTabId) {
    try {
      const tab2 = await chrome.tabs.get(mainTabId);
      if (isYTTV(tab2.url)) return mainTabId;
    } catch {
      mainTabId = void 0;
    }
  }
  const tabs = await chrome.tabs.query({ url: "https://tv.youtube.com/*" });
  const tab = tabs.find((item) => item.active && !panes.some((pane) => pane.tabId === item.id)) ?? tabs.find((item) => !panes.some((pane) => pane.tabId === item.id)) ?? tabs[0];
  mainTabId = tab?.id;
  return mainTabId;
}
async function refreshObservations() {
  const tabs = await chrome.tabs.query({ url: "https://tv.youtube.com/*" });
  await Promise.all(tabs.map(async (tab) => {
    if (!tab.id) return;
    await chrome.tabs.update(tab.id, { muted: true });
    try {
      const raw = await chrome.tabs.sendMessage(tab.id, envelope({ type: "GET_OBSERVATION" }));
      if (cleanObservation(raw)) await observe(tab.id, raw);
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
  const observation = tabId ? observations.get(tabId) : void 0;
  const guide = guideFor(tabId);
  return {
    mode: "extension",
    connection: observation ? "connected" : "waiting",
    guideObservedAt: guide.length ? new Date(Math.max(...guide.map((row) => Date.parse(row.observedAt)))).toISOString() : void 0,
    currentConfirmed: Boolean(tabId && confirmedTabs.has(tabId) && observation?.currentChannelId === preferences.currentChannel),
    statusMessage: guide.length && !guide.some((entry) => entry.target) ? "Saved guide metadata \xB7 last observed, not current. Open native Live to validate navigation; playback stays unchanged." : guide.length ? "Observed guide candidates; playback and entitlement are confirmed only after an advancing player is observed. Managed windows remain muted overnight." : "Open the native YouTube TV Live guide to observe channel navigation targets. Normal playback remains available.",
    currentChannelId: preferences.currentChannel ?? void 0,
    currentProgram: observation?.currentChannelId === preferences.currentChannel ? observation.currentProgram : void 0,
    playback: { playing: observation?.playback.playing ?? null, muted: true },
    guide,
    preferences,
    panes: panes.map(({ savedBounds: _bounds, ...pane }) => pane),
    activePaneId,
    expandedPaneId,
    capabilities: { navigation: guide.some((entry) => Boolean(entry.target)), guide: guide.length > 0, managedWindows: true, audio: false },
    observedAt: observation?.observedAt
  };
}
async function navigate(channelId, requestingTabId) {
  if (!validId(channelId)) return fail("INVALID_CHANNEL", "A channel identifier is required.");
  const tabId = await chooseTab(requestingTabId);
  if (!tabId) return fail("TARGET_UNAVAILABLE", "Open YouTube TV in Chrome and its native Live guide first.");
  if (!guideFor(tabId).some((entry) => entry.channel.id === channelId && freshLiveTarget(entry))) return fail("TARGET_UNAVAILABLE", "Refresh the native Live guide; this channel target is unavailable or stale.");
  await chrome.tabs.update(tabId, { muted: true });
  try {
    const result = await chrome.tabs.sendMessage(tabId, envelope({ type: "NAVIGATE", channelId }));
    if (result?.ok && result.value) {
      await observe(tabId, result.value);
      return ok("Channel confirmed on the original muted player.");
    }
    return fail(result?.code ?? "UNKNOWN", result?.reason ?? "The original player did not confirm this channel.");
  } catch {
    return fail("NAVIGATION_PENDING", "A page navigation was requested. Wait for its new player observation; a dispatched request is not confirmed playback.");
  }
}
function targetFor(channelId) {
  return guideFor(mainTabId).find((entry) => entry.channel.id === channelId && entry.available && entry.target);
}
async function requirePane(paneId) {
  const pane = panes.find((item) => item.id === paneId);
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
  const entry = targetFor(channelId);
  if (!entry?.target) return fail("TARGET_UNAVAILABLE", "Refresh the native Live guide; this target is unavailable or stale.");
  const watchTabs = (await chrome.tabs.query({ url: "https://tv.youtube.com/*" })).filter((tab) => isWatch(tab.url));
  if (watchTabs.length >= MAX_TOTAL_WATCH_SESSIONS || panes.length >= MAX_TOTAL_WATCH_SESSIONS) return fail("SESSION_BOUND", "The local beta allows at most three total YouTube TV watch sessions, including the original player. Four-stream feasibility is unqualified; no account limit is bypassed.");
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
    panes.push(pane);
    activePaneId = pane.id;
    await saveSessions();
    await notify();
    return ok("Created a separate muted browser window. Playback remains unconfirmed until its player is observed.");
  } catch {
    if (newWindow?.id) await chrome.windows.remove(newWindow.id).catch(() => void 0);
    return fail("WINDOW_FAILED", "The managed browser window could not be created safely; the existing player was preserved.");
  }
}
async function replacePane(paneId, channelId, eventId) {
  const pane = await requirePane(paneId);
  const entry = targetFor(channelId);
  if (!pane || !entry?.target || eventId !== void 0 && !validId(eventId)) return fail("TARGET_UNAVAILABLE", "The pane or fresh channel target is unavailable.");
  await chrome.tabs.update(pane.tabId, { muted: true });
  await chrome.tabs.update(pane.tabId, { url: entry.target.url, muted: true });
  Object.assign(pane, { channelId, channelName: entry.channel.name, eventId, muted: true, status: "Replacement requested; playback not confirmed" });
  await saveSessions();
  await notify();
  return ok("Only this pane was replaced; all managed windows remain muted.");
}
async function selectPane(paneId) {
  const pane = await requirePane(paneId);
  if (!pane) return fail("PANE_UNAVAILABLE", "This managed window was closed.");
  for (const other of panes) await chrome.tabs.update(other.tabId, { muted: true }).catch(() => void 0);
  activePaneId = paneId;
  await chrome.tabs.update(pane.tabId, { active: true, muted: true });
  await chrome.windows.update(pane.windowId, { focused: true });
  await saveSessions();
  await notify();
  return ok("Selected this window. Overnight audio remains muted in every pane.");
}
async function expandPane(paneId) {
  const pane = await requirePane(paneId);
  if (!pane) return fail("PANE_UNAVAILABLE", "This managed window was closed.");
  if (expandedPaneId && expandedPaneId !== paneId) await restoreLayout();
  if (!pane.savedBounds) {
    const window = await chrome.windows.get(pane.windowId);
    pane.savedBounds = { left: window.left, top: window.top, width: window.width, height: window.height, state: window.state };
  }
  await chrome.tabs.update(pane.tabId, { muted: true });
  await chrome.windows.update(pane.windowId, { state: "maximized", focused: true });
  expandedPaneId = paneId;
  activePaneId = paneId;
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
  }
  expandedPaneId = void 0;
  await saveSessions();
  await notify();
  return ok("Restored the managed window layout; audio stays muted.");
}
async function removePane(paneId) {
  const pane = await requirePane(paneId);
  if (!pane) return fail("PANE_UNAVAILABLE", "This managed window was already closed.");
  await chrome.tabs.remove(pane.tabId);
  panes = panes.filter((item) => item.id !== paneId);
  if (activePaneId === paneId) activePaneId = panes[0]?.id;
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
    case "OPEN_NATIVE_GUIDE": {
      const tabId = await chooseTab(contentSender ? sender.tab.id : void 0);
      if (!tabId) return fail("TARGET_UNAVAILABLE", "Open YouTube TV in Chrome first.");
      await chrome.tabs.update(tabId, { url: "https://tv.youtube.com/live", muted: true });
      return ok("Opened native Live in this tab. Fresh guide observations are required before Watch/Add.");
    }
    case "NAVIGATE":
      return navigate(command.channelId, contentSender ? sender.tab.id : void 0);
    case "PREVIOUS":
      return preferences.previousChannel ? navigate(preferences.previousChannel, contentSender ? sender.tab.id : void 0) : fail("NO_PREVIOUS", "No confirmed previous channel yet.");
    case "PREFERENCE": {
      const { currentChannel: _current, previousChannel: _previous, recentChannels: _recent, nightMuteLock: _mute, ...patch } = command.patch ?? {};
      preferences = sanitizePreferences({ ...preferences, ...patch, ui: { ...preferences.ui, ...patch.ui }, nightMuteLock: true });
      await savePreferences();
      await notify();
      return ok("Local preferences saved.");
    }
    case "CREATE_PANE":
      return runManaged(() => createPane(command.channelId, command.eventId));
    case "REPLACE_PANE":
      return runManaged(() => replacePane(command.paneId, command.channelId, command.eventId));
    case "SELECT_PANE":
      return runManaged(() => selectPane(command.paneId));
    case "EXPAND_PANE":
      return runManaged(() => expandPane(command.paneId));
    case "RESTORE_LAYOUT":
      return runManaged(restoreLayout);
    case "REMOVE_PANE":
      return runManaged(() => removePane(command.paneId));
    case "MUTE":
      await refreshObservations();
      await notify();
      return ok("All YouTube TV test tabs are muted.");
    case "REFRESH":
      await refreshObservations();
      await notify();
      return ok("Refreshed observable player and guide state.");
    default:
      return fail("UNSUPPORTED", "This operation is unavailable.");
  }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isMessage(message) || ["STATE_CHANGED", "GET_OBSERVATION", "TOGGLE_DESKTOP"].includes(message.type)) return false;
  void handle(message, sender).then(sendResponse, () => sendResponse(fail("UNKNOWN", "The extension operation failed; underlying YouTube TV playback is preserved.")));
  return true;
});
chrome.tabs.onRemoved.addListener((tabId) => {
  observations.delete(tabId);
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
  if (isYTTV(tab.url) && (change.url || change.mutedInfo?.muted === false)) void chrome.tabs.update(tabId, { muted: true }).catch(() => void 0);
});
