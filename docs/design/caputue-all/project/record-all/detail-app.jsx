/* Capture All — Detail workbench shell */
const { useState: useStateA, useEffect: useEffectA } = React;

const TABS = [
  ["overview","Overview / 概览"],
  ["timeline","Timeline / 时间线"],
  ["network","Network / 网络"],
  ["console","Console / 控制台"],
  ["events","Events / 事件"],
  ["storage","Storage / 存储"],
  ["settings","Settings / 设置"],
];

const STATS = [
  { icon:"clock", lbl:"Start Time / 开始时间", val:"2025-05-17 14:32:05", sub:"Shanghai UTC+08:00" },
  { lbl:"Duration / 时长", val:"00:03:27", sub:"End 14:35:32", mono:true },
  { lbl:"Mode / 模式", val:"Local Time", sub:"本地时间" },
  { lbl:"Total Events / 事件", val:"1,248", sub:"+235 / min", subTone:"green", mono:true },
  { lbl:"Requests / 请求", val:"356", sub:"+68 / min", subTone:"green", mono:true },
  { lbl:"Console / 控制台", val:"24", sub:"2 Errors, 6 Warnings", subTone:"red", mono:true },
  { lbl:"DOM Changes / DOM 变更", val:"18", sub:"+7 / min", subTone:"green", mono:true },
  { lbl:"Storage / 存储", val:"18", sub:"+7 / min", subTone:"green", mono:true, refresh:true },
];

