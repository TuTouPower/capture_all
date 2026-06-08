/* Capture All — shared icons + mock data (used by 主面板 采集详情) */

const DI = {
  logoRing: (p) => <svg viewBox="0 0 24 24" width="16" height="16" {...p}><circle cx="12" cy="12" r="8" fill="none" stroke="#fff" strokeWidth="3"/><circle cx="12" cy="12" r="3" fill="#fff"/></svg>,
  search: (p) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>,
  filter: (p) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 5h18l-7 8v6l-4-2v-4z"/></svg>,
  export: (p) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>,
  more: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" {...p}><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>,
  clock: (p) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  net: (p) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/></svg>,
  ui: (p) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 3l14 9-6 1.5L10 20z"/></svg>,
  console: (p) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="2.5" y="3.5" width="19" height="17" rx="2.5"/><path d="M6 8l3 3-3 3M11 14h5"/></svg>,
  dom: (p) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M8 6l-5 6 5 6M16 6l5 6-5 6"/></svg>,
  storage: (p) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>,
  nav: (p) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/></svg>,
  err: (p) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M10.3 3.8 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>,
  close: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M6 6l12 12M18 6L6 18"/></svg>,
  pin: (p) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>,
  ext: (p) => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M8 5H5v14h14v-3M14 5h5v5M19 5l-8 8"/></svg>,
  zoomIn: (p) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/></svg>,
  zoomOut: (p) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6"/></svg>,
  zoomFit: (p) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8.5 11h5"/></svg>,
  expand: (p) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M8 3H4v4M16 3h4v4M8 21H4v-4M16 21h4v-4"/></svg>,
  chevD: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M6 9l6 6 6-6"/></svg>,
  chevR: (p) => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 6l6 6-6 6"/></svg>,
  sortD: (p) => <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" {...p}><path d="M12 16l-5-6h10z"/></svg>,
  refresh: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/></svg>,
  back: (p) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M15 18l-6-6 6-6"/></svg>,
};

/* lane definitions (PRD data-source colors) */
const LANES = [
  { key: "network", label: "Network / 网络",   icon: "net",     count: 356,  color: "var(--src-network)" },
  { key: "ui",      label: "UI Events / 界面事件", icon: "ui",   count: 1024, color: "var(--src-user)" },
  { key: "console", label: "Console / 控制台",   icon: "console", count: 24,   color: "var(--src-console)" },
  { key: "dom",     label: "DOM Changes / DOM 变更", icon: "dom", count: 18,  color: "var(--src-dom)" },
  { key: "storage", label: "Storage / 存储",     icon: "storage", count: 18,   color: "var(--src-storage)" },
  { key: "nav",     label: "Navigation / 导航",  icon: "nav",     count: 6,    color: "var(--src-nav)" },
  { key: "errors",  label: "Errors / 错误",      icon: "err",     count: 2,    color: "var(--src-error)" },
];

/* deterministic pseudo-random so layout is stable across renders */
function rng(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }

/* total session = 207s (03:27). build markers per lane as % positions */
function buildLane(key, count, seed) {
  const r = rng(seed);
  const n = Math.min(count, key === "ui" ? 90 : key === "network" ? 56 : count);
  const arr = [];
  for (let i = 0; i < n; i++) {
    const pos = Math.min(99, Math.max(1, (i / n) * 100 + (r() - 0.5) * 6));
    arr.push({ pos, h: 0.4 + r() * 0.6, kind: r() > 0.86 ? "warn" : "ok" });
  }
  return arr.sort((a, b) => a.pos - b.pos);
}
const LANE_DATA = {
  network: buildLane("network", 56, 7),
  ui:      buildLane("ui", 90, 13),
  console: [12,21,28,35,44,52,61,70,78,86,93].map((p,i)=>({pos:p,kind:i%3===1?"warn":"ok"})),
  dom:     buildLane("dom", 18, 29),
  storage: buildLane("storage", 18, 41),
  nav:     [{pos:2,label:"/"},{pos:33,label:"/dashboard"},{pos:72,label:"/settings"}],
  errors:  [{pos:24},{pos:50},{pos:78}],
};

/* network request rows */
const NET_ROWS = [
  { t: "00:01:12.345", m: "GET",  url: "https://api.example.com/v1/users",        st: 200, type: "fetch",      size: "12.8 KB", dur: 245, w: 0.55 },
  { t: "00:01:12.589", m: "GET",  url: "https://api.example.com/v1/profile",      st: 200, type: "fetch",      size: "8.4 KB",  dur: 189, w: 0.40 },
  { t: "00:01:13.102", m: "POST", url: "https://api.example.com/v1/login",        st: 200, type: "fetch",      size: "1.2 KB",  dur: 312, w: 0.66 },
  { t: "00:01:13.456", m: "GET",  url: "https://cdn.example.com/app.js",          st: 200, type: "script",     size: "98 KB",   dur: 78,  w: 0.20 },
  { t: "00:01:13.789", m: "GET",  url: "https://cdn.example.com/style.css",       st: 200, type: "stylesheet", size: "32.1 KB", dur: 67,  w: 0.16 },
  { t: "00:01:14.210", m: "GET",  url: "https://api.example.com/v1/notifications",st: 500, type: "fetch",      size: "0 B",     dur: 523, w: 1.0, err: true },
  { t: "00:01:14.512", m: "GET",  url: "https://api.example.com/v1/settings",     st: 200, type: "fetch",      size: "4.3 KB",  dur: 171, w: 0.36 },
  { t: "00:01:14.689", m: "GET",  url: "https://cdn.example.com/logo.png",        st: 200, type: "png",        size: "4.1 KB",  dur: 42,  w: 0.10 },
  { t: "00:01:15.012", m: "WS",   url: "wss://ws.example.com/socket",             st: 101, type: "websocket",  size: "0 B",     dur: 0,   w: 0.04, pending: true },
];

/* console rows */
const CON_ROWS = [
  { t: "00:01:12.312", lvl: "info", msg: "User successfully authenticated",                  src: "auth.ts",      ln: 42 },
  { t: "00:01:13.102", lvl: "info", msg: "Fetching user profile",                            src: "profile.ts",   ln: 18 },
  { t: "00:01:13.456", lvl: "warn", msg: "Deprecated API usage: 'oldMethod()' is deprecated", src: "api.ts",      ln: 87 },
  { t: "00:01:14.210", lvl: "error",msg: "Failed to load notifications: 500 Internal Server Error", src: "notifications.ts", ln: 56 },
  { t: "00:01:14.512", lvl: "info", msg: "Settings loaded successfully",                     src: "settings.ts",  ln: 31 },
  { t: "00:01:14.689", lvl: "log",  msg: "WebSocket connected",                              src: "websocket.ts", ln: 22 },
  { t: "00:01:15.210", lvl: "info", msg: "Heartbeat received",                               src: "websocket.ts", ln: 45 },
  { t: "00:01:15.890", lvl: "warn", msg: "Slow network detected (RTT: 320ms)",               src: "network.ts",   ln: 12 },
  { t: "00:01:16.340", lvl: "log",  msg: "Render committed (14ms)",                          src: "render.ts",    ln: 64 },
  { t: "00:01:16.901", lvl: "info", msg: "Prefetch /settings route",                         src: "router.ts",    ln: 9  },
];

Object.assign(window, { DI, LANES, LANE_DATA, NET_ROWS, CON_ROWS });
