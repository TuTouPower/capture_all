/* Capture All — Main panel: 采集记录 (Captures list) page */
const { useState: useStateC } = React;

function StatCard({ s, onClick }) {
  return (
    <div className="cap-stat" onClick={onClick}>
      <span className="cap-stat-ic" data-tint={s.tint}>{DI[s.icon]()}</span>
      <div className="cap-stat-body">
        <span className="cap-stat-lbl">
          {s.live && <span className="live-dot"/>}
          {s.lbl}
        </span>
        <b className="cap-stat-val mono">{s.val}</b>
        <span className={"cap-stat-sub"+(s.subTone?` t-${s.subTone}`:"")}>{s.sub}</span>
      </div>
    </div>
  );
}

function FilterPill({ label, value }) {
  return (
    <button className="fb-select">
      {label}: <b>{value}</b> <DI.chevD/>
    </button>
  );
}

function CapturesPage({ onOpen }) {
  const [sel, setSel] = useStateC(() => new Set(CAP_ROWS.slice(0,6).map(r=>r.id)));
  const [page, setPage] = useStateC(1);

  const allOnPage = CAP_ROWS.every(r => sel.has(r.id));
  const toggle = (id) => setSel(p => { const n = new Set(p); n.has(id)?n.delete(id):n.add(id); return n; });
  const toggleAll = () => setSel(p => allOnPage ? new Set() : new Set(CAP_ROWS.map(r=>r.id)));
  const clear = () => setSel(new Set());

  return (
    <div className="page">
      <div className="pg-head">
        <div className="pg-title">
          <h1>采集记录</h1>
          <p>管理和查看所有已完成的采集记录，支持导出、归档和标签管理。</p>
        </div>
        <div className="pg-actions">
          <div className="searchbox"><DI.search/><input placeholder="搜索采集名称、URL、标签…"/></div>
          <button className="btn"><DI.filter/>筛选</button>
          <button className="btn primary"><DI.play/>开始采集</button>
          <button className="btn"><DI.export/>导出</button>
          <button className="ibtn"><DI.more/></button>
        </div>
      </div>

      <div className="cap-stats">
        {CAP_STATS.map(s => <StatCard key={s.key} s={s}/>)}
      </div>

      <div className="cap-filterbar">
        <FilterPill label="状态" value="全部"/>
        <FilterPill label="错误" value="全部"/>
        <div className="fb-daterange">
          时间范围：<span className="mono">2025-05-10</span><span className="arrow">→</span><span className="mono">2025-05-17</span>
          <DI.cal style={{color:"var(--ink-3)"}}/>
        </div>
        <button className="fb-reset"><DI.reset/>重置</button>
        <div className="fb-spacer"/>
        <button className="ibtn" title="刷新"><DI.refresh/></button>
        <button className="btn sm"><DI.columns/>列设置</button>
      </div>

      <div className="cap-tablewrap scroll">
        <table className="cap-table">
          <thead>
            <tr>
              <th className="col-chk"><input type="checkbox" className="ck" checked={allOnPage} onChange={toggleAll}/></th>
              <th>采集名称</th>
              <th>页面 / URL</th>
              <th><span className="sortable">时间 <DI.chevD style={{transform:"scale(.8)"}}/></span></th>
              <th>时长</th>
              <th className="col-num">事件数</th>
              <th className="col-num">请求数</th>
              <th className="col-num">错误数</th>
              <th className="col-num">大小</th>
              <th>导出状态</th>
              <th>标签</th>
              <th className="col-act">操作</th>
            </tr>
          </thead>
          <tbody>
            {CAP_ROWS.map(r => (
              <tr key={r.id} data-sel={sel.has(r.id)?1:0} onClick={()=>onOpen(r)}>
                <td className="col-chk" onClick={e=>e.stopPropagation()}>
                  <input type="checkbox" className="ck" checked={sel.has(r.id)} onChange={()=>toggle(r.id)}/>
                </td>
                <td>
                  <span className="cap-name">
                    {r.active && <span className="recdot" title="采集中"/>}
                    <b>{r.name}</b>
                    {r.star && <span className="star">{DI.starFill()}</span>}
                  </span>
                </td>
                <td><span className="cap-url mono" title={r.url}>{r.url.replace(/^https?:\/\//,"")}</span></td>
                <td><span className="cap-time mono">{r.time}</span></td>
                <td><span className="cap-dur mono">{r.dur}</span></td>
                <td className="col-num mono">{r.events}</td>
                <td className="col-num mono">{r.reqs}</td>
                <td className="col-num"><span className="cap-errs mono" data-bad={r.errs>0?1:0}>{r.errs}</span></td>
                <td className="col-num mono">{r.size}</td>
                <td>
                  <span className="exp">
                    <span className="exp-pill" data-on={r.exp.on?1:0}>{r.exp.on?"已导出":"未导出"}</span>
                    {r.exp.on && <span className="exp-at mono">{r.exp.at}</span>}
                  </span>
                </td>
                <td><span className="chip-tag">{r.tag}</span></td>
                <td className="col-act" onClick={e=>e.stopPropagation()}>
                  <span className="rowact">
                    <button className="ibtn" title="回放"><DI.play/></button>
                    <button className="ibtn" title="导出"><DI.download/></button>
                    <button className="ibtn" title="更多"><DI.more/></button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="cap-batch">
        <div className="cap-batch-sel">
          <input type="checkbox" className="ck" checked={sel.size>0} onChange={clear}/>
          已选择 <b>{sel.size}</b> 条采集记录
          {sel.size>0 && <span className="lnk-clear" onClick={clear}>清除选择</span>}
        </div>
        <div className="cap-batch-sep"/>
        <div className="cap-batch-acts">
          <button className="btn primary sm"><DI.export/>导出</button>
          <button className="btn sm"><DI.archive/>归档</button>
          <button className="btn sm danger"><DI.trash/>删除</button>
          <button className="btn sm"><DI.tag/>添加标签</button>
          <button className="ibtn"><DI.more/></button>
        </div>
        <div className="cap-batch-r">
          <span className="cap-total">共 <b className="mono">1,248</b> 条</span>
          <div className="pager">
            <button onClick={()=>setPage(p=>Math.max(1,p-1))}><DI.chevL/></button>
            {[1,2,3].map(n => <button key={n} data-on={page===n?1:0} onClick={()=>setPage(n)}>{n}</button>)}
            <span className="gap">…</span>
            <button data-on={page===125?1:0} onClick={()=>setPage(125)}>125</button>
            <button onClick={()=>setPage(p=>Math.min(125,p+1))}><DI.chevR/></button>
          </div>
          <button className="fb-select">10 条/页 <DI.chevD/></button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CapturesPage });