/* left filter rail (Timeline) */
function FilterRail() {
  const [cats, setCats] = useStateA(Object.fromEntries(LANES.map(l=>[l.key,true])));
  const tog = (k)=>setCats(p=>({...p,[k]:!p[k]}));
  return (
    <aside className="rail scroll">
      <div className="rail-hd"><b>Filters / 筛选</b><button className="lnk asbtn">Reset</button></div>
      <div className="rail-sec">
        <div className="rail-sec-hd">Categories / 类别 <button className="lnk asbtn">Select All</button></div>
        <div className="rail-cats">
          {LANES.map(l=>(
            <button className="rail-cat" key={l.key} data-on={cats[l.key]?1:0} onClick={()=>tog(l.key)}>
              <span className="rail-chk" style={{background:cats[l.key]?l.color:"transparent",borderColor:cats[l.key]?l.color:"var(--border-strong)"}}>
                {cats[l.key] && <svg viewBox="0 0 16 16" width="10" height="10"><path d="M3 8.2l3 3 7-8" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </span>
              <span className="rail-cat-ic" style={{color:l.color}}>{DI[l.icon]()}</span>
              <span className="rail-cat-lbl">{l.label.split(" / ")[0]}</span>
              <span className="rail-cat-n mono">{l.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="rail-sec">
        <div className="rail-sec-hd">Type / 类型</div>
        <div className="rail-select"><span>All Types / 全部类型</span><DI.chevD/></div>
      </div>
      <div className="rail-sec">
        <div className="rail-sec-hd">Search / 搜索</div>
        <div className="rail-search"><DI.search/><input placeholder="Search in timeline…"/></div>
      </div>
      <label className="rail-toggle"><input type="checkbox"/> <span>Show only issues / 仅显示问题</span></label>
    </aside>
  );
}

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "view": "timeline",
  "theme": "light",
  "density": "regular",
  "rec": true,
  "inspector": true,
  "accent": "#2563eb"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [view, setView] = useStateA(t.view);
  const [insKind, setInsKind] = useStateA("timeline"); // what the inspector shows
  const [insOpen, setInsOpen] = useStateA(t.inspector);
  const [netSel, setNetSel] = useStateA(5);  // the 500 row
  const [conSel, setConSel] = useStateA(3);  // the error row

  useEffectA(()=>{ setView(t.view); }, [t.view]);
  useEffectA(()=>{ setInsOpen(t.inspector); }, [t.inspector]);
  useEffectA(()=>{
    document.documentElement.dataset.theme = t.theme;
    document.documentElement.dataset.density = t.density;
    document.documentElement.style.setProperty("--blue", t.accent);
    document.documentElement.style.setProperty("--blue-ink", t.accent);
  }, [t.theme, t.density, t.accent]);

  const goView = (v)=>{ setView(v); setTweak("view", v); };
  const hasRail = view === "timeline";
  const showInspector = insOpen && ["timeline","network","console"].includes(view);
  const inspectorKind = view === "network" ? "net-row" : view === "console" ? "console" : insKind;

  const openIns = (k)=>{ if (typeof k === "number") { /* row index handled per-view */ } setInsOpen(true); setTweak("inspector", true); };

  let main;
  if (view === "timeline") main = <TimelineView onSelect={(k)=>{setInsKind(k);openIns();}} density={t.density}/>;
  else if (view === "network") main = <NetworkView onSelect={(i)=>{setNetSel(i);openIns();}} selected={netSel}/>;
  else if (view === "console") main = <ConsoleView onSelect={(i)=>{setConSel(i);openIns();}} selected={conSel}/>;
  else if (view === "overview") main = <OverviewView go={goView}/>;
  else if (view === "storage") main = <StorageView/>;
  else if (view === "events") main = <EventsView/>;
  else if (view === "settings") main = <SettingsViewD/>;

  return (
    <div className="stage">
      <div className="stage-head">
        <span className="mark"/>
        <b>Capture All</b><span className="sep">/</span>
        <span>Detail · 会话分析工作台</span>
      </div>

      <div className="wb">
        {/* top bar */}
        <header className="wb-top">
          <div className="wb-brand">
            <span className="wb-logo"><span className="wb-logo-ring"/></span>
            <b>Capture All</b>
            <span className="wb-sep">Sessions</span><span className="wb-sep">/</span>
            <span className="mono wb-sid">2025-05-17 14:32:05</span>
            <a href="popup.html" className="wb-sep" style={{textDecoration:"none",color:"var(--blue-ink)"}} title="返回 Popup">Popup ↗</a>
            <span className="wb-rec" data-on={t.rec?1:0}>
              <span className="wb-rec-dot"/>{t.rec ? "Capturing / 采集中" : "Stopped / 已停止"}
            </span>
          </div>
          <div className="wb-top-act">
            <div className="wb-search"><DI.search/><input placeholder="Search events, requests, logs…"/></div>
            <button className="wb-btn"><DI.filter/>Filter / 过滤</button>
            <button className="wb-btn"><DI.export/>Export / 导出</button>
            <button className="ibtn"><DI.more/></button>
          </div>
        </header>

        {/* stats strip */}
        <div className="wb-stats">
          {STATS.map((s,i)=>(
            <div className="wb-stat" key={i}>
              {i===0 && <span className="wb-stat-ic"><DI.clock/></span>}
              <div className="wb-stat-body">
                <span className="wb-stat-lbl">{s.lbl}{s.refresh && <DI.refresh style={{marginLeft:6,verticalAlign:-2}}/>}</span>
                <b className={"wb-stat-val"+(s.mono?" mono":"")}>{s.val}</b>
                <span className={"wb-stat-sub mono"+(s.subTone?` t-${s.subTone}`:"")}>{s.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* tabs */}
        <nav className="wb-tabs">
          {TABS.map(([k,l])=>(
            <button key={k} data-on={view===k?1:0} onClick={()=>goView(k)}>{l}</button>
          ))}
        </nav>

        {/* workspace: rail | main | inspector */}
        <div className="wb-body" data-rail={hasRail?1:0} data-insp={showInspector?1:0}>
          {hasRail && <FilterRail/>}
          <main className="wb-main">{main}</main>
          {showInspector && <Inspector kind={inspectorKind} onClose={()=>{setInsOpen(false);setTweak("inspector",false);}}/>}
        </div>

        {/* footer */}
        <footer className="wb-foot">
          <span className="wb-foot-tab"><span className="wb-foot-ic"><DI.console/></span>Console <span className="wb-foot-badge">6</span></span>
          <span className="wb-foot-link">What's new</span>
          <span style={{marginLeft:"auto"}}/>
          <DI.chevD style={{color:"var(--ink-4)"}}/>
        </footer>
      </div>

      <TweaksPanel>
        <TweakSection label="工作台视图"/>
        <TweakSelect label="当前标签" value={t.view}
          options={TABS.map(([v,l])=>({value:v,label:l}))} onChange={goView}/>
        <TweakToggle label="检视面板 Inspector" value={t.inspector} onChange={(v)=>setTweak("inspector",v)}/>
        <TweakToggle label="采集中 Capturing" value={t.rec} onChange={(v)=>setTweak("rec",v)}/>
        <TweakSection label="外观"/>
        <TweakRadio label="主题" value={t.theme} options={["light","dark"]} onChange={(v)=>setTweak("theme",v)}/>
        <TweakRadio label="密度" value={t.density} options={["regular","compact"]} onChange={(v)=>setTweak("density",v)}/>
        <TweakColor label="主色" value={t.accent} options={["#2563eb","#0e7c63","#c2410c","#6d33e0"]} onChange={(v)=>setTweak("accent",v)}/>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
