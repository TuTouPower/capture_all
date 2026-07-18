/* Capture All — Detail workbench views */
const { useState: useStateV, useRef: useRefV, useEffect: useEffectV } = React;

/* ════════ shared bits ════════ */
function Inspector({ kind, onClose }) {
  const [tab, setTab] = useStateV("overview");
  if (kind === "console") return <LogInspector onClose={onClose}/>;
  if (kind === "net-row") return <NetReqInspector onClose={onClose}/>;
  // timeline request details
  const tabs = ["Overview","Request","Response","Headers","Timing","Cookies"];
  const tk = ["overview","request","response","headers","timing","cookies"];
  return (
    <aside className="insp scroll">
      <div className="insp-hd">
        <b>Request Details / 请求详情</b>
        <div className="insp-hd-act">
          <button className="ibtn" title="固定"><DI.pin/></button>
          <button className="ibtn" onClick={onClose}><DI.close/></button>
        </div>
      </div>
      <div className="insp-url">
        <span className="method" data-m="GET">GET</span>
        <span className="mono url-txt">https://api.example.com/v1/users</span>
        <DI.ext style={{ color: "var(--ink-3)", flex: "none" }}/>
      </div>
      <div className="subtabs">
        {tabs.map((x,i) => <button key={x} data-on={tab===tk[i]?1:0} onClick={()=>setTab(tk[i])}>{x}</button>)}
      </div>
      {tab === "response" ? (
        <div className="insp-body">
          <div className="codeblock mono scroll"><pre>{REQ_DETAIL.resp}</pre></div>
        </div>
      ) : tab === "headers" ? (
        <div className="insp-body">
          <KV label="Status" v="200 OK" tone="green"/>
          {[["content-type","application/json"],["cache-control","no-cache"],["x-request-id","8f3a2b19-6b4e"],["content-length","13104"],["server","nginx/1.25.3"]].map(([k,v])=>(
            <div className="hrow mono" key={k}><span className="hk">{k}</span><span className="hv">{v}</span></div>
          ))}
        </div>
      ) : (
        <div className="insp-body">
          <div className="stat3">
            <div><span className="s-lbl">Status / 状态</span><b className="s-val" style={{color:"var(--green-ink)"}}>200 OK</b></div>
            <div><span className="s-lbl">Duration / 耗时</span><b className="s-val mono">245 ms</b></div>
            <div><span className="s-lbl">Size / 大小</span><b className="s-val mono">12.8 KB</b></div>
          </div>
          <div className="insp-sec">General / 常规</div>
          <KV label="Method / 方法" v="GET" mono/>
          <KV label="URL / 地址" v="https://api.example.com/v1/users" mono small/>
          <KV label="Status / 状态" v="200 OK" tone="green"/>
          <KV label="Protocol / 协议" v="HTTP/2" mono/>
          <KV label="Initiator / 发起者" v={<>fetch @ <a className="lnk">users-service.ts:42</a></>}/>
          <KV label="Time / 时间" v="01:42.310" mono/>
          <div className="insp-sec spread">Response Preview / 响应预览 <DI.ext style={{color:"var(--ink-3)"}}/></div>
          <div className="codeblock mono scroll"><pre>{REQ_DETAIL.resp}</pre></div>
        </div>
      )}
    </aside>
  );
}
const KV = ({ label, v, mono, small, tone }) => (
  <div className="kv">
    <span className="kv-k">{label}</span>
    <span className={"kv-v"+(mono?" mono":"")+(small?" sm":"")} style={tone?{color:`var(--${tone}-ink)`}:null}>{v}</span>
  </div>
);

