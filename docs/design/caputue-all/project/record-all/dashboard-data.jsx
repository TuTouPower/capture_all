/* Capture All — Main panel (workbench): extra icons + mock data.
   Extends the DI icon set from detail-data.jsx (loaded first). */

Object.assign(DI, {
  navCaptures: (p) => <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9h18M8 14h8M8 17h5"/></svg>,
  navCurrent: (p) => <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 12h4l2.5 7 5-14L17 12h4"/></svg>,
  navExport: (p) => <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 15V3m0 0L8 7m4-4l4 4M4 14v4a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-4"/></svg>,
  navSettings: (p) => <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="3.2"/><path d="M19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 0 1-4 0v-.1A1.7 1.7 0 0 0 6.2 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3.6 13H3.5a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 5 6.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11 3.6V3.5a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 2.8 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9z"/></svg>,
  navMcp: (p) => <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0zM12 16v6"/></svg>,
  star: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3.5l2.6 5.3 5.9.8-4.3 4.1 1 5.8L12 16.9 6.8 19.5l1-5.8L3.5 9.6l5.9-.8z"/></svg>,
  starFill: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" {...p}><path d="M12 3.5l2.6 5.3 5.9.8-4.3 4.1 1 5.8L12 16.9 6.8 19.5l1-5.8L3.5 9.6l5.9-.8z"/></svg>,
  copy: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  cal: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/></svg>,
  play: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" {...p}><path d="M8 5.5v13l11-6.5z"/></svg>,
  download: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14"/></svg>,
  plus: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 5v14M5 12h14"/></svg>,
  archive: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="4" width="18" height="4.5" rx="1.5"/><path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5M10 12h4"/></svg>,
  trash: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 7h16M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7"/></svg>,
  tag: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 7.5v5.2a2 2 0 0 0 .6 1.4l6.7 6.7a2 2 0 0 0 2.8 0l5.3-5.3a2 2 0 0 0 0-2.8l-6.7-6.7a2 2 0 0 0-1.4-.6H5.5a2.5 2.5 0 0 0-2.5 2.5z"/><circle cx="7.5" cy="8" r="1.2" fill="currentColor" stroke="none"/></svg>,
  columns: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/></svg>,
  reset: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/></svg>,
  chevL: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M15 6l-6 6 6 6"/></svg>,
  list: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>,
  trace: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 6h10M3 12h16M3 18h7M15 6h6M12 12h0"/></svg>,
  flame: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3c.5 3-2 4-2 7a2 2 0 0 0 4 0c0-.6-.2-1 0-1.5C16 11 18 13 18 16a6 6 0 0 1-12 0c0-4 4-5 6-13z"/></svg>,
  cookie: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3a9 9 0 1 0 9 9 3.5 3.5 0 0 1-4-4 3.5 3.5 0 0 1-5-5z"/><circle cx="9" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="14" cy="14" r="1" fill="currentColor" stroke="none"/><circle cx="13" cy="9" r=".7" fill="currentColor" stroke="none"/></svg>,
  agent: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  stop: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" {...p}><rect x="6" y="6" width="12" height="12" rx="2"/></svg>,
  link: (p) => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 15l6-6M10.5 6.5l1-1a4 4 0 0 1 6 6l-1 1M13.5 17.5l-1 1a4 4 0 0 1-6-6l1-1"/></svg>,
  check2: (p) => <svg viewBox="0 0 16 16" width="11" height="11" {...p}><path d="M3 8.2l3 3 7-8" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
});

/* ════════ captures list (主面板首页) ════════ */
const CAP_STATS = [
  { key:"all",     icon:"navCaptures", lbl:"全部采集",  val:"1,248", sub:"较昨日 +68",  subTone:"green", tint:"blue" },
  { key:"err",     icon:"err",         lbl:"有错误",    val:"24",    sub:"占比 1.92%",  tint:"red" },
  { key:"deep",    icon:"storage",     lbl:"深度采集",  val:"532",   sub:"占比 42.63%", tint:"purple" },
  { key:"unexp",   icon:"navExport",   lbl:"未导出",    val:"218",   sub:"占比 17.47%", tint:"amber" },
  { key:"size",    icon:"storage",     lbl:"占用空间",  val:"18.7 GB", sub:"较昨日 +1.2 GB", subTone:"green", tint:"green" },
  { key:"active",  icon:"navCurrent",  lbl:"当前采集中", val:"2",     sub:"进行中",       tint:"blue", live:true },
];

