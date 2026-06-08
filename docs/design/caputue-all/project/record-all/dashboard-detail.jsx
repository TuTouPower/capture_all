/* Capture All — Main panel: 采集详情 (Capture Details) page */
const { useState: useStateDp } = React;

/* ── left filter rail ── */
function DtRail({ quick, setQuick }) {
  const [opts, setOpts] = useStateDp({ onlyErr:false, deep:false, compact:false });
  const [range, setRange] = useStateDp("all");
  const tog = (k) => setOpts(p => ({ ...p, [k]: !p[k] }));
  return (
    <aside className="dt-rail scroll">
      <div className="dt-rail-search">
        <DI.search/>
        <input placeholder="搜索事件、URL、Storage key…"/>
        <kbd>⌘K</kbd>
      </div>

      <div className="dt-rail-sec">
        <div className="dt-rail-hd">快速筛选</div>
        {DT_QUICK.map(q => (
          <button key={q.key} className="qfilter" data-on={quick===q.key?1:0} onClick={()=>setQuick(q.key)}>
            <span className="qf-ic" style={{color:q.color}}>{DI[q.icon]()}</span>
            <span className="qf-lbl">{q.lbl}</span>
            <span className="qf-n">{q.n}</span>
          </button>
        ))}
      </div>

      <div className="dt-rail-sec">
        <div className="dt-rail-hd">显示选项</div>
        <div className="dt-toggle">
          <span className="tg-lbl">{DI.err()} 只看错误</span>
          <span className="switch" data-on={opts.onlyErr?1:0} onClick={()=>tog("onlyErr")}><span className="knob"/></span>
        </div>
        <div className="dt-toggle">
          <span className="tg-lbl">{DI.storage()} 显示深度数据</span>
          <span className="switch" data-on={opts.deep?1:0} onClick={()=>tog("deep")}><span className="knob"/></span>
        </div>
        <div className="dt-toggle">
          <span className="tg-lbl">{DI.list()} 紧凑模式</span>
          <span className="switch" data-on={opts.compact?1:0} onClick={()=>tog("compact")}><span className="knob"/></span>
        </div>
      </div>

      <div className="dt-rail-sec">
        <div className="dt-rail-hd">时间范围</div>
        <button className="rangeopt" data-on={range==="all"?1:0} onClick={()=>setRange("all")}>{DI.clock()} 全部时间</button>
        <button className="rangeopt" data-on={range==="near"?1:0} onClick={()=>setRange("near")}>{DI.flame()} 问题附近 <span className="ro-r">±30s</span></button>
        <button className="rangeopt" data-on={range==="custom"?1:0} onClick={()=>setRange("custom")}>{DI.cal()} 自定义区间</button>
      </div>

      <div className="dt-rail-sec">
        <div className="dt-rail-hd">快捷入口</div>
        <button className="jump"><span className="jp-ic" style={{color:"var(--red-ink)"}}>{DI.flame()}</span><span className="jp-lbl">跳到第一个错误</span><span className="jp-t">+03.680s</span></button>
        <button className="jump"><span className="jp-ic" style={{color:"var(--purple-ink)"}}>{DI.net()}</span><span className="jp-lbl">跳到失败请求</span><span className="jp-t">+03.680s</span></button>
        <button className="jump"><span className="jp-ic" style={{color:"var(--amber-ink)"}}>{DI.console()}</span><span className="jp-lbl">跳到 Console error</span><span className="jp-t">+03.710s</span></button>
      </div>
    </aside>
  );
}