/* ════════ TIMELINE (hero) ════════ */
function TimelineView({ onSelect, density }) {
  const [zoom, setZoom] = useStateV(50);
  const [play, setPlay] = useStateV(49.5); // playhead %
  const trackRef = useRefV(null);
  const TICKS = ["00:00","00:30","01:00","01:30","02:00","02:30","03:00","03:27"];

  const seek = (e) => {
    const el = trackRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const p = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    setPlay(p);
  };
  const onDown = (e) => { seek(e); const mv = (ev)=>seek(ev); const up=()=>{window.removeEventListener("pointermove",mv);window.removeEventListener("pointerup",up);}; window.addEventListener("pointermove",mv); window.addEventListener("pointerup",up); };

  const playLabel = () => {
    const s = (play/100)*207; const m=String(Math.floor(s/60)).padStart(2,"0");
    const ss=(s%60).toFixed(3).padStart(6,"0"); return `${m}:${ss}`;
  };

  return (
    <div className="tl">
      <div className="tl-toolbar">
        <div className="tl-zoom-btns">
          <button className="ibtn" onClick={()=>setZoom(z=>Math.min(100,z+15))}><DI.zoomIn/></button>
          <button className="ibtn" onClick={()=>setZoom(z=>Math.max(0,z-15))}><DI.zoomOut/></button>
          <button className="ibtn" onClick={()=>setZoom(50)}><DI.zoomFit/></button>
        </div>
        <div className="tl-zoom">
          <span>Zoom</span>
          <input type="range" min="0" max="100" value={zoom} onChange={e=>setZoom(+e.target.value)}/>
        </div>
        <div className="tl-tools">
          <button className="ibtn"><DI.expand/></button>
          <button className="ibtn"><DI.zoomFit/></button>
          <button className="ibtn"><DI.refresh/></button>
        </div>
        <span className="tl-playtime mono">{playLabel()}</span>
      </div>

      <div className="tl-grid">
        {/* axis */}
        <div className="tl-axis">
          {TICKS.map((t,i)=><span key={i} className="mono" style={{left:`${(i/(TICKS.length-1))*100}%`}}>{t}</span>)}
        </div>

        <div className="tl-lanes" ref={trackRef} onPointerDown={onDown}>
          {/* playhead */}
          <div className="tl-playhead" style={{left:`${play}%`}}>
            <span className="tl-playhead-lbl mono">{playLabel()}</span>
          </div>
          {LANES.map((lane) => (
            <div className="tl-lane" key={lane.key}>
              <div className="tl-lane-hd">
                <span className="tl-lane-ic" style={{color:lane.color}}>{DI[lane.icon]()}</span>
                <span className="tl-lane-name">{lane.label}</span>
                <span className="tl-lane-count mono">{lane.count}</span>
              </div>
              <div className="tl-lane-track" data-lane={lane.key}>
                {renderLane(lane, onSelect)}
              </div>
            </div>
          ))}
        </div>

        {/* minimap */}
        <div className="tl-minimap">
          <span className="mono tl-mm-edge">00:00</span>
          <div className="tl-mm-track">
            <div className="tl-mm-window" style={{left:`${Math.max(0,play-22)}%`,width:"44%"}}/>
          </div>
          <span className="mono tl-mm-edge">03:27</span>
        </div>
      </div>
    </div>
  );
}
function renderLane(lane, onSelect) {
  const d = LANE_DATA[lane.key];
  if (lane.key === "nav") return d.map((s,i)=>{
    const next = d[i+1]?.pos ?? 100;
    return <span key={i} className="tl-seg" style={{left:`${s.pos}%`,width:`${next-s.pos-1}%`,borderColor:lane.color,color:lane.color}}><span className="tl-seg-ic"/>{s.label}</span>;
  });
  if (lane.key === "errors") return d.map((s,i)=>(
    <span key={i} className="tl-diamond" style={{left:`${s.pos}%`}} onClick={(e)=>{e.stopPropagation();onSelect("net-row");}}/>
  ));
  if (lane.key === "console") return d.map((s,i)=>(
    <span key={i} className={"tl-dot"+(s.kind==="warn"?" warn":"")} style={{left:`${s.pos}%`,background:s.kind==="warn"?"var(--amber)":lane.color}} onClick={(e)=>{e.stopPropagation();onSelect("console");}}/>
  ));
  // tick lanes (network / ui / dom / storage)
  return d.map((s,i)=>(
    <span key={i} className="tl-tick" onClick={(e)=>{e.stopPropagation();onSelect("timeline");}}
      style={{left:`${s.pos}%`,height:`${40+(s.h||.6)*55}%`,background:s.kind==="warn"?"var(--amber)":lane.color}}/>
  ));
}

