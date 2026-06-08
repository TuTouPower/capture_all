/* Capture All — shared views: timeline / network / console / tables (used by 采集详情) */
const { useState: useStateV, useRef: useRefV, useEffect: useEffectV } = React;

/* ════════ TIMELINE (hero) ════════ */
function TimelineView({ onSelect }) {
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

/* ════════ CONSOLE ════════ */
function ConsoleView({ onSelect, selected }) {
  const [f, setF] = useStateV("all");
  const segs = [["all","All",null],["error","Errors",2],["warn","Warnings",6],["info","Info",16],["verbose","Verbose",0]];
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

Object.assign(window, { TimelineView, NetworkView, ConsoleView, StorageView, EventsView });
