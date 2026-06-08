/* Capture All — Popup (采集控制台). Single interactive window card.
   6 states wired with real transitions + a scenario control panel + Tweaks. */

const { useState, useEffect, useRef } = React;

/* ── tiny inline icon set (standard UI glyphs only) ───────────────── */
const I = {
  gear: (p) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  more: (p) => <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" {...p}><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>,
  clock: (p) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  chevron: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 18l6-6-6-6"/></svg>,
  chart: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 16l5-6 4 4 6-8"/><path d="M19 6h2v2"/></svg>,
  globe: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/></svg>,
  alert: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M10.3 3.8 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>,
  console: (p) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 8l3 3-3 3M11 14h5"/><rect x="2.5" y="3.5" width="19" height="17" rx="2.5"/></svg>,
  storage: (p) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>,
  shield: (p) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/></svg>,
  check: (p) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>,
  download: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16"/></svg>,
  keyboard: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 9.5h.01M10 9.5h.01M14 9.5h.01M18 9.5h.01M7.5 14h9"/></svg>,
  braces: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M8 4c-2 0-2.5 1-2.5 3.5S5 11 3.5 12c1.5 1 2 2 2 4.5S6 20 8 20M16 4c2 0 2.5 1 2.5 3.5S19 11 20.5 12c-1.5 1-2 2-2 4.5S18 20 16 20"/></svg>,
  reply: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 5 5v3"/></svg>,
  cookie: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3a9 9 0 1 0 9 9 4 4 0 0 1-5-5 4 4 0 0 1-4-4z"/><path d="M9 11h.01M14 14h.01M9.5 15.5h.01"/></svg>,
  ext: (p) => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M8 5H5v14h14v-3M14 5h5v5M19 5l-8 8"/></svg>,
  doc: (p) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 16.5h6"/></svg>,
  info: (p) => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>,
  back: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M15 18l-6-6 6-6"/></svg>,
  stop: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" {...p}><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>,
  pointer: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" {...p}><path d="M5 3l5.5 16 2.3-6.6 6.7-2.3z"/></svg>,
  dom: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="9" y="3" width="6" height="4" rx="1"/><rect x="3" y="17" width="6" height="4" rx="1"/><rect x="15" y="17" width="6" height="4" rx="1"/><path d="M12 7v3M6 17v-3h12v3"/></svg>,
};

/* ── capturable data sources (toggle chips, shared by Ready + Recording) ── */
const TONE = {
  blue:   { c: "var(--blue-ink)",   bg: "var(--blue-bg)" },
  indigo: { c: "var(--indigo)",     bg: "var(--indigo-bg)" },
  purple: { c: "var(--purple-ink)", bg: "var(--purple-bg)" },
  amber:  { c: "var(--amber-ink)",  bg: "var(--amber-bg)" },
  cyan:   { c: "var(--cyan)",       bg: "var(--cyan-bg)" },
  green:  { c: "var(--green-ink)",  bg: "var(--green-bg)" },
  red:    { c: "var(--red-ink)",    bg: "var(--red-bg)" },
};
const CAPTURE = [
  { k: "user",    label: "用户操作", icon: "pointer",  tone: "blue"   },
  { k: "nav",     label: "页面导航", icon: "globe",    tone: "indigo" },
  { k: "net",     label: "网络请求", icon: "braces",   tone: "purple" },
  { k: "resp",    label: "响应体",   icon: "reply",    tone: "purple", deep: true },
  { k: "input",   label: "输入值",   icon: "keyboard", tone: "purple", deep: true },
  { k: "console", label: "Console",  icon: "console",  tone: "amber"  },
  { k: "dom",     label: "DOM 变化", icon: "dom",      tone: "cyan"   },
  { k: "storage", label: "Storage",  icon: "storage",  tone: "green"  },
];
/* mock collected counts while recording */
const COUNTS = {
  normal:  { user: "248", nav: "12", net: "356", resp: "0",   input: "0",  console: "24", dom: "612", storage: "18", err: "2"  },
  warning: { user: "514", nav: "23", net: "742", resp: "698", input: "41", console: "32", dom: "1,108", storage: "26", err: "18" },
};

/* ── recent recordings mock ───────────────────────────────────────── */
const RECENT = [
  { id: "rec_x82a", when: "今天 14:32", mode: "deep",     dur: "12m 42s", events: "1,284", errors: 12 },
  { id: "rec_p41c", when: "昨天 18:05", mode: "deep",     dur: "8m 11s",  events: "3,882", errors: 5  },
  { id: "rec_k09d", when: "5月15日 16:07", mode: "standard", dur: "22m 33s", events: "1,102", errors: 8  },
];