/* ════════ NETWORK ════════ */
function NetworkView({ onSelect, selected }) {
  const [f, setF] = useStateV("All");
  const filters = ["All","Fetch/XHR","Doc","CSS","JS","Img","Media","Font","WS","Other"];
  return (
    <div className="net">
      <div className="net-toolbar">
        <div className="net-filters">
          {filters.map(x=><button key={x} data-on={f===x?1:0} onClick={()=>setF(x)}>{x}</button>)}
        </div>
        <label className="net-hide"><input type="checkbox" defaultChecked/> Hide data URLs</label>
        <button className="ibtn" title="清除"><DI.close/></button>
      </div>
      <div className="net-table scroll">
        <div className="net-row net-head mono">
          <span>Time <DI.sortD/></span><span>Method</span><span>URL</span><span>Status</span>
          <span>Type</span><span>Size</span><span>Duration</span><span>Waterfall</span>
        </div>
        {NET_ROWS.map((r,i)=>(
          <div key={i} className={"net-row"+(r.err?" err":"")+(selected===i?" sel":"")} onClick={()=>onSelect(i)}>
            <span className="mono dim">{r.t}</span>
            <span className="mono"><span className="method-sm" data-m={r.m}>{r.m}</span></span>
            <span className="mono url-cell" title={r.url}>{r.url}</span>
            <span className="mono" style={{color:r.err?"var(--red-ink)":r.pending?"var(--amber-ink)":"var(--green-ink)"}}>{r.st}</span>
            <span className="mono dim">{r.type}</span>
            <span className="mono">{r.size}</span>
            <span className="mono" style={{color:r.err?"var(--red-ink)":"inherit"}}>{r.pending?"Pending":r.dur+" ms"}</span>
            <span className="wf"><span className="wf-bar" data-err={r.err?1:0} data-pend={r.pending?1:0} style={{left:`${i*7}%`,width:`${Math.max(4,r.w*42)}%`}}/></span>
          </div>
        ))}
      </div>
      <div className="net-foot mono">356 requests · 1 failed · 12.8 MB transferred · 3.21 s (onload: 2.34 s)</div>
    </div>
  );
}
function NetReqInspector({ onClose }) {
  const [tab, setTab] = useStateV("headers");
  return (
    <aside className="insp scroll">
      <div className="insp-hd">
        <b>Request Details / 请求详情</b>
        <div className="insp-hd-act"><button className="ibtn" onClick={onClose}><DI.close/></button></div>
      </div>
      <div className="insp-url">
        <span className="method" data-m="GET">GET</span>
        <span className="mono url-txt">https://api.example.com/v1/notifications</span>
      </div>
      <div className="subtabs">
        {["Headers","Response","Timing","Cookies"].map((x,i)=>{const k=x.toLowerCase();return <button key={x} data-on={tab===k?1:0} onClick={()=>setTab(k)}>{x}</button>;})}
      </div>
      <div className="insp-body">
        <div className="stat3 stat3-tight">
          <div><span className="s-lbl">Status</span><b className="s-val" style={{color:"var(--red-ink)"}}>500 Internal Server Error</b></div>
        </div>
        <KV label="Duration" v="523 ms" mono/>
        <KV label="Size" v="0 B" mono/>
        <div className="insp-sec spread" style={{marginTop:14}}>Response Headers <DI.chevD/></div>
        {[["content-type","application/json"],["date","Sat, 17 May 2025 06:34:15 GMT"],["server","nginx/1.25.3"],["x-request-id","8f3a2b19-6b4e-4c7c-9a32e-1b8e"],["content-length","0"]].map(([k,v])=>(
          <div className="hrow mono" key={k}><span className="hk">{k}</span><span className="hv">{v}</span></div>
        ))}
        <div className="insp-sec spread" style={{marginTop:14}}>Request Headers (12) <DI.chevR/></div>
      </div>
    </aside>
  );
}

