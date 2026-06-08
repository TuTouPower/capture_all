/* Capture All — Main panel (主面板) shell: window chrome + sidebar + routing */
const { useState: useStateD, useEffect: useEffectD } = React;

/* ── secondary pages (lighter, real) ── */
function CurrentPage({ onOpen }) {
  const live = CAP_ROWS.filter(r => r.active).concat([{ id:"rec_n90k", name:"实时采集 · localhost", url:"http://localhost:3000/checkout", time:"刚刚", dur:"00:03:28", mode:"deep", events:"412", reqs:"96", errs:1, size:"3.2 KB", exp:{on:false}, tag:"本地", active:true }]);
  return (
    <div className="page">
      <div className="pg-head">
        <div className="pg-title"><h1>当前采集</h1><p>正在进行的采集会话，实时查看事件流并随时停止。</p></div>
        <div className="pg-actions"><button className="btn"><DI.export/>导出</button><button className="btn primary"><DI.play/>开始新采集</button></div>
      </div>
      <div className="simple-pad scroll">
        <div className="live-banner">
          <span className="lb-dot"/>
          <div className="lb-main"><b>采集中</b><span className="lb-time">00:03:28</span><p>app.example.com/dashboard · 含响应体采集</p></div>
          <button className="btn danger"><DI.stop/>停止采集</button>
          <button className="btn" onClick={()=>onOpen(CAP_ROWS[0])}><DI.expand/>实时详情</button>
        </div>
        {live.map(r => (
          <div className="exp-task" key={r.id} onClick={()=>onOpen(r)} style={{cursor:"pointer"}}>
            <span className="et-ic" style={{color:"var(--blue-ink)"}}>{DI.navCurrent()}</span>
            <div className="et-main"><b>{r.name}</b><div className="et-sub">{r.url.replace(/^https?:\/\//,"")} · {r.events} 事件 · {r.reqs} 请求</div></div>
            <span className="dt-state"><span className="dot" style={{background:"var(--blue)"}}/><span style={{color:"var(--blue-ink)"}} className="mono">{r.dur}</span></span>
            <button className="ibtn">{DI.more()}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExportsPage() {
  const tasks = [
    { name:"今天 14:32 的采集", fmt:"JSON · 12.8 MB", pct:100, done:true },
    { name:"昨天 18:05 的采集", fmt:"HAR · 含响应体", pct:64, done:false },
    { name:"批量导出 · 6 条记录", fmt:"ZIP · 预计 48 MB", pct:28, done:false },
    { name:"5月15日 16:07 的采集", fmt:"报告 (PDF)", pct:100, done:true },
  ];
  return (
    <div className="page">
      <div className="pg-head">
        <div className="pg-title"><h1>导出任务</h1><p>查看导出进度、下载已完成的文件或重试失败的任务。</p></div>
        <div className="pg-actions"><button className="btn"><DI.reset/>清除已完成</button><button className="btn primary"><DI.export/>新建导出</button></div>
      </div>
      <div className="simple-pad scroll">
        {tasks.map((t,i) => (
          <div className="exp-task" key={i}>
            <span className="et-ic">{DI.navExport()}</span>
            <div className="et-main"><b>{t.name}</b><div className="et-sub">{t.fmt}</div></div>
            {t.done ? (
              <span className="exp-done">{DI.check2({viewBox:"0 0 16 16",width:13,height:13,style:{stroke:"var(--green-ink)"}})} 已完成</span>
            ) : (<>
              <span className="exp-bar"><i style={{width:t.pct+"%"}}/></span>
              <span className="exp-pct">{t.pct}%</span>
            </>)}
            <button className="ibtn">{t.done ? DI.download() : DI.more()}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function IntegrationsPage() {
  return (
    <div className="page">
      <div className="pg-head">
        <div className="pg-title"><h1>MCP / 集成</h1><p>连接本地 Agent、MCP 服务与外部平台，把采集数据接入你的工作流。</p></div>
        <div className="pg-actions"><button className="btn primary"><DI.plus/>添加集成</button></div>
      </div>
      <div className="simple-pad scroll">
        <div className="integrations" style={{marginTop:14}}>
          {[
            ["MCP","navMcp","连接本地或远程 MCP 服务，向 Agent 暴露采集数据",true,"配置"],
            ["本地 Agent","navCurrent","连接本地 Agent 以分析与回答问题",true,"配置"],
            ["Webhook","navExport","采集结束后向自定义地址推送事件",false,"连接"],
            ["Issue 平台","err","把失败请求与错误同步为 Issue",false,"连接"],
          ].map(([name,ic,desc,on,btn])=>(
            <div className="integ-card" key={name}>
              <div className="integ-top">
                <span className="integ-ic">{DI[ic]()}</span>
                <div className="integ-meta"><b>{name}</b><span>{desc}</span></div>
                <span className="integ-state" data-on={on?1:0}>{on?"已连接":"未连接"}</span>
              </div>
              <button className="btn sm" style={{justifyContent:"center"}}>{btn}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const TWEAK_DEFAULTS_D = /*EDITMODE-BEGIN*/{
  "page": "captures",
  "theme": "light",
  "accent": "#3b82f6"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS_D);
  const [page, setPage] = useStateD(t.page);
  const [rec, setRec] = useStateD(CAP_ROWS[0]);

  useEffectD(() => { setPage(t.page); }, [t.page]);
  useEffectD(() => {
    document.documentElement.dataset.theme = t.theme;
    document.documentElement.style.setProperty("--blue", t.accent);
    document.documentElement.style.setProperty("--blue-ink", t.accent);
  }, [t.theme, t.accent]);

  const go = (p) => { setPage(p); setTweak("page", p); };
  const openRec = (r) => { setRec(r); setPage("detail"); setTweak("page","detail"); };
  /* nav highlight: detail belongs under 采集记录 */
  const navActive = page === "detail" ? "captures" : page;

  let body;
  if (page === "captures") body = <CapturesPage onOpen={openRec}/>;
  else if (page === "detail") body = <DetailPage rec={rec} onBack={()=>go("captures")}/>;
  else if (page === "current") body = <CurrentPage onOpen={openRec}/>;
  else if (page === "exports") body = <ExportsPage/>;
  else if (page === "settings") body = <SettingsPage/>;
  else if (page === "integrations") body = <IntegrationsPage/>;

  return (
    <div className="stage">
      <div className="app">
        <div className="titlebar">
          <span className="tl-lights"><i/><i/><i/></span>
          <span className="tl-title">Capture All — 主面板</span>
        </div>
        <div className="app-body">
          <aside className="sidebar">
            <div className="sb-brand">
              <span className="sb-logo"><span className="sb-logo-ring"/></span>
              <b>Capture All</b>
            </div>
            <nav className="sb-nav">
              {NAV.map(n => (
                <button key={n.key} className="sb-item" data-on={navActive===n.key?1:0} onClick={()=>go(n.key)}>
                  <span className="sb-ic">{DI[n.icon]()}</span>
                  <span className="sb-lbl">{n.lbl}</span>
                  {n.badge && <span className="sb-badge mono">{n.badge}</span>}
                </button>
              ))}
            </nav>
            <div className="sb-spacer"/>
            <div className="sb-user">
              <span className="sb-ava">A</span>
              <div className="sb-user-meta"><b>Alice</b><span>alice@example.com</span></div>
              <button className="ibtn">{DI.chevD()}</button>
            </div>
          </aside>
          <div className="content">{body}</div>
        </div>
      </div>

      <TweaksPanel>
        <TweakSection label="主面板"/>
        <TweakSelect label="当前页面" value={page} options={[
          {value:"captures",label:"采集记录"},{value:"detail",label:"采集详情"},
          {value:"current",label:"当前采集"},{value:"exports",label:"导出任务"},
          {value:"settings",label:"设置"},{value:"integrations",label:"MCP / 集成"},
        ]} onChange={go}/>
        <TweakSection label="外观"/>
        <TweakRadio label="主题" value={t.theme} options={["light","dark"]} onChange={(v)=>setTweak("theme",v)}/>
        <TweakColor label="主色" value={t.accent} options={["#2563eb","#1d4ed8","#3b82f6","#1e40af"]} onChange={(v)=>setTweak("accent",v)}/>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