const ModeBadge = ({ mode }) => (
  <span className="badge" data-mode={mode}>{mode === "deep" ? "深度采集" : "标准采集"}</span>
);

/* recent list (shared by Ready + Saved) */
function RecentList({ savedFirst }) {
  const rows = savedFirst ? [{ ...RECENT[0], saved: true }, ...RECENT.slice(1)] : RECENT;
  const shown = savedFirst ? rows.slice(0, 1) : rows;
  return (
    <div className="recent">
      <div className="recent-hd">
        <span>最近采集</span>
        <a href="detail.html" className="link">查看全部</a>
      </div>
      <div className="recent-list">
        {shown.map((r) => (
          <a key={r.id} href="detail.html" className="recent-row">
            <span className="recent-ic">{savedFirst ? <I.doc/> : <I.clock/>}</span>
            <span className="recent-main">
              <span className="recent-top">
                <b>{r.when}</b><ModeBadge mode={r.mode}/>
              </span>
              <span className="recent-sub mono">
                {r.dur} · {r.events} events · <em data-err={r.errors > 0 ? 1 : 0}>{r.errors} errors</em>
              </span>
            </span>
            <span className="recent-go link">查看详情 <I.chevron/></span>
          </a>
        ))}
      </div>
    </div>
  );
}

/* ── unified capture-content tag — shared by Ready / Recording / Saved ──
   variant: "select" (Ready · toggleable) | "live" (Recording) | "final" (Saved) */
function CapTag({ item, variant, on, count, onToggle }) {
  const Icon = I[item.icon];
  const t = TONE[item.tone];
  const active = variant === "select" ? on : true;
  return (
    <button className="captag" data-on={active ? 1 : 0} data-variant={variant}
      onClick={onToggle} disabled={variant !== "select"}
      style={active ? { color: t.c, background: t.bg, borderColor: "transparent" } : undefined}>
      <span className="captag-ic"><Icon/></span>
      <span className="captag-lbl">{item.label}</span>
      {item.deep && variant === "select" && <span className="captag-deep" data-on={on ? 1 : 0}>深度</span>}
      {count != null && <span className="captag-n mono">{count}</span>}
    </button>
  );
}

const MASK = { k: "mask", label: "脱敏",   icon: "shield", tone: "green" };
const ERR  = { k: "err",  label: "错误",   icon: "alert",  tone: "red"   };
const num = (v) => Number(String(v).replace(/,/g, "")) || 0;

/* the unified third row: capture-content tags (same UI in every state) */
function CaptureTags({ variant, chips, counts, mode, toggleChip }) {
  if (variant === "select") {
    return (
      <div className="captags">
        {CAPTURE.map((it) => (
          <CapTag key={it.k} item={it} variant="select" on={!!chips[it.k]} onToggle={() => toggleChip(it.k)}/>
        ))}
        <CapTag item={MASK} variant="select" on={!!chips.mask} onToggle={() => toggleChip("mask")}/>
      </div>
    );
  }
  const shown = CAPTURE.filter((it) => chips[it.k] || (mode === "deep" && it.deep));
  return (
    <div className="captags">
      {shown.map((it) => (
        <CapTag key={it.k} item={it} variant={variant} count={counts[it.k]}/>
      ))}
      {num(counts.err) > 0 && <CapTag item={ERR} variant={variant} count={counts.err}/>}
    </div>
  );
}

/* ── STATE: Ready ─────────────────────────────────────────────────── */
function ReadyView({ mode, chips, setModePreset, toggleChip, onStart }) {
  const deep = mode === "deep";
  return (
    <div className="body">
      {/* row 1 — status + mode */}
      <div className="unirow">
        <div className="status">
          <span className="dot" data-tone="green"/>
          <b>就绪</b>
        </div>
        <div className="seg" data-deep={deep ? 1 : 0}>
          <button data-on={!deep ? 1 : 0} onClick={() => setModePreset("standard")}>标准采集</button>
          <button data-on={deep ? 1 : 0} onClick={() => setModePreset("deep")}>深度采集</button>
        </div>
      </div>

      {/* row 2 — action */}
      <div className="row2">
        <button className="cta" data-tone={deep ? "purple" : "blue"} style={{ flex: 1 }} onClick={onStart}>
          <span className="rec-glyph"/>开始采集
        </button>
      </div>

      {/* row 3 — capture-content tags */}
      <CaptureTags variant="select" chips={chips} toggleChip={toggleChip}/>

      <RecentList/>
    </div>
  );
}

