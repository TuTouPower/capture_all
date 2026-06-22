// dashboard/dashboard_integrations.ts — 集成页 + 小页面 (current/exports)
import {
    esc, I, num, capture_name, capture_dur, strip_proto,
    get_captures, get_user_config,
    router,
} from './dashboard_shared';
import { open_detail } from './dashboard_detail';

function render_current(): string {
    const captures = get_captures();
    const live = captures.filter((s) => s.status === 'capturing');
    const rows = live.map((s) => `<div class="exp-task" data-open="${esc(s.capture_id)}" style="cursor:pointer">
        <span class="et-ic" style="color:var(--blue-ink)">${I.navCurrent}</span>
        <div class="et-main"><b>${esc(capture_name(s))}</b><div class="et-sub">${esc(strip_proto(s.start_url))} · ${num(s.stats?.event_count || 0)} 事件 · ${num(s.stats?.request_count || 0)} 请求</div></div>
        <span class="dt-state"><span class="dot" style="background:var(--blue)"></span><span style="color:var(--blue-ink)" class="mono">采集中</span></span>
    </div>`).join('');
    return `<div class="page">
        <div class="pg-head"><div class="pg-title"><h1>当前采集</h1><p>正在进行的采集会话，实时查看事件流并随时停止。</p></div></div>
        <div class="simple-pad scroll">
            ${live.length ? rows : '<div style="text-align:center;color:var(--ink-4);padding:48px">当前没有进行中的采集</div>'}
        </div>
    </div>`;
}

function wire_simple_open(): void {
    document.getElementById('content')!.querySelectorAll('[data-open]').forEach((el) =>
        el.addEventListener('click', () => open_detail((el as HTMLElement).dataset.open!)));
}

function render_exports(): string {
    const captures = get_captures();
    const rows = captures.map((s) => `<div class="exp-task">
        <span class="et-ic">${I.navExport}</span>
        <div class="et-main"><b>${esc(capture_name(s))}</b><div class="et-sub">${num(s.stats?.event_count || 0)} 事件 · ${capture_dur(s)}</div></div>
        <button class="btn sm" data-export="${esc(s.capture_id)}"><span>${I.export}</span>导出</button>
    </div>`).join('');
    return `<div class="page">
        <div class="pg-head"><div class="pg-title"><h1>导出任务</h1><p>选择采集记录导出。已就绪 ${num(captures.length)} 条。</p></div></div>
        <div class="simple-pad scroll">${captures.length ? rows : '<div style="text-align:center;color:var(--ink-4);padding:48px">暂无采集记录</div>'}</div>
    </div>`;
}

function render_integrations(): string {
    const on = get_user_config().agent_bridge_enabled;
    const cards: [string, string, string, boolean, string, boolean][] = [
        ['MCP Bridge', 'navMcp', '连接本地 MCP 服务，向 Agent 暴露采集数据', on, on ? '已连接' : '配置', false],
        ['本地 Agent', 'navCurrent', '连接本地 Agent 以分析与回答问题', on, '配置', false],
        ['Webhook', 'navExport', '采集结束后向自定义地址推送事件', false, '即将推出', true],
        ['Issue 平台', 'err', '把失败请求与错误同步为 Issue', false, '即将推出', true],
    ];
    return `<div class="page">
        <div class="pg-head"><div class="pg-title"><h1>MCP / 集成</h1><p>连接本地 Agent、MCP 服务与外部平台，把采集数据接入你的工作流。</p></div>
            <div class="pg-actions"><button class="btn" data-action="go-settings"><span>${I.navSettings}</span>前往设置</button></div></div>
        <div class="simple-pad scroll"><div class="integrations" style="margin-top:14px">
            ${cards.map(([name, ic, desc, conn, btn, disabled]) => `<div class="integ-card${disabled ? ' integ-card--disabled' : ''}">
                <div class="integ-top"><span class="integ-ic">${I[ic]}</span>
                    <div class="integ-meta"><b>${name}</b><span>${desc}</span></div>
                    <span class="integ-state" data-on="${conn ? 1 : 0}">${conn ? '已连接' : disabled ? '未实现' : '未连接'}</span></div>
                <button class="btn sm" style="justify-content:center" ${disabled ? 'disabled' : ''} ${!disabled ? 'data-action="go-settings"' : ''}>${btn}</button>
            </div>`).join('')}
        </div></div>
    </div>`;
}

function wire_integrations(): void {
    const c = document.getElementById('content')!;
    c.querySelectorAll('[data-action="go-settings"]').forEach((b) =>
        b.addEventListener('click', () => {
            router.go('settings');
            requestAnimationFrame(() => {
                document.getElementById('set-integrations')?.scrollIntoView({ block: 'start' });
            });
        }));
}

export { render_current, wire_simple_open, render_exports, render_integrations, wire_integrations };