/* ════════ CONSOLE ════════ */
function ConsoleView({ onSelect, selected }) {
  const [f, setF] = useStateV("all");
  const segs = [["all","All",null],["error","Errors",2],["warn","Warnings",6],["info","Info",16],["verbose","Verbose",0]];
  const tone = { error:"red", warn:"amber", info:"blue", log:"ink" };
  const rows = CON_ROWS.filter(r => f==="all" || r.lvl===f || (f==="info" && r.lvl==="log"));
  return (
    <div className="con">
      <div className="con-toolbar">
        <div className="con-filters">
          {segs.map(([k,l,c])=>(
            <button key={k} data-on={f===k?1:0} data-lvl={k} onClick={()=>setF(k)}>
              {c!=null && <span className="con-cnt" data-lvl={k}>{c}</span>}{l}
            </button>
          ))}
        </div>
        <label className="net-hide"><input type="checkbox" defaultChecked/> Preserve log</label>
      </div>
      <div className="con-table scroll">
        <div className="con-row con-head mono"><span>Time</span><span>Level</span><span>Message</span><span>Source</span><span>Line</span></div>
        {rows.map((r,i)=>(
          <div key={i} className={"con-row"+(r.lvl==="error"?" err":"")+(selected===i?" sel":"")} onClick={()=>onSelect(i)}>
            <span className="mono dim">{r.t}</span>
            <span><span className="lvl-tag" data-lvl={r.lvl}>{r.lvl}</span></span>
            <span className="con-msg" style={{color:r.lvl==="error"?"var(--red-ink)":"inherit"}}>{r.msg}</span>
            <span className="mono dim">{r.src}</span>
            <span className="mono dim">{r.ln}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
function LogInspector({ onClose }) {
  return (
    <aside className="insp scroll">
      <div className="insp-hd">
        <b>Log Details / 日志详情</b>
        <div className="insp-hd-act"><button className="ibtn" onClick={onClose}><DI.close/></button></div>
      </div>
      <div className="insp-logmsg"><span className="lvl-tag" data-lvl="error">error</span><span>Failed to load notifications: 500 Internal Server Error</span></div>
      <div className="insp-body">
        <KV label="Source" v="notifications.ts:56" mono/>
        <KV label="Time" v="00:01:14.210" mono/>
        <div className="insp-sec">Stack Trace / 堆栈跟踪</div>
        <div className="stack mono scroll">
          {[["fetchNotifications","notifications.ts:56:15"],["async loadNotifications","notifications.ts:21:8"],["onClick","notifications/button.tsx:18:7"],["HTMLButtonElement.<anonymous>","index.ts:1:23456"]].map(([fn,loc],i)=>(
            <div className="stack-row" key={i}><span className="stack-fn">{fn}</span><a className="stack-loc lnk">@ {loc}</a></div>
          ))}
        </div>
        <div className="insp-sec">Details / 详情</div>
        <p className="insp-note">Error: Request failed with status code 500</p>
        <div className="codeblock mono scroll"><pre>{`{\n  "status": 500,\n  "statusText": "Internal Server Error",\n  "url": "https://api.example.com/v1/notifications"\n}`}</pre></div>
      </div>
    </aside>
  );
}

/* ════════ OVERVIEW ════════ */
function OverviewView({ go }) {
  const cards = [
    { k:"net", label:"网络请求", v:"356", sub:"1 failed · 12.8 MB", color:"var(--src-network)", tab:"network" },
    { k:"ui",  label:"界面事件", v:"1,024", sub:"clicks · inputs · scroll", color:"var(--src-user)", tab:"timeline" },
    { k:"console", label:"控制台日志", v:"24", sub:"2 errors · 6 warnings", color:"var(--src-console)", tab:"console" },
    { k:"err", label:"错误", v:"2", sub:"1 network · 1 runtime", color:"var(--src-error)", tab:"console" },
  ];
  return (
    <div className="ov scroll">
      <div className="ov-cards">
        {cards.map(c=>(
          <button key={c.k} className="ov-card" onClick={()=>go(c.tab)}>
            <span className="ov-ic" style={{color:c.color}}>{DI[c.k]()}</span>
            <span className="ov-v mono">{c.v}</span>
            <span className="ov-lbl">{c.label}</span>
            <span className="ov-sub mono">{c.sub}</span>
          </button>
        ))}
      </div>
      <div className="ov-2col">
        <div className="ov-panel">
          <div className="ov-panel-hd">关键问题 / Key Issues</div>
          <button className="issue" onClick={()=>go("network")}>
            <span className="issue-dot" style={{background:"var(--red)"}}/>
            <span className="issue-main"><b>500 Internal Server Error</b><span className="mono">GET /v1/notifications · 00:01:14.210</span></span>
            <DI.chevR style={{color:"var(--ink-4)"}}/>
          </button>
          <button className="issue" onClick={()=>go("console")}>
            <span className="issue-dot" style={{background:"var(--amber)"}}/>
            <span className="issue-main"><b>Deprecated API usage</b><span className="mono">api.ts:87 · 00:01:13.456</span></span>
            <DI.chevR style={{color:"var(--ink-4)"}}/>
          </button>
          <button className="issue" onClick={()=>go("console")}>
            <span className="issue-dot" style={{background:"var(--amber)"}}/>
            <span className="issue-main"><b>Slow network detected (RTT 320ms)</b><span className="mono">network.ts:12 · 00:01:15.890</span></span>
            <DI.chevR style={{color:"var(--ink-4)"}}/>
          </button>
        </div>
        <div className="ov-panel">
          <div className="ov-panel-hd">导航路径 / Navigation</div>
          <div className="ov-flow">
            {["/","/dashboard","/settings"].map((p,i)=>(
              <React.Fragment key={p}>
                <span className="ov-route mono">{p}</span>
                {i<2 && <span className="ov-arrow">→</span>}
              </React.Fragment>
            ))}
          </div>
          <div className="ov-panel-hd" style={{marginTop:18}}>数据源分布 / Sources</div>
          <div className="ov-bars">
            {LANES.map(l=>(
              <div className="ov-bar-row" key={l.key}>
                <span className="ov-bar-lbl">{l.label.split(" / ")[0]}</span>
                <span className="ov-bar"><span className="ov-bar-fill" style={{width:`${Math.min(100,(l.count/1024)*100+6)}%`,background:l.color}}/></span>
                <span className="ov-bar-n mono">{l.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════ light placeholder views ════════ */
function SimpleTable({ cols, rows }) {
  return (
    <div className="net" style={{padding:0}}>
      <div className="net-table scroll" style={{borderTop:0}}>
        <div className="con-row con-head mono" style={{gridTemplateColumns:cols.tpl}}>{cols.h.map(h=><span key={h}>{h}</span>)}</div>
        {rows.map((r,i)=>(
          <div key={i} className="con-row" style={{gridTemplateColumns:cols.tpl}}>
            {r.map((c,j)=><span key={j} className={"mono"+(j>0?" dim":"")}>{c}</span>)}
          </div>
        ))}
      </div>
    </div>
  );
}
function StorageView() {
  return <SimpleTable cols={{tpl:"110px 80px 1fr 1fr 90px", h:["Time","Type","Key","Value","Source"]}} rows={[
    ["00:01:12.4","local","auth_token","eyJhbGc…(redacted)","auth.ts"],
    ["00:01:13.1","session","user_id","u_88213","profile.ts"],
    ["00:01:13.5","cookie","sid","s_4f2a…","login.ts"],
    ["00:01:14.5","local","settings","{theme:'dark'}","settings.ts"],
    ["00:01:15.2","session","ws_token","wt_91ac…","websocket.ts"],
  ]}/>;
}
function EventsView() {
  return <SimpleTable cols={{tpl:"110px 90px 1fr 1fr 70px", h:["Time","Type","Target","Detail","Source"]}} rows={[
    ["00:01:12.3","click","button#login","{x:420,y:280}","ui"],
    ["00:01:12.8","input","input#email","a***@***.com","ui"],
    ["00:01:13.4","scroll","window","y: 0→640","ui"],
    ["00:01:14.0","click","a.nav-settings","/settings","ui"],
    ["00:01:14.6","keydown","input#search","Enter","ui"],
  ]}/>;
}
function SettingsViewD() {
  const groups = [
    ["回放设置 / Playback", [["自动跟随播放头",1],["显示事件标签",1],["平滑滚动",0]]],
    ["显示 / Display", [["显示已脱敏字段",1],["合并相邻事件",0],["高亮关键问题",1]]],
    ["导出 / Export", [["包含响应体",1],["包含堆栈跟踪",1],["压缩为 .zip",0]]],
  ];
  return (
    <div className="ov scroll" style={{maxWidth:560}}>
      {groups.map(([title,items])=>(
        <div className="ov-panel" key={title} style={{marginBottom:14}}>
          <div className="ov-panel-hd">{title}</div>
          {items.map(([l,on])=>(
            <label className="set-toggle" key={l}>
              <span>{l}</span>
              <span className="switch" data-on={on}><span className="knob"/></span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { Inspector, TimelineView, NetworkView, ConsoleView, OverviewView, StorageView, EventsView, SettingsViewD });