/* ── STATE: Recording (+ warning variant) ────────────────────────── */
function RecordingView({ mode, chips, warning, elapsed, onStop }) {
  const c = warning ? COUNTS.warning : COUNTS.normal;
  return (
    <div className="body">
      {/* row 1 — status + mode */}
      <div className="unirow">
        <div className="status">
          <span className="dot pulse" data-tone="red"/>
          <b className="rec-label">采集中</b>
          <span className="timer mono">{elapsed}</span>
        </div>
        <ModeBadge mode={mode}/>
      </div>

      {/* row 2 — actions */}
      <div className="row2">
        <button className="cta" data-tone="red" style={{ flex: 1.4 }} onClick={onStop}><I.stop/>停止采集</button>
        <a href="detail.html" className="cta ghost"><I.ext/>实时详情</a>
      </div>

      {warning && (
        <div className="banner" data-tone="amber">
          <I.alert/>
          <span>部分响应体未采集，可能由于权限或大小限制。<a href="detail.html" className="link">查看原因</a></span>
        </div>
      )}

      {/* row 3 — capture-content tags (live counts) */}
      <CaptureTags variant="live" chips={chips} counts={c} mode={mode}/>

      <RecentList/>
    </div>
  );
}

/* ── STATE: Saved ─────────────────────────────────────────────────── */
function SavedView({ mode, chips, onNew }) {
  return (
    <div className="body">
      {/* row 1 — status + mode */}
      <div className="unirow">
        <div className="status">
          <span className="ck" data-tone="green"><I.check/></span>
          <b style={{ color: "var(--green-ink)" }}>采集完成</b>
          <span className="timer mono done">12m 42s</span>
        </div>
        <ModeBadge mode={mode}/>
      </div>

      {/* row 2 — actions */}
      <div className="row2 row3btns">
        <a href="detail.html" className="cta" data-tone="blue" style={{ flex: 1.5 }}><I.doc/>打开详情</a>
        <button className="cta ghost" onClick={() => alert("导出格式：JSON · JSONL · HTML Report · HAR")}><I.download/>导出</button>
        <button className="cta ghost" onClick={onNew}>开始新采集</button>
      </div>

      {/* row 3 — capture-content tags (final counts) */}
      <CaptureTags variant="final" chips={chips} counts={COUNTS.normal} mode={mode}/>

      <RecentList savedFirst/>
    </div>
  );
}

/* ── STATE: Capture Settings ──────────────────────────────────────── */
const Check = ({ label, on, warn, info, onToggle }) => (
  <button className="cbox" data-on={on ? 1 : 0} onClick={onToggle}>
    <span className="cbox-mark">{on && <svg viewBox="0 0 16 16" width="11" height="11"><path d="M3 8.2l3 3 7-8" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>}</span>
    <span className="cbox-lbl">{label}</span>
    {warn && <span className="cbox-warn"><I.alert/></span>}
    {info && <span className="cbox-info"><I.info/></span>}
  </button>
);

function SettingsView({ onBack }) {
  const [s, setS] = useState({
    用户操作: true, 页面导航: true, 网络元数据: true, "Console 日志": true,
    Storage: true, Cookie: true, DOM: true,
    输入值: true, 请求体: true, 响应体: true,
    脱敏: true, 敏感字段提示: true,
  });
  const tog = (k) => setS((p) => ({ ...p, [k]: !p[k] }));
  const grp = (title, items) => (
    <div className="set-grp">
      <div className="set-title">{title}</div>
      <div className="set-checks">
        {items.map(([k, opt]) => (
          <Check key={k} label={k} on={s[k]} warn={opt?.warn} info={opt?.info} onToggle={() => tog(k)}/>
        ))}
      </div>
    </div>
  );
  return (
    <div className="body settings">
      <div className="set-hd">
        <button className="iconbtn" onClick={onBack}><I.back/></button>
        <b>采集设置</b>
      </div>
      {grp("基础证据", [["用户操作"], ["页面导航"], ["网络元数据"], ["Console 日志"]])}
      {grp("状态变化", [["Storage"], ["Cookie"], ["DOM"]])}
      {grp("深度采集", [["输入值", { warn: 1 }], ["请求体", { warn: 1 }], ["响应体", { warn: 1 }]])}
      {grp("隐私与安全", [["脱敏"], ["敏感字段提示", { info: 1 }]])}
      <div className="row2">
        <button className="cta" data-tone="blue" style={{ flex: 1 }} onClick={onBack}>保存设置</button>
        <button className="cta ghost" onClick={() => setS({ 用户操作: true, 页面导航: true, 网络元数据: true, "Console 日志": true, Storage: true, Cookie: true, DOM: true, 输入值: true, 请求体: true, 响应体: true, 脱敏: true, 敏感字段提示: true })}>恢复默认</button>
      </div>
    </div>
  );
}