const CAP_ROWS = [
  { id:"rec_x82a", name:"今天 14:32 的采集",  star:true,  url:"https://app.example.com/dashboard", time:"2025-05-17 14:32:05", dur:"00:03:27", mode:"deep", events:"1,248", reqs:"356", errs:2, size:"12.8 KB", exp:{on:true, at:"2025-05-17 14:36"}, tag:"生产", active:true },
  { id:"rec_p41b", name:"今天 11:08 的采集",  star:false, url:"https://api.example.com/v1/users",   time:"2025-05-17 11:08:42", dur:"00:01:14", mode:"std",  events:"342",   reqs:"128", errs:0, size:"5.6 KB",  exp:{on:false}, tag:"API" },
  { id:"rec_k09c", name:"昨天 18:05 的采集",  star:true,  url:"https://app.example.com/orders",     time:"2025-05-16 18:05:19", dur:"00:06:45", mode:"deep", events:"2,102", reqs:"612", errs:6, size:"23.4 KB", exp:{on:true, at:"2025-05-16 18:12"}, tag:"订单" },
  { id:"rec_m23d", name:"昨天 09:47 的采集",  star:false, url:"https://auth.example.com/login",     time:"2025-05-16 09:47:03", dur:"00:00:59", mode:"std",  events:"156",   reqs:"42",  errs:0, size:"3.1 KB",  exp:{on:false}, tag:"认证" },
  { id:"rec_t77e", name:"5月15日 16:07 的采集", star:false, url:"https://app.example.com/report",    time:"2025-05-15 16:07:55", dur:"00:04:18", mode:"deep", events:"1,632", reqs:"489", errs:1, size:"17.9 KB", exp:{on:true, at:"2025-05-15 16:15"}, tag:"报表" },
  { id:"rec_b15f", name:"5月15日 10:22 的采集", star:false, url:"https://api.example.com/v1/order",  time:"2025-05-15 10:22:31", dur:"00:02:03", mode:"std",  events:"278",   reqs:"96",  errs:0, size:"4.2 KB",  exp:{on:false}, tag:"API" },
  { id:"rec_z62g", name:"5月14日 21:33 的采集", star:false, url:"https://app.example.com/settings",  time:"2025-05-14 21:33:47", dur:"00:03:11", mode:"deep", events:"897",   reqs:"231", errs:0, size:"9.6 KB",  exp:{on:true, at:"2025-05-14 21:40"}, tag:"设置" },
  { id:"rec_a08h", name:"5月14日 15:18 的采集", star:false, url:"https://static.example.com/",       time:"2025-05-14 15:18:12", dur:"00:00:28", mode:"std",  events:"42",    reqs:"18",  errs:0, size:"1.1 KB",  exp:{on:false}, tag:"静态资源" },
  { id:"rec_w39i", name:"5月13日 19:54 的采集", star:false, url:"https://api.example.com/v1/payment",time:"2025-05-13 19:54:08", dur:"00:05:02", mode:"deep", events:"1,987", reqs:"578", errs:3, size:"21.2 KB", exp:{on:true, at:"2025-05-13 20:01"}, tag:"支付" },
  { id:"rec_q51j", name:"5月13日 11:06 的采集", star:false, url:"https://app.example.com/help",      time:"2025-05-13 11:06:29", dur:"00:01:35", mode:"std",  events:"203",   reqs:"67",  errs:0, size:"2.8 KB",  exp:{on:false}, tag:"帮助中心" },
];

/* ════════ capture detail (采集详情) ════════ */
const DT_METRICS = [
  { key:"events",  icon:"clock",   lbl:"事件",     val:"1,284", delta:"+12%", tone:"green", color:"var(--src-user)" },
  { key:"reqs",    icon:"storage", lbl:"请求",     val:"356",   delta:"+8%",  tone:"green", color:"var(--src-network)", filter:"network" },
  { key:"failed",  icon:"err",     lbl:"失败",     val:"7",     delta:"+133%",tone:"red",   color:"var(--src-error)",   filter:"errors", danger:true },
  { key:"console", icon:"console", lbl:"控制台错误", val:"12",   delta:"+50%", tone:"red",   color:"var(--src-console)", filter:"console" },
  { key:"storage", icon:"storage", lbl:"存储变化", val:"18",    delta:"+20%", tone:"green", color:"var(--src-storage)", filter:"storage" },
  { key:"dom",     icon:"dom",     lbl:"DOM 变化", val:"604",   delta:"+15%", tone:"green", color:"var(--src-dom)" },
  { key:"nav",     icon:"nav",     lbl:"导航",     val:"12",    delta:"+9%",  tone:"green", color:"var(--src-nav)" },
];

const DT_TABS = [
  ["overview","概览"], ["timeline","时间线"], ["network","网络"],
  ["console","控制台"], ["evidence","证据"], ["storage","存储"], ["config","本次配置"],
];

