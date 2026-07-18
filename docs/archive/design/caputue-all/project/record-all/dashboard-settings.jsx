/* Capture All — Main panel: 设置 (Settings) page */
const { useState: useStateS } = React;

const SET_NAV = [
  ["general","通用","navSettings"],
  ["defaults","采集默认值","navCurrent"],
  ["privacy","隐私与脱敏","err"],
  ["export","导出","navExport"],
  ["storage","存储","storage"],
  ["integrations","集成","navMcp"],
];

const Q = () => <span className="q">?</span>;
function Sel({ value }) { return <div className="select">{value}<DI.chevD/></div>; }
function Sw({ on, sm }) { const [v,setV]=useStateS(on); return <span className={"switch"+(sm?" sm":"")} data-on={v?1:0} onClick={()=>setV(!v)}><span className="knob"/></span>; }
function Seg({ options, value }) {
  const [v,setV] = useStateS(value);
  return <div className="seg">{options.map(o => <button key={o} data-on={v===o?1:0} onClick={()=>setV(o)}>{o}</button>)}</div>;
}

function SettingsPage() {
  const [active, setActive] = useStateS("general");
  return (
    <div className="page">
      <div className="pg-head">
        <div className="pg-title">
          <h1>设置</h1>
          <p>管理 Capture All 的全局偏好、采集默认值、隐私策略、导出规则和集成能力。</p>
        </div>
        <div className="pg-actions">
          <div className="searchbox" style={{width:200}}><DI.search/><input placeholder="搜索设置项…"/></div>
          <button className="btn"><DI.reset/>恢复默认设置</button>
          <button className="btn primary"><DI.export/>保存更改</button>
        </div>
      </div>

      <div className="set-body">
        <nav className="set-subnav scroll">
          {SET_NAV.map(([k,l,ic]) => (
            <button key={k} className="set-navitem" data-on={active===k?1:0} onClick={()=>{setActive(k);document.getElementById("set-"+k)?.scrollIntoView({block:"start"});}}>
              {DI[ic]()}{l}
            </button>
          ))}
        </nav>

        <div className="set-scroll scroll">
          {/* 通用 */}
          <section className="set-section" id="set-general">
            <h2>通用</h2>
            <div className="set-card">
              <div className="set-grid">
                <div className="field"><span className="field-lbl">语言</span><Sel value="简体中文"/></div>
                <div className="field"><span className="field-lbl">主题 <Q/></span><Seg options={["跟随系统","浅色","深色"]} value="跟随系统"/></div>
                <div className="field"><span className="field-lbl">时间显示 <Q/></span><Seg options={["相对时间","系统时间","UTC"]} value="相对时间"/></div>
                <div className="field"><span className="field-lbl">默认打开页面</span><Sel value="采集记录"/></div>
              </div>
            </div>
          </section>

          {/* 采集默认值 */}
          <section className="set-section" id="set-defaults">
            <h2>采集默认值</h2>
            <div className="set-card">
              <div className="field" style={{marginBottom:18}}>
                <span className="field-lbl">默认采集模块 <Q/></span>
                <div className="modules">
                  {[["用户操作","ui"],["页面导航","nav"],["网络请求","net"],["响应体","storage"],["输入值","ui"],["Console","console"],["DOM 变化","dom"],["Storage","storage"],["脱敏","err"]].map(([l,ic],i)=>(
                    <div className="module" key={l}>
                      <span className="m-top">{DI[ic]()}{l}</span>
                      <Sw on={i!==8?true:true} sm/>
                    </div>
                  ))}
                </div>
              </div>
              <div className="set-grid c3">
                <div className="field"><span className="field-lbl">最大采集时长 <Q/></span><div className="input-unit"><input defaultValue="30"/><span className="unit">分钟</span></div></div>
                <div className="field"><span className="field-lbl">最大文件大小 <Q/></span><div className="input-unit"><input defaultValue="500"/><span className="unit">MB</span></div></div>
                <div className="field"><span className="field-lbl">采集结束后的行为 <Q/></span><Seg options={["显示通知","自动打开详情"]} value="显示通知"/></div>
              </div>
            </div>
          </section>

          {/* 隐私与脱敏 */}
          <section className="set-section" id="set-privacy">
            <div className="set-subhead"><h2>隐私与脱敏</h2><Sw on={true}/></div>
            <div className="set-card">
              <div className="set-grid">
                <div className="field"><span className="field-lbl">默认开启脱敏 <Q/></span><Sel value="脱敏所有输入值"/></div>
                <div className="field"><span className="field-lbl">请求体策略 <Q/></span><Sel value="脱敏敏感字段"/></div>
                <div className="field"><span className="field-lbl">响应体策略 <Q/></span><Sel value="脱敏敏感字段"/></div>
                <div className="field"><span className="field-lbl">Header / Cookie / Token 脱敏</span><Sel value="自动脱敏常见敏感信息"/></div>
                <div className="field span2"><span className="field-lbl">自定义敏感字段 <Q/></span>
                  <div className="fieldset-tags">
                    {["email","phone","token","authorization"].map(t=>(
                      <span className="tagpill" key={t}>{t}<span className="x">{DI.close({width:12,height:12})}</span></span>
                    ))}
                    <button className="tag-add">{DI.plus()}添加字段</button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 导出 */}
          <section className="set-section" id="set-export">
            <h2>导出</h2>
            <div className="set-card">
              <div className="set-grid">
                <div className="field"><span className="field-lbl">默认格式</span><Seg options={["JSON","HAR","ZIP","报告"]} value="JSON"/></div>
                <div className="field span2"><span className="field-lbl">文件名模板</span>
                  <input className="input mono" defaultValue="{project}.{date}-{time}"/>
                  <span style={{fontSize:11,color:"var(--ink-4)"}}>可用变量：<span className="mono">{"{project} {date} {time} {id}"}</span></span>
                </div>
                <div className="field"><span className="field-lbl">导出目录策略</span><Sel value="询问每次导出位置"/></div>
              </div>
              <div className="set-grid c3" style={{marginTop:18}}>
                <div className="field"><span className="field-lbl">是否压缩</span><Sw on={true}/></div>
                <div className="field"><span className="field-lbl">是否包含响应体</span><Sw on={true}/></div>
                <div className="field"><span className="field-lbl">是否包含截图</span><Sw on={false}/></div>
              </div>
            </div>
          </section>

          {/* 存储 */}
          <section className="set-section" id="set-storage">
            <h2>存储</h2>
            <div className="set-card">
              <div className="set-grid">
                <div className="field"><span className="field-lbl">当前占用空间</span>
                  <div className="storage-meter">
                    <span className="storage-disc">{DI.storage({width:20,height:20})}</span>
                    <div className="storage-meter-body"><b className="mono">18.7 GB</b><span>共 50 GB (37%)</span></div>
                  </div>
                </div>
                <div className="field"><span className="field-lbl">保留最近多少天</span><div className="input-unit"><input defaultValue="90"/><span className="unit">天</span></div></div>
                <div className="field"><span className="field-lbl">自动清理策略</span><Sel value="按时间清理"/></div>
                <div className="field"><span className="field-lbl">清理已导出采集</span>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <Sw on={true}/>
                    <button className="btn sm"><DI.trash/>立即清理</button>
                  </div>
                  <span style={{fontSize:11,color:"var(--ink-4)"}}>自动清理已导出的采集记录</span>
                </div>
              </div>
            </div>
          </section>

          {/* 集成 */}
          <section className="set-section" id="set-integrations" style={{marginBottom:8}}>
            <h2>集成</h2>
            <div className="integrations">
              {[
                ["MCP","navMcp","连接本地或远程 MCP 服务",true,"配置"],
                ["本地 Agent","navCurrent","连接本地 Agent 以扩展能力",true,"配置"],
                ["Webhook","navExport","向自定义地址推送事件",false,"连接"],
                ["Issue 平台","err","同步问题到 Issue 平台",false,"连接"],
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
          </section>
        </div>
      </div>

      <div className="set-footer">
        <span className="info">{DI.agent({width:13,height:13})} 已修改 <b className="mono">6</b> 项</span>
        <div className="right">
          <button className="btn">取消</button>
          <button className="btn primary">保存更改</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SettingsPage });