/* ── format mm:ss → HH:MM:SS ──────────────────────────────────────── */
const fmt = (s) => {
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${ss}`;
};

const SCENARIOS = [
  ["ready",     "就绪"],
  ["recording", "采集中"],
  ["warning",   "采集中 · 警告"],
  ["saved",     "采集完成"],
  ["settings",  "采集设置"],
];

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "scenario": "ready",
  "theme": "light",
  "density": "regular",
  "accent": "#2563eb"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [scenario, setScenario] = useState(t.scenario === "deep" ? "ready" : t.scenario);
  const [chips, setChips] = useState(() => {
    const init = { mask: true };
    CAPTURE.forEach((c) => { init[c.k] = !c.deep; });
    return init;
  });
  const [seconds, setSeconds] = useState(207);
  const timer = useRef(null);

  // capture mode is derived: any deep source on → deep
  const mode = CAPTURE.some((c) => c.deep && chips[c.k]) ? "deep" : "standard";
  const setModePreset = (m) =>
    setChips((p) => {
      const next = { ...p };
      CAPTURE.forEach((c) => { if (c.deep) next[c.k] = m === "deep"; });
      return next;
    });
  const toggleChip = (k) => setChips((p) => ({ ...p, [k]: !p[k] }));

  // theme + accent + density on root
  useEffect(() => {
    document.documentElement.dataset.theme = t.theme;
    document.documentElement.dataset.density = t.density;
    document.documentElement.style.setProperty("--blue", t.accent);
    document.documentElement.style.setProperty("--blue-ink", t.accent);
  }, [t.theme, t.density, t.accent]);

  // running timer while recording / warning
  const recording = scenario === "recording" || scenario === "warning";
  useEffect(() => {
    if (recording) {
      setSeconds(scenario === "warning" ? 469 : 207);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      return () => clearInterval(timer.current);
    }
  }, [recording, scenario]);

  const go = (sc) => { setScenario(sc); setTweak("scenario", sc); };

  let view;
  if (scenario === "ready")
    view = <ReadyView mode={mode} chips={chips} setModePreset={setModePreset} toggleChip={toggleChip} onStart={() => go("recording")}/>;
  else if (scenario === "recording")
    view = <RecordingView mode={mode} chips={chips} warning={false} elapsed={fmt(seconds)} onStop={() => go("saved")}/>;
  else if (scenario === "warning")
    view = <RecordingView mode="deep" chips={chips} warning={true} elapsed={fmt(seconds)} onStop={() => go("saved")}/>;
  else if (scenario === "saved")
    view = <SavedView mode={mode} chips={chips} onNew={() => go("ready")}/>;
  else if (scenario === "settings")
    view = <SettingsView onBack={() => go("ready")}/>;

  const recState = scenario === "recording" || scenario === "warning";

  return (
    <div className="stage">
      <div className="stage-head">
        <span className="mark"/>
        <b>Capture All</b><span className="sep">/</span>
        <span>Popup · 采集控制台</span>
      </div>

      <div className={"popup" + (recState ? " is-rec" : "")}>
        <header className="phead">
          <div className="brand">
            <span className="logo"><span className="logo-ring"/></span>
            <b>Capture All</b>
          </div>
          <div className="phead-act">
            <button className="iconbtn" title="采集设置" onClick={() => go("settings")}><I.gear/></button>
            <button className="iconbtn" title="更多"><I.more/></button>
          </div>
        </header>
        {view}
      </div>

      <div className="ctl">
        <span className="ctl-label">状态</span>
        <div className="ctl-seg">
          {SCENARIOS.map(([k, label], i) => (
            <button key={k} data-on={scenario === k ? 1 : 0} onClick={() => go(k)}>
              <span className="num">{i + 1}</span>{label}
            </button>
          ))}
        </div>
      </div>

      <TweaksPanel>
        <TweakSection label="场景"/>
        <TweakSelect label="Popup 状态" value={t.scenario}
          options={SCENARIOS.map(([v, l]) => ({ value: v, label: l }))}
          onChange={(v) => go(v)}/>
        <TweakSection label="外观"/>
        <TweakRadio label="主题" value={t.theme} options={["light", "dark"]}
          onChange={(v) => setTweak("theme", v)}/>
        <TweakRadio label="密度" value={t.density} options={["regular", "compact"]}
          onChange={(v) => setTweak("density", v)}/>
        <TweakColor label="主色" value={t.accent}
          options={["#2563eb", "#0e7c63", "#c2410c", "#6d33e0"]}
          onChange={(v) => setTweak("accent", v)}/>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