/* event-list rows (image 3 middle) — kind drives icon + color */
const DT_EVENTS = [
  { t:"+00.000s", kind:"session", type:"Session",    ev:"开始录制",                 detail:"开始录制本次会话",  src:"—" },
  { t:"+00.840s", kind:"nav",     type:"Navigation", ev:"打开 /login",              detail:"https://app.test.io/login", src:"Main Frame" },
  { t:"+01.120s", kind:"user",    type:"User",       ev:'点击 "Login"',             detail:"button#login.btn-primary", src:"x: 642, y: 312" },
  { t:"+01.380s", kind:"network", type:"Network",    ev:"POST /api/login",          detail:"", status:200, ms:"184ms", src:"XHR" },
  { t:"+01.560s", kind:"storage", type:"Storage",    ev:"localStorage auth_token changed", detail:"1 key updated", src:"localStorage" },
  { t:"+01.720s", kind:"nav",     type:"Navigation", ev:"路由变化到 /dashboard",    detail:"SPA 路由变化", src:"history.pushState" },
  { t:"+03.410s", kind:"user",    type:"User",       ev:'点击 "Checkout"',          detail:"button#checkout", src:"x: 512, y: 268" },
  { t:"+03.680s", kind:"network", type:"Network",    ev:"POST /api/order",          detail:"", status:500, ms:"842ms", src:"XHR", bad:true, sel:true },
  { t:"+03.710s", kind:"console", type:"Console",    ev:"TypeError: Cannot read property", detail:"Cannot read properties of undefined (reading 'id')", src:"app.js:88", err:true },
  { t:"+03.900s", kind:"dom",     type:"DOM",        ev:".error-message node added", detail:"div.error-message", src:"3 mutations" },
  { t:"+04.120s", kind:"cookie",  type:"Cookie",     ev:"session_id changed",       detail:"值已更新", src:"app.test.io" },
];

/* quick-filter rail counts */
const DT_QUICK = [
  { key:"all",     icon:"navCaptures", lbl:"全部",     n:"1,284", color:"var(--ink-2)" },
  { key:"errors",  icon:"err",         lbl:"错误",     n:"19",    color:"var(--src-error)" },
  { key:"user",    icon:"ui",          lbl:"用户操作", n:"128",   color:"var(--src-user)" },
  { key:"network", icon:"net",         lbl:"网络",     n:"356",   color:"var(--src-network)" },
  { key:"console", icon:"console",     lbl:"控制台",   n:"12",    color:"var(--src-console)" },
  { key:"nav",     icon:"nav",         lbl:"导航",     n:"12",    color:"var(--src-nav)" },
  { key:"storage", icon:"storage",     lbl:"存储",     n:"18",    color:"var(--src-storage)" },
  { key:"cookie",  icon:"cookie",      lbl:"Cookie",   n:"36",    color:"var(--src-cookie)" },
  { key:"dom",     icon:"dom",         lbl:"DOM",      n:"604",   color:"var(--src-dom)" },
];

/* inspector — the selected 500 request */
const DT_INSP = {
  method:"POST", path:"/api/order", status:500, statusText:"Internal Server Error",
  dur:"842 ms", restype:"XHR", started:"14:35:48", page:"/checkout", origin:"Main Frame",
  url:"https://app.test.io/api/order", protocol:"HTTP/1.1", initiator:"fetch @ checkout.ts:42",
  size:"12.8 KB (请求) / 2.6 KB (响应)",
  related:[
    { t:"+03.410s", kind:"user",    type:"User",    ev:'点击 "Checkout"' },
    { t:"+03.710s", kind:"console", type:"Console", ev:"TypeError: Cannot read property" },
    { t:"+03.900s", kind:"dom",     type:"DOM",     ev:".error-message node added" },
    { t:"+04.120s", kind:"cookie",  type:"Cookie",  ev:"session_id changed" },
  ],
};

/* kind → {icon, color} for event rows */
const KIND = {
  session:{ icon:"agent",   color:"var(--src-session)" },
  nav:    { icon:"nav",     color:"var(--src-nav)" },
  user:   { icon:"ui",      color:"var(--src-user)" },
  network:{ icon:"net",     color:"var(--src-network)" },
  storage:{ icon:"storage", color:"var(--src-storage)" },
  console:{ icon:"console", color:"var(--src-console)" },
  dom:    { icon:"dom",     color:"var(--src-dom)" },
  cookie: { icon:"cookie",  color:"var(--src-cookie)" },
};

const NAV = [
  { key:"captures",     icon:"navCaptures", lbl:"采集记录" },
  { key:"current",      icon:"navCurrent",  lbl:"当前采集", badge:"2" },
  { key:"exports",      icon:"navExport",   lbl:"导出任务" },
  { key:"settings",     icon:"navSettings", lbl:"设置" },
  { key:"integrations", icon:"navMcp",      lbl:"MCP / 集成" },
];

Object.assign(window, { CAP_STATS, CAP_ROWS, DT_METRICS, DT_TABS, DT_EVENTS, DT_QUICK, DT_INSP, KIND, NAV });
