// dashboard/dashboard_captures.ts — 采集列表页
import {
    is_extension, esc, I, num, fmt_size, est_bytes, pct, delta_pct,
    capture_name, capture_dur, format_system_time,
    get_user_config, get_captures, get_selected,
    load_captures, export_capture,
    router,
} from './dashboard_shared';

// Re-export export_capture so dashboard.ts can import it (already in shared)

function render_captures(): string {
    const captures = get_captures();
    const user_config = get_user_config();
    const selected = get_selected();
    const total = captures.length;
    const withErr = captures.filter((s) => (s.stats?.error_count || 0) > 0).length;
    const completed = captures.filter((s) => s.status === 'completed').length;
    const totalBytes = captures.reduce((a, s) => a + est_bytes(s), 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yest = new Date(today.getTime() - 86400000);
    const cntDay = (d0: Date, d1: Date) => captures.filter((s) => {
        const t = new Date(s.started_at).getTime();
        return t >= d0.getTime() && t < d1.getTime();
    }).length;
    const todayN = cntDay(today, new Date(today.getTime() + 86400000));
    const yestN = cntDay(yest, today);
    const dDay = delta_pct(todayN, yestN);
    const stats = [
        { icon: 'navCaptures', lbl: '全部采集', val: num(total), tint: 'blue', sub: dDay ? `较昨日 ${dDay}` : '较昨日 +0%', subTone: 'green' },
        { icon: 'err', lbl: '有错误', val: num(withErr), tint: 'red', sub: pct(withErr, total) },
        { icon: 'navExport', lbl: '已完成', val: num(completed), tint: 'green', sub: pct(completed, total) },
        { icon: 'storage', lbl: '占用空间', val: fmt_size(totalBytes), tint: 'green', sub: '估算大小' },
    ];
    const rows = captures.map((s) => {
        const id = esc(s.capture_id);
        return `<tr data-open="${id}" data-sel="${selected.has(s.capture_id) ? 1 : 0}">
            <td class="col-chk" data-stop="1"><input type="checkbox" class="ck" data-chk="${id}" ${selected.has(s.capture_id) ? 'checked' : ''}></td>
            <td><span class="cap-name">${s.status === 'capturing' ? '<span class="recdot" title="采集中"></span>' : ''}<b>${esc(capture_name(s))}</b></span></td>
            <td><span class="cap-time mono">${esc(format_system_time(s.started_at, user_config))}</span></td>
            <td><span class="cap-dur mono">${capture_dur(s)}</span></td>
            <td class="col-num mono">${num(s.stats?.user_action_count || 0)}</td>
            <td class="col-num mono">${num(s.stats?.nav_count || 0)}</td>
            <td class="col-num mono">${num(s.stats?.request_count || 0)}</td>
            <td class="col-num mono">${num(s.stats?.log_count || 0)}</td>
            <td class="col-num"><span class="cap-errs mono" data-bad="${(s.stats?.error_count || 0) > 0 ? 1 : 0}">${num(s.stats?.error_count || 0)}</span></td>
            <td class="col-num mono">${num(s.stats?.storage_change_count || 0)}</td>
            <td class="col-num mono">${num(s.stats?.cookie_change_count || 0)}</td>
            <td class="col-num mono">${fmt_size(est_bytes(s))}</td>
            <td class="col-act" data-stop="1"><span class="rowact">
                <button class="ibtn" title="导出" data-export="${id}">${I.download}</button>
                <button class="ibtn" title="删除" data-del="${id}">${I.trash}</button>
            </span></td>
        </tr>`;
    }).join('');
    const empty = `<tr><td colspan="13" style="text-align:center;color:var(--ink-4);padding:40px">暂无采集记录</td></tr>`;
    return `<div class="page">
        <div class="pg-head">
            <div class="pg-title"><h1>采集记录</h1><p>管理和查看所有已完成的采集记录，支持导出、归档和标签管理。</p></div>
            <div class="pg-actions">
                <div class="searchbox">${I.search}<input placeholder="搜索采集名称、URL、标签…" id="capSearch"></div>
                <button class="btn"><span>${I.filter}</span>筛选</button>
                <button class="ibtn" id="capRefresh" title="刷新">${I.refresh}</button>
            </div>
        </div>
        <div class="cap-stats">
            ${stats.map((s) => `<div class="cap-stat">
                <span class="cap-stat-ic" data-tint="${s.tint}">${I[s.icon]}</span>
                <div class="cap-stat-body">
                    <span class="cap-stat-lbl">${s.lbl}</span>
                    <b class="cap-stat-val mono">${s.val}</b>
                    <span class="cap-stat-sub${s.subTone === 'green' ? ' t-green' : ''}">${esc(s.sub)}</span>
                </div>
            </div>`).join('')}
        </div>
        <div class="cap-filterbar">
            <button class="fb-select">状态: <b>全部</b> ${I.chevD}</button>
            <button class="fb-reset" id="capReset">${I.reset}重置</button>
            <div class="fb-spacer"></div>
            <button class="ibtn" id="capRefresh2" title="刷新">${I.refresh}</button>
        </div>
        <div class="cap-tablewrap scroll">
            <table class="cap-table">
                <thead><tr>
                    <th class="col-chk"><input type="checkbox" class="ck" id="capAll"></th>
                    <th>采集名称</th><th>时间</th><th>时长</th>
                    <th class="col-num">用户行为</th><th class="col-num">页面导航</th>
                    <th class="col-num">网络请求</th><th class="col-num">控制台</th>
                    <th class="col-num">错误异常</th><th class="col-num">Storage</th>
                    <th class="col-num">Cookie</th>
                    <th class="col-num">大小</th><th class="col-act">操作</th>
                </tr></thead>
                <tbody>${rows || empty}</tbody>
            </table>
        </div>
        <div class="cap-batch">
            <div class="cap-batch-sel">
                已选择 <b>${selected.size}</b> 条采集记录
                ${selected.size ? '<span class="lnk-clear" id="capClear">清除选择</span>' : ''}
            </div>
            <div class="cap-batch-sep"></div>
            <div class="cap-batch-acts">
                <button class="btn primary sm" id="batchExport"><span>${I.export}</span>导出</button>
                <button class="btn sm danger" id="batchDel"><span>${I.trash}</span>删除</button>
            </div>
            <div class="cap-batch-r"><span class="cap-total">共 <b class="mono">${num(captures.length)}</b> 条</span></div>
        </div>
    </div>`;
}

function wire_captures(): void {
    const c = document.getElementById('content')!;
    const captures = get_captures();
    const selected = get_selected();
    c.querySelectorAll('tr[data-open]').forEach((tr) => {
        tr.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('[data-stop]')) return;
            router.open_detail((tr as HTMLElement).dataset.open!);
        });
    });
    c.querySelectorAll('[data-chk]').forEach((cb) => cb.addEventListener('change', () => {
        const id = (cb as HTMLElement).dataset.chk!;
        if ((cb as HTMLInputElement).checked) selected.add(id); else selected.delete(id);
        router.render_content();
    }));
    const all = c.querySelector('#capAll') as HTMLInputElement | null;
    all?.addEventListener('change', () => {
        if (all.checked) captures.forEach((s) => selected.add(s.capture_id)); else selected.clear();
        router.render_content();
    });
    c.querySelector('#capClear')?.addEventListener('click', () => { selected.clear(); router.render_content(); });
    c.querySelectorAll('#capRefresh, #capRefresh2').forEach((b) => b.addEventListener('click', async () => { await load_captures(); router.render_content(); }));
    c.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => export_capture((b as HTMLElement).dataset.export!)));
    c.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => del_capture((b as HTMLElement).dataset.del!)));
    c.querySelector('#batchExport')?.addEventListener('click', () => selected.forEach((id) => export_capture(id)));
    c.querySelector('#batchDel')?.addEventListener('click', async () => {
        if (!selected.size || !confirm('确定删除选中的采集记录？')) return;
        for (const id of selected) await chrome.runtime.sendMessage({ action: 'delete_capture', capture_id: id });
        selected.clear(); await load_captures(); router.render_content();
    });
}

async function del_capture(id: string): Promise<void> {
    if (!is_extension || !confirm('确定删除此采集记录？')) return;
    await chrome.runtime.sendMessage({ action: 'delete_capture', capture_id: id });
    get_selected().delete(id);
    await load_captures(); router.render_content();
}

export { render_captures, wire_captures, del_capture };
