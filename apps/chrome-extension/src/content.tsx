import { mountDesktop } from '../../../packages/ui/src/index';
import { createClientBridge } from './bridge';
import { createDOMAdapter, envelope, isMessage, validCommand, type DOMAdapter } from './adapter';
import uiCss from '../../../packages/ui/src/styles.css?inline';
import { createExtensionLifecycle } from './runtime';
import { activeVideo } from '../../../packages/yttv-adapter/src/index';
const playerKeys = new WeakMap<HTMLVideoElement, string>();
function playerKey() {
  const player = activeVideo(document); if (!player) return undefined;
  if (!playerKeys.has(player)) playerKeys.set(player, crypto.randomUUID());
  return playerKeys.get(player);
}

const HOST_ID = 'yttv-desktop-local-beta';
let adapter: DOMAdapter | undefined;
let host: HTMLElement | undefined;
const lifecycle = createExtensionLifecycle();
function start() {
  if (host) return;
  const existing = document.getElementById(HOST_ID);
  const build = typeof __YTTV_BUILD__ === 'string' ? __YTTV_BUILD__ : 'source';
  // Probe the old isolated world, including reloads before its next API operation.
  if (existing?.dataset.extensionBuild === build) {
    existing.removeAttribute('data-bridge-healthy');
    existing.dispatchEvent(new Event('yttv-bridge-probe'));
    if (existing.dataset.bridgeHealthy === 'true') { lifecycle.dispose(); return; }
  }
  // Explicit re-injection replaces only the old extension launcher; the native player is untouched.
  if (existing) { if (!existing.shadowRoot?.querySelector('.drawer')) return; existing.dispatchEvent(new Event('yttv-bridge-dispose')); existing.remove(); }
  host = document.createElement('div'); host.id = HOST_ID; host.dataset.extensionBuild = build;
  host.style.cssText = 'position:fixed;right:16px;top:72px;z-index:2147483600;font-family:system-ui,sans-serif;';
  const ownedHost = host;
  const probe = () => {
    try {
      if (!chrome.runtime.id) { lifecycle.invalidate(); return; }
      chrome.runtime.getManifest();
      if (lifecycle.active) ownedHost.dataset.bridgeHealthy = 'true';
    } catch { lifecycle.invalidate(); }
  };
  const dispose = () => lifecycle.dispose();
  ownedHost.addEventListener('yttv-bridge-probe', probe);
  ownedHost.addEventListener('yttv-bridge-dispose', dispose);
  lifecycle.addCleanup(() => {
    ownedHost.removeEventListener('yttv-bridge-probe', probe);
    ownedHost.removeEventListener('yttv-bridge-dispose', dispose);
    ownedHost.removeAttribute('data-bridge-healthy');
  });
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = ':host{color-scheme:dark}*{box-sizing:border-box}.toggle{position:fixed;right:16px;top:18px;padding:9px 16px;border:1px solid #596582;background:#111b2a;color:#ecf3ff;border-radius:10px;font:600 13px system-ui;cursor:pointer;box-shadow:0 4px 20px #0007}.drawer{width:min(440px,calc(100vw - 32px));height:calc(100vh - 90px);overflow:auto;background:#0b1220;border:1px solid #324159;border-radius:14px;box-shadow:0 12px 48px #000b}.drawer[hidden]{display:none}';
  const uiStyle = document.createElement('style'); uiStyle.textContent = uiCss;
  const toggle = document.createElement('button'); toggle.className = 'toggle'; toggle.textContent = 'Desktop'; toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Open YouTube TV desktop guide');
  const drawer = document.createElement('div'); drawer.className = 'drawer'; drawer.hidden = true; drawer.style.containerType = 'inline-size';
  let unmount: (() => void) | undefined;
  let drawerTouched = false;
  const applyDrawerState = (opened: boolean) => {
    drawer.hidden = !opened; toggle.setAttribute('aria-expanded', String(opened));
    toggle.setAttribute('aria-label', `${opened ? 'Close' : 'Open'} YouTube TV desktop guide`);
  };
  const toggleDrawer = () => {
    drawerTouched = true;
    const opened = drawer.hidden !== false; applyDrawerState(opened);
    if (lifecycle.active) void lifecycle.guard(() => chrome.runtime.sendMessage(envelope({ type: 'SET_DRAWER_STATE', opened })));
  };
  toggle.addEventListener('click', toggleDrawer);
  const remote = document.createElement('button'); remote.className = 'toggle'; remote.style.right = '120px'; remote.textContent = 'Open remote';
  remote.addEventListener('click', () => { applyDrawerState(false); void lifecycle.guard(() => chrome.runtime.sendMessage(envelope({ type: 'OPEN_REMOTE' }))); });
  shadow.append(style, uiStyle, remote, toggle, drawer); document.documentElement.append(host);
  lifecycle.onInvalidated(() => {
    unmount?.(); unmount = undefined;
    host!.setAttribute('data-extension-state', 'refresh-required');
    toggle.textContent = 'Desktop · Reconnect';
    toggle.setAttribute('aria-label', 'Desktop updated. Use the remote Connection control to reconnect');
    const notice = document.createElement('p'); notice.setAttribute('role', 'status');
    notice.style.cssText = 'margin:0;padding:24px;color:#ecf3ff;font:14px/1.6 system-ui;';
    notice.textContent = 'Desktop extension updated. Use Reconnect original player in the remote Connection section. Your underlying playback remains available.';
    drawer.replaceChildren(notice);
  });
  const renewPlayer = (event: Event) => { if (event.target instanceof HTMLVideoElement) playerKeys.set(event.target, crypto.randomUUID()); };
  document.addEventListener('loadstart', renewPlayer, true);
  lifecycle.addCleanup(() => document.removeEventListener('loadstart', renewPlayer, true));
  adapter = createDOMAdapter(document, { ignoreElement: host });
  lifecycle.addCleanup(() => adapter?.dispose());
  // Trusted input on the ordinary native volume control cancels older recovery immediately.
  // Read back after the site's own handler settles; do not treat our synthetic change as user intent.
  let nativeVolumeTimer: ReturnType<typeof setTimeout> | undefined;
  const nativeVolumeInput = (event: Event) => {
    if (!event.isTrusted || !(event.target instanceof Element) || !event.target.closest('ytu-volume-slider')) return;
    if (event instanceof KeyboardEvent && !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) return;
    const key = playerKey(); if (!key) return;
    void lifecycle.guard(() => chrome.runtime.sendMessage(envelope({ type: 'NATIVE_VOLUME_INPUT', playerKey: key })));
    if (nativeVolumeTimer) clearTimeout(nativeVolumeTimer);
    nativeVolumeTimer = setTimeout(() => {
      if (playerKey() === key) void lifecycle.guard(() => chrome.runtime.sendMessage(envelope({ type: 'NATIVE_VOLUME_INPUT', playerKey: key, observation: adapter!.getObservation() })));
    }, 350);
  };
  document.addEventListener('pointerup', nativeVolumeInput, true);
  document.addEventListener('keydown', nativeVolumeInput, true);
  lifecycle.addCleanup(() => { if (nativeVolumeTimer) clearTimeout(nativeVolumeTimer); document.removeEventListener('pointerup', nativeVolumeInput, true); document.removeEventListener('keydown', nativeVolumeInput, true); });
  const runtimeListener = (message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (value: unknown) => void) => {
    if (!lifecycle.active) return false;
    if (_sender.id !== chrome.runtime.id || !isMessage(message) || !validCommand(message)) return false;
    if (message.type === 'GET_OBSERVATION') { void lifecycle.guard(() => sendResponse({ ...adapter?.getObservation(), playerKey: playerKey(), connectionBuild: build, connectionNonce: message.connectionNonce })); return false; }
    if (message.type === 'NAVIGATE') { void lifecycle.guard(() => adapter!.navigateToChannel(message.channelId)).then(value => { if (lifecycle.active) void lifecycle.guard(() => sendResponse(value)); }); return true; }
    if (message.type === 'PLAYER_AUDIO') {
      if (message.playerKey && message.playerKey !== playerKey()) { sendResponse({ ok: false, code: 'PLAYER_CHANGED', audioFailure: 'PLAYER_CHANGED' }); return false; }
      void lifecycle.guard(() => adapter!.setAudio(message)).then(value => { if (lifecycle.active) void lifecycle.guard(() => sendResponse(value)); }); return true; }
    if (message.type === 'MUTE') { void lifecycle.guard(() => adapter!.mute()).then(value => { if (lifecycle.active) void lifecycle.guard(() => sendResponse(value)); }); return true; }
    if (message.type === 'TOGGLE_DESKTOP') { toggleDrawer(); void lifecycle.guard(() => sendResponse({ ok: true })); return false; }
    return false;
  };
  void lifecycle.guard(() => {
    chrome.runtime.onMessage.addListener(runtimeListener);
    lifecycle.addCleanup(() => chrome.runtime.onMessage.removeListener(runtimeListener));
  });
  if (lifecycle.active) {
    adapter.subscribe(observation => { void lifecycle.guard(() => chrome.runtime.sendMessage(envelope({ type: 'OBSERVE', observation, playerKey: playerKey() }))); });
    const bridge = createClientBridge(lifecycle);
    if (lifecycle.active) { unmount = mountDesktop(drawer, bridge, { demo: false, extensionId: chrome.runtime.id }); lifecycle.addCleanup(() => { unmount?.(); unmount = undefined; }); }
  }
  // New managed watch pages have never rendered the guide themselves. Bootstrap only the
  // background's still-volatile, freshly observed guide; no playback target is persisted.
  void lifecycle.guard(() => chrome.runtime.sendMessage(envelope({ type: 'GET_SNAPSHOT' }))).then(snapshot => {
    if (snapshot?.mode === 'extension' && Array.isArray(snapshot.guide)) adapter?.seedGuide(snapshot.guide);
  });
  // Tab-scoped extension session storage survives native hard navigation without touching
  // YouTube TV's own storage. A newly created managed tab has no saved open state.
  void lifecycle.guard(() => chrome.runtime.sendMessage(envelope({ type: 'GET_DRAWER_STATE' }))).then(state => {
    if (!drawerTouched && typeof state?.opened === 'boolean') applyDrawerState(state.opened);
  });
}
if (document.documentElement) start();
else {
  const ready = new MutationObserver(() => { if (document.documentElement) { ready.disconnect(); start(); } });
  lifecycle.addCleanup(() => ready.disconnect());
  ready.observe(document, { childList: true });
}
const pageHide = () => lifecycle.dispose();
if (lifecycle.active) {
  window.addEventListener('pagehide', pageHide, { once: true });
  lifecycle.addCleanup(() => window.removeEventListener('pagehide', pageHide));
}
