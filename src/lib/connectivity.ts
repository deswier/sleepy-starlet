// Reliable connectivity state that works in iOS PWAs where navigator.onLine
// and the window online/offline events are unreliable (often stuck at true
// even in airplane mode). The source of truth is actual network call results:
// pages call markOnline() / markOffline() when requests succeed or fail.
// window events are still used as a secondary signal for web browsers.

type Listener = (online: boolean) => void;
const listeners = new Set<Listener>();
let _online = navigator.onLine;

export const getOnline = () => _online;

function set(online: boolean) {
  if (_online === online) return;
  _online = online;
  listeners.forEach((fn) => fn(online));
}

export const markOnline = () => set(true);
export const markOffline = () => set(false);

export function onConnectivityChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// Secondary signals: browser online/offline events work on most platforms.
window.addEventListener("online", () => set(true));
window.addEventListener("offline", () => set(false));
