/* Capture All 全采 — Popup (采集控制台)
   Unified popup panel. 3 states: 就绪 / 采集中 / 采集完成.
   Static UI + state transitions only — no real capture logic. */

const { useState, useEffect, useRef } = React;

/* ── inline icon set (standard UI glyphs only) ──────────────────────── */
const I = {
  /* open_in_new — box + arrow to top-right (主面板 / 实时详情) */
  ext: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 14v4.5A1.5 1.5 0 0 1 17.5 20h-12A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5H10"/></svg>,
  clock: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7.5v4.8l3 1.7"/></svg>,
  chevron: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 18l6-6-6-6"/></svg>,
  check: (p) => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9"/><path d="M8.4 12.4l2.5 2.5 4.7-5.3"/></svg>,
  download: (p) => <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3.5v11m0 0l-3.8-3.8M12 14.5l3.8-3.8M5 19.5h14"/></svg>,
  doc: (p) => <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M7 3.5h7l5 5v12H7z"/><path d="M14 3.5v5h5M10 13h6M10 16.5h4"/></svg>,
  refresh: (p) => <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 11.5A8 8 0 1 0 18 17"/><path d="M20 5v5h-5"/></svg>,
  stop: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" {...p}><rect x="6" y="6" width="12" height="12" rx="3"/></svg>,
  /* capture-source glyphs */
  pointer: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" {...p}><path d="M5 3l5.4 15.6 2.25-6.45 6.45-2.25z"/></svg>,
  globe: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/></svg>,
  braces: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M8 4c-2 0-2.5 1-2.5 3.5S5 11 3.5 12c1.5 1 2 2 2 4.5S6 20 8 20M16 4c2 0 2.5 1 2.5 3.5S19 11 20.5 12c-1.5 1-2 2-2 4.5S18 20 16 20"/></svg>,
  console: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="2.5" y="4" width="19" height="16" rx="2.5"/><path d="M6 9l3 3-3 3M12.5 15h4"/></svg>,
  alert: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4.5M12 17h.01"/></svg>,
  storage: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>,
  cookie: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3a9 9 0 1 0 9 9 4 4 0 0 1-5-5 4 4 0 0 1-4-4z"/><path d="M9 11.5h.01M14 14.5h.01M9.5 15.5h.01M15 9h.01"/></svg>,
  shield: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/></svg>,
};

/* ── the 8 capture sources (fixed order + colors per spec) ──────────── */
const CAPTURE = [
  { k: "user",    label: "用户行为", icon: "pointer", tone: "blue"   },
  { k: "nav",     label: "页面导航", icon: "globe",   tone: "indigo" },
  { k: "net",     label: "网络请求", icon: "braces",  tone: "purple" },
  { k: "console", label: "控制台",   icon: "console", tone: "amber"  },
  { k: "err",     label: "错误异常", icon: "alert",   tone: "red"    },
  { k: "storage", label: "Storage",  icon: "storage", tone: "green"  },
  { k: "cookie",  label: "Cookie",   icon: "cookie",  tone: "cyan"   },
  { k: "mask",    label: "脱敏",     icon: "shield",  tone: "green"  },
];

/* mock collected counts (采集中 / 采集完成) */
const COUNTS = { user: "248", nav: "12", net: "356", console: "24", err: "2", storage: "18", cookie: "6", mask: "18" };

/* recent recordings — no error counts shown */
const RECENT = [
  { id: "rec_x82a", when: "今天 14:32",  mode: "deep",     dur: "12m 42s", events: "1,284" },
  { id: "rec_p41c", when: "昨天 18:05",  mode: "deep",     dur: "8m 11s",  events: "3,882" },
  { id: "rec_k09d", when: "5月15日 16:07", mode: "standard", dur: "22m 33s", events: "1,102" },
];

const ModeBadge = ({ mode }) => (
  <span className="badge" data-mode={mode}>{mode === "deep" ? "深度采集" : "标准采集"}</span>
);

/* ── unified capture-data card — icon + name (+ count below when recording) ── */
function MetricCard({ item, count }) {
  const Icon = I[item.icon];
  const has = count != null;
  return (
    <div className="mcard" data-tone={item.tone} data-count={has ? 1 : 0}>
      <div className="mcard-row">
        <span className="mcard-ic"><Icon/></span>
        <span className="mcard-lbl">{item.label}</span>
      </div>
      {has && <span className="mcard-n mono">{count}</span>}
    </div>
  );
}

function MetricGrid({ counts }) {
  return (
    <div className="metrics">
      {CAPTURE.map((it) => (
        <MetricCard key={it.k} item={it} count={counts ? counts[it.k] : null}/>
      ))}
    </div>
  );
}

/* recent list — shared by all states */
function RecentList() {
  return (
    <div className="recent">
      <div className="recent-hd">
        <span>最近采集</span>
        <a href="detail.html" className="link" onClick={(e) => { e.preventDefault(); console.log("查看全部"); }}>
          查看全部 <I.chevron/>
        </a>
      </div>
      <div className="recent-list">
        {RECENT.map((r) => (
          <a key={r.id} href="detail.html" className="recent-row"
             onClick={(e) => { e.preventDefault(); console.log("查看详情", r.id); }}>
            <span className="recent-ic"><I.clock/></span>
            <span className="recent-main">
              <span className="recent-top">
                <b>{r.when}</b><ModeBadge mode={r.mode}/>
              </span>
              <span className="recent-sub mono">{r.dur} · {r.events} events</span>
            </span>
            <span className="recent-go link">查看详情 <I.chevron/></span>
          </a>
        ))}
      </div>
    </div>
  );
}