/* ── middle event list ── */
function DtEventList({ view, setView, selIdx, onSelect }) {
  return (
    <div className="dt-list">
      <div className="dt-list-bar">
        <h2>时间线 <span className="cnt mono">（1,284 个事件）</span></h2>
        <div className="spacer"/>
        <div className="viewtog">
          <button data-on={view==="list"?1:0} onClick={()=>setView("list")}>{DI.list()} 列表视图</button>
          <button data-on={view==="trace"?1:0} onClick={()=>setView("trace")}>{DI.trace()} 轨道视图</button>
        </div>
        <button className="btn sm"><DI.filter/>筛选</button>
      </div>

      {view === "trace" ? (
        <div className="dt-events"><TimelineView onSelect={()=>onSelect(7)} density="regular"/></div>
      ) : (
        <div className="dt-events scroll">
          <table className="dt-ev-table">
            <thead>
              <tr><th>时间</th><th>类型</th><th>事件</th><th>详情</th><th>来源</th></tr>
            </thead>
            <tbody>
              {DT_EVENTS.map((e,i) => {
                const k = KIND[e.kind];
                return (
                  <tr key={i} data-sel={selIdx===i?1:0} onClick={()=>onSelect(i)}>
                    <td><span className="ev-t">{e.t}</span></td>
                    <td><span className="ev-type" style={{color:k.color}}>{DI[k.icon]()} {e.type}</span></td>
                    <td><span className={"ev-name"+(e.err?" err":"")}>{e.ev}</span></td>
                    <td>
                      {e.status != null ? (
                        <span>
                          <span className="status-pill" data-ok={e.status<400?1:0}>{e.status}</span>
                          <span className="ev-ms">{e.ms}</span>
                        </span>
                      ) : (
                        <span className={"ev-detail"+(e.kind==="nav"&&e.detail.startsWith("http")?" mono":"")} title={e.detail}>{e.detail}</span>
                      )}
                    </td>
                    <td><span className="ev-src">{e.src}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── right inspector ── */
function DtInspector({ onClose, onJump }) {
  const [tab, setTab] = useStateDp("overview");
  const d = DT_INSP;
  return (
    <aside className="dt-insp scroll">
      <div className="dti-hd">
        <div className="dti-hd-l">
          <div className="dti-title">
            <span className="method" data-m={d.method}>{d.method}</span>
            <b className="mono">{d.path}</b>
          </div>
          <div className="dti-status"><span className="code">{d.status}</span> <span className="txt">{d.statusText}</span></div>
        </div>
        <div className="dti-nav">
          <button className="ibtn" title="上一个"><DI.chevL/></button>
          <button className="ibtn" title="下一个"><DI.chevR/></button>
          <button className="ibtn" onClick={onClose}><DI.close/></button>
        </div>
      </div>

      <div className="dti-tabs">
        {[["overview","概览"],["request","请求"],["response","响应"],["related","相关事件"]].map(([k,l]) => (
          <button key={k} data-on={tab===k?1:0} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>

      <div className="dti-body">
        {tab === "overview" && (<>
          <div className="dti-grid c3">
            <Field k="时长" v={<span className="mono">{d.dur}</span>}/>
            <Field k="资源类型" v={d.restype}/>
            <Field k="开始时间" v={<span className="mono">{d.started}</span>}/>
          </div>
          <div className="dti-div"/>
          <div className="dti-grid">
            <Field k="页面" v={<span className="mono">{d.page}</span>}/>
            <Field k="来源" v={d.origin}/>
          </div>
          <Field k="URL" v={<a>{<span className="mono">{d.url}</span>} {DI.ext()}</a>}/>
          <div className="dti-grid">
            <Field k="状态码" v={<span className="v red">{d.status} {d.statusText}</span>}/>
            <Field k="协议" v={<span className="mono">{d.protocol}</span>}/>
          </div>
          <Field k="发起者" v={<>fetch @ <a className="mono">checkout.ts:42</a></>}/>
          <Field k="大小" v={<span className="mono">{d.size}</span>}/>
          <div className="dti-div"/>
          <div className="dti-sec">相关事件（问题附近）</div>
          <RelatedList rel={d.related} onJump={onJump}/>
        </>)}

        {tab === "request" && (<>
          <div className="dti-sec">Request Headers</div>
          {[["content-type","application/json"],["authorization","Bearer ••••••（已脱敏）"],["x-trace-id","8f3a2b19-6b4e"],["accept","application/json"]].map(([k,v])=>(
            <div className="dti-grid" key={k} style={{gridTemplateColumns:"120px 1fr"}}>
              <span className="mono" style={{fontSize:12,color:"var(--purple-ink)"}}>{k}</span>
              <span className="mono" style={{fontSize:12,color:"var(--ink-2)",wordBreak:"break-all"}}>{v}</span>
            </div>
          ))}
          <div className="dti-div"/>
          <div className="dti-sec">Payload / 请求体</div>
          <div className="codeblock mono scroll"><pre>{`{\n  "items": [{ "sku": "A-128", "qty": 2 }],\n  "coupon": "SAVE10",\n  "address_id": 4821\n}`}</pre></div>
        </>)}

        {tab === "response" && (<>
          <div className="insp-logmsg" style={{margin:"-16px -16px 0",borderRadius:0}}>
            <span className="lvl-tag" data-lvl="error" style={{flex:"none"}}>500</span>
            <span>Internal Server Error — 响应体已采集（深度采集模式）</span>
          </div>
          <div className="dti-sec" style={{marginTop:6}}>Body / 响应体</div>
          <div className="codeblock mono scroll"><pre>{`{\n  "error": "OrderProcessingError",\n  "message": "Cannot read properties of undefined (reading 'id')",\n  "trace_id": "8f3a2b19-6b4e",\n  "status": 500\n}`}</pre></div>
        </>)}

        {tab === "related" && (
          <RelatedList rel={d.related} onJump={onJump}/>
        )}
      </div>

      <div className="dti-foot">
        <div className="dti-foot-row">
          <button className="btn sm"><DI.copy/>复制请求</button>
          <button className="btn sm"><DI.download/>导出 HAR</button>
          <button className="btn sm"><DI.ext/>在 Network 中查看</button>
        </div>
        <button className="btn sm btn-agent"><DI.agent/>Ask local Agent</button>
      </div>
    </aside>
  );
}
const Field = ({ k, v }) => (
  <div className="dti-field"><span className="k">{k}</span><span className="v">{v}</span></div>
);
function RelatedList({ rel, onJump }) {
  return (
    <div className="dti-related">
      {rel.map((r,i) => {
        const k = KIND[r.kind];
        return (
          <button key={i} className="rel-row" onClick={onJump}>
            <span className="rel-t">{r.t}</span>
            <span className="rel-ic" style={{color:k.color}}>{DI[k.icon]()}</span>
            <span className="rel-type" style={{color:k.color}}>{r.type}</span>
            <span className="rel-ev">{r.ev}</span>
            <span className="arr">{DI.chevR()}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── overview tab (问题摘要) ── */
function DtOverview({ go }) {
  return (
    <div className="simple-pad scroll">
      <div className="ov-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginTop:18}}>
        <div className="ov-panel">
          <div className="ov-panel-hd">本次采集摘要</div>
          <div className="dti-grid c3" style={{padding:"6px 0 12px"}}>
            <Field k="时长" v={<span className="mono">12m 42s</span>}/>
            <Field k="事件总数" v={<span className="mono">1,284</span>}/>
            <Field k="错误总数" v={<span className="v red mono">19</span>}/>
          </div>
          <div className="ov-panel-hd" style={{marginTop:6}}>问题概览</div>
          <button className="issue" onClick={()=>go("timeline")}>
            <span className="issue-dot" style={{background:"var(--red)"}}/>
            <span className="issue-main"><b>失败请求 7 个</b><span className="mono">首个错误 +03.680s · POST /api/order 500</span></span>
            {DI.chevR({style:{color:"var(--ink-4)"}})}
          </button>
          <button className="issue" onClick={()=>go("console")}>
            <span className="issue-dot" style={{background:"var(--amber)"}}/>
            <span className="issue-main"><b>Console error 12 个</b><span className="mono">TypeError · app.js:88</span></span>
            {DI.chevR({style:{color:"var(--ink-4)"}})}
          </button>
          <button className="issue" onClick={()=>go("timeline")}>
            <span className="issue-dot" style={{background:"var(--src-user)"}}/>
            <span className="issue-main"><b>错误附近用户操作</b><span className="mono">点击 "Checkout" · +03.410s</span></span>
            {DI.chevR({style:{color:"var(--ink-4)"}})}
          </button>
        </div>

        <div className="ov-panel">
          <div className="ov-panel-hd">关键时间线</div>
          <div className="dti-related" style={{marginTop:4}}>
            {[
              ["+00.840s","nav","打开 /login"],["+01.120s","user",'点击 "Login"'],
              ["+01.720s","nav","进入 /dashboard"],["+03.410s","user",'点击 "Checkout"'],
              ["+03.680s","network","POST /api/order 500"],["+03.710s","console","Console TypeError"],
            ].map(([t,kind,ev],i)=>{ const k=KIND[kind]; return (
              <div key={i} className="rel-row" style={{cursor:"default"}}>
                <span className="rel-t">{t}</span>
                <span className="rel-ic" style={{color:k.color}}>{DI[k.icon]()}</span>
                <span className="rel-ev">{ev}</span>
              </div>
            );})}
          </div>
          <div className="ov-panel-hd" style={{marginTop:16}}>建议入口</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            <button className="btn sm" onClick={()=>go("timeline")}><DI.flame/>查看第一个错误</button>
            <button className="btn sm" onClick={()=>go("network")}><DI.net/>查看失败请求</button>
            <button className="btn sm"><DI.export/>导出报告</button>
            <button className="btn sm btn-agent" style={{width:"auto"}}><DI.agent/>Ask local Agent</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 本次配置 (capture config, renamed from Settings) ── */
function DtConfig() {
  const groups = [
    ["采集模块", [["用户操作",1],["页面导航",1],["网络请求",1],["响应体采集",1],["Console",1],["DOM 变化",1],["Storage / Cookie",1]]],
    ["隐私与脱敏", [["脱敏输入值",1],["脱敏 Header / Token",1],["脱敏响应体敏感字段",0]]],
    ["限制", [["最大采集时长 30 分钟",1],["最大文件大小 500 MB",1]]],
  ];
  return (
    <div className="simple-pad scroll" style={{maxWidth:620}}>
      <p style={{fontSize:12.5,color:"var(--ink-3)",margin:"14px 0 0"}}>本次采集使用的配置（只读快照）。如需修改默认值，请前往 <span className="lnk">设置 → 采集默认值</span>。</p>
      {groups.map(([title,items]) => (
        <div className="ov-panel" key={title} style={{marginTop:14}}>
          <div className="ov-panel-hd">{title}</div>
          {items.map(([l,on]) => (
            <div className="dt-toggle" key={l} style={{padding:"8px 0"}}>
              <span className="tg-lbl">{l}</span>
              <span className="switch" data-on={on}><span className="knob"/></span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function DetailPage({ rec, onBack }) {
  const [tab, setTab] = useStateDp("timeline");
  const [view, setView] = useStateDp("list");
  const [quick, setQuick] = useStateDp("all");
  const [selIdx, setSelIdx] = useStateDp(7);
  const [insOpen, setInsOpen] = useStateDp(true);

  const onMetric = (m) => { if (m.filter){ setTab("timeline"); setQuick(m.filter); } };
  const showRail = tab === "timeline";
  const showInsp = tab === "timeline" && insOpen;

  return (
    <div className="page">
      <div className="dt-bc">
        <button className="back" onClick={onBack}>{DI.chevL()} Capture All</button>
        <span className="sep">/</span>
        <span className="crumb" onClick={onBack}>采集记录</span>
        <span className="sep">/</span>
        <span className="cur">{rec.name}</span>
      </div>

      <div className="dt-head">
        <div className="dt-head-l">
          <div className="dt-title-row">
            <h1>{rec.name}</h1>
            <span className="dt-id">{rec.id} <button className="ibtn" title="复制 ID">{DI.copy()}</button></span>
            <span className="dt-state"><span className="dot"/>已结束</span>
            <span className="chip" data-mode="deep">深度采集</span>
          </div>
          <div className="dt-meta">
            {DI.cal()}<span className="mono">2026-06-06 14:32:08 — 14:44:50</span>
            <span className="mdot">·</span><span>时长 <span className="mono">12m 42s</span></span>
            <span className="mdot">·</span><span className="chip" data-mode="deep" style={{padding:"2px 8px"}}>含响应体采集</span>
          </div>
        </div>
        <div className="dt-head-r">
          <button className="btn"><DI.export/>导出 <DI.chevD/></button>
          <button className="btn"><DI.copy/>复制 ID</button>
          <button className="btn"><DI.clock/>相对时间 <DI.chevD/></button>
          <button className="btn"><DI.ext/>打开原页面</button>
          <button className="ibtn"><DI.more/></button>
        </div>
      </div>

      <div className="dt-metrics">
        {DT_METRICS.map(m => (
          <button key={m.key} className={"dt-metric"+(m.danger?" danger":"")} onClick={()=>onMetric(m)}>
            <span className="dt-metric-top">
              <span className="dt-metric-ic" style={{color:m.color}}>{DI[m.icon]()}</span>
              <span className="dt-metric-lbl">{m.lbl}</span>
            </span>
            <span className="dt-metric-row">
              <span className="dt-metric-val mono">{m.val}</span>
              <span className={"dt-metric-delta t-"+m.tone}>{m.delta}</span>
            </span>
          </button>
        ))}
      </div>

      <nav className="dt-tabs">
        {DT_TABS.map(([k,l]) => (
          <button key={k} data-on={tab===k?1:0} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </nav>

      {tab === "timeline" ? (
        <div className="dt-body" data-insp={showInsp?1:0}>
          <DtRail quick={quick} setQuick={setQuick}/>
          <DtEventList view={view} setView={setView} selIdx={selIdx} onSelect={(i)=>{setSelIdx(i);setInsOpen(true);}}/>
          {showInsp && <DtInspector onClose={()=>setInsOpen(false)} onJump={()=>{}}/>}
        </div>
      ) : tab === "overview" ? (
        <DtOverview go={setTab}/>
      ) : tab === "network" ? (
        <div className="dt-body" data-insp="1">
          <div className="dt-list"><div className="dt-events"><NetworkView onSelect={()=>{}} selected={5}/></div></div>
          <DtInspector onClose={()=>setTab("timeline")} onJump={()=>{}}/>
        </div>
      ) : tab === "console" ? (
        <div className="dt-list" style={{flex:1,minHeight:0}}><div className="dt-events"><ConsoleView onSelect={()=>{}} selected={3}/></div></div>
      ) : tab === "storage" ? (
        <div className="simple-pad"><StorageView/></div>
      ) : tab === "evidence" ? (
        <div className="simple-pad"><EventsView/></div>
      ) : (
        <DtConfig/>
      )}
    </div>
  );
}

Object.assign(window, { DetailPage });
