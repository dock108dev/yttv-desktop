import { mountDesktop } from '../../../packages/ui/src/index';
import { createClientBridge } from './bridge';
import { createDOMAdapter, envelope, isMessage, type DOMAdapter } from './adapter';
import uiCss from '../../../packages/ui/src/styles.css?inline';
import { createExtensionLifecycle } from './runtime';

const HOST_ID = 'yttv-desktop-local-beta';
let adapter: DOMAdapter | undefined;
let host: HTMLElement | undefined;
const lifecycle = createExtensionLifecycle();
// Protect early playback before the UI or the rest of the page is ready.
const forceMute = (event: Event) => {
  if (event.target instanceof HTMLVideoElement && !event.target.muted) { event.target.muted = true; event.target.defaultMuted = true; }
};
function start() {
  if (host || document.getElementById(HOST_ID)) return;
  host = document.createElement('div'); host.id = HOST_ID;
  // A repeated injection must not add a second adapter, UI or mute-event listener set.
  document.addEventListener('play', forceMute, true);
  document.addEventListener('playing', forceMute, true);
  document.addEventListener('volumechange', forceMute, true);
  host.style.cssText = 'position:fixed;right:16px;top:72px;z-index:2147483600;font-family:system-ui,sans-serif;';
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
  shadow.append(style, uiStyle, toggle, drawer); document.documentElement.append(host);
  lifecycle.onInvalidated(() => {
    unmount?.(); unmount = undefined;
    host!.setAttribute('data-extension-state', 'refresh-required');
    toggle.textContent = 'Desktop · Refresh page';
    toggle.setAttribute('aria-label', 'Desktop updated. Refresh the YouTube TV page to reconnect');
    const notice = document.createElement('p'); notice.setAttribute('role', 'status');
    notice.style.cssText = 'margin:0;padding:24px;color:#ecf3ff;font:14px/1.6 system-ui;';
    notice.textContent = 'Desktop extension updated. Refresh this YouTube TV page to reconnect. Your underlying playback remains muted.';
    drawer.replaceChildren(notice);
  });
  adapter = createDOMAdapter(document, { ignoreElement: host, nightMuteLock: true });
  lifecycle.addCleanup(() => adapter?.dispose());
  const runtimeListener = (message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (value: unknown) => void) => {
    if (!lifecycle.active) return false;
    if (!isMessage(message)) return false;
    if (message.type === 'GET_OBSERVATION') { void lifecycle.guard(() => sendResponse(adapter?.getObservation())); return false; }
    if (message.type === 'NAVIGATE') { void lifecycle.guard(() => adapter!.navigateToChannel(message.channelId)).then(value => { if (lifecycle.active) void lifecycle.guard(() => sendResponse(value)); }); return true; }
    if (message.type === 'MUTE') { void lifecycle.guard(() => adapter!.mute()).then(value => { if (lifecycle.active) void lifecycle.guard(() => sendResponse(value)); }); return true; }
    if (message.type === 'TOGGLE_DESKTOP') { toggleDrawer(); void lifecycle.guard(() => sendResponse({ ok: true })); return false; }
    return false;
  };
  void lifecycle.guard(() => {
    chrome.runtime.onMessage.addListener(runtimeListener);
    lifecycle.addCleanup(() => chrome.runtime.onMessage.removeListener(runtimeListener));
  });
  if (lifecycle.active) {
    adapter.subscribe(observation => { void lifecycle.guard(() => chrome.runtime.sendMessage(envelope({ type: 'OBSERVE', observation }))); });
    const bridge = createClientBridge(lifecycle);
    if (lifecycle.active) { unmount = mountDesktop(drawer, bridge, { demo: false }); lifecycle.addCleanup(() => { unmount?.(); unmount = undefined; }); }
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
window.addEventListener('pagehide', () => {
  lifecycle.dispose();
  document.removeEventListener('play', forceMute, true);
  document.removeEventListener('playing', forceMute, true);
  document.removeEventListener('volumechange', forceMute, true);
}, { once: true });