/* ── STATE A · 开始采集 ─────────────────────────────────────────────── */
function ReadyView({ onStart }) {
  return (
    <div className="body">
      <div className="action">
        <button className="actbtn act-start" onClick={onStart}>
          <span className="start-glyph"/>
          <span className="start-txt">开始采集</span>
        </button>
      </div>

      <MetricGrid counts={null}/>
      <RecentList/>
    </div>
  );
}

/* ── STATE B · 采集中 — red timer doubles as the “点击结束” button ────── */
function RecordingView({ elapsed, onStop }) {
  return (
    <div className="body">
      <div className="action">
        <button className="actbtn act-stop" onClick={onStop} title="点击结束采集">
          <span className="stop-glyph"><I.stop/></span>
          <span className="stop-time mono">{elapsed}</span>
          <span className="stop-hint">点击结束</span>
        </button>
        <button className="actbtn act-ghost" onClick={() => console.log("打开实时详情")}>
          <I.ext/><span>实时详情</span>
        </button>
      </div>

      <MetricGrid counts={COUNTS}/>
      <RecentList/>
    </div>
  );
}

/* ── STATE C · 采集完成 ─────────────────────────────────────────────── */
function SavedView({ onNew }) {
  return (
    <div className="body">
      <div className="action">
        <div className="act-done">
          <span className="done-time mono">12m 42s</span>
          <span className="done-check"><I.check/></span>
        </div>
        <div className="act-col">
          <a href="detail.html" className="actbtn act-ghost"
             onClick={(e) => { e.preventDefault(); console.log("打开详情"); }}>
            <I.ext/><span>查看详情</span>
          </a>
          <button className="actbtn act-ghost" onClick={onNew}>
            <I.refresh/><span>开始新采集</span>
          </button>
        </div>
      </div>

      <MetricGrid counts={COUNTS}/>
      <RecentList/>
    </div>
  );
}

/* ── mm:ss formatter (HH:MM:SS) ─────────────────────────────────────── */
const fmt = (s) => {
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${ss}`;
};

const SCENARIOS = [
  ["ready",     "开始采集"],
  ["recording", "采集中"],
  ["saved",     "采集完成"],
];

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "scenario": "ready",
  "theme": "light",
  "density": "regular",
  "accent": "#6d33e0"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [scenario, setScenario] = useState(SCENARIOS.some(([k]) => k === t.scenario) ? t.scenario : "ready");
  const [seconds, setSeconds] = useState(208);        // 00:03:28
  const timer = useRef(null);

  /* appearance: theme / density / accent (drives blue-purple primary) */
  useEffect(() => {
    document.documentElement.dataset.theme = t.theme;
    document.documentElement.dataset.density = t.density;
    document.documentElement.style.setProperty("--purple", t.accent);
    document.documentElement.style.setProperty("--purple-ink", t.accent);
  }, [t.theme, t.density, t.accent]);

  /* running timer while recording */
  useEffect(() => {
    if (scenario === "recording") {
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      return () => clearInterval(timer.current);
    }
  }, [scenario]);

  const go = (sc) => { setScenario(sc); setTweak("scenario", sc); };
  const start = () => { setSeconds(208); go("recording"); };
  const stop  = () => { go("saved"); };
  const reset = () => { setSeconds(208); go("ready"); };

  let view;
  if (scenario === "recording")
    view = <RecordingView elapsed={fmt(seconds)} onStop={stop}/>;
  else if (scenario === "saved")
    view = <SavedView onNew={reset}/>;
  else
    view = <ReadyView onStart={start}/>;

  return (
    <div className="stage">
      <div className="stage-head">
        <span className="mark"/>
        <b>Capture All</b><span className="sep">/</span>
        <span>Popup · 采集控制台</span>
      </div>

      <div className={"popup" + (scenario === "recording" ? " is-rec" : "")}>
        <header className="phead">
          <div className="brand">
            <span className="logo"><span className="logo-ring"/></span>
            <b>Capture All <span className="brand-cn">全采</span></b>
          </div>
          <button className="panelbtn" title="打开主面板" onClick={() => console.log("打开主面板")}>
            <I.ext/><span>主面板</span>
          </button>
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
        <TweakSelect label="Popup 状态" value={scenario}
          options={SCENARIOS.map(([v, l]) => ({ value: v, label: l }))}
          onChange={(v) => go(v)}/>
        <TweakSection label="外观"/>
        <TweakRadio label="主题" value={t.theme} options={["light", "dark"]}
          onChange={(v) => setTweak("theme", v)}/>
        <TweakRadio label="密度" value={t.density} options={["regular", "compact"]}
          onChange={(v) => setTweak("density", v)}/>
        <TweakColor label="主色" value={t.accent}
          options={["#6d33e0", "#5b41e0", "#7c3aed", "#4f46e5"]}
          onChange={(v) => setTweak("accent", v)}/>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
