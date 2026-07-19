// dashboard/dashboard_integrations.ts — 小页面 (current/exports)
import {
    esc, I, num, capture_name, capture_dur, strip_proto,
    get_captures,
    export_capture,
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

// T040: 导出按钮 wiring
function wire_exports(): void {
    const c = document.getElementById('content')!;
    c.querySelectorAll('[data-export]').forEach((b) => {
        b.addEventListener('click', () => {
            const id = (b as HTMLElement).dataset.export!;
            export_capture(id);
        });
    });
}

export { render_current, wire_simple_open, render_exports, wire_exports };
