// dashboard/dashboard_captures.ts — 采集列表页
import {
    is_extension, esc, I, num, fmt_size, est_bytes, pct,
    capture_name, capture_dur, format_system_time,
    get_user_config, get_captures, get_selected,
    get_cap_search, get_cap_status_filter,
    set_cap_search, set_cap_status_filter,
    load_captures, export_capture,
    debounce,
    router,
} from './dashboard_shared';

// 按搜索词 + 状态过滤 captures
function filter_captures(all: ReturnType<typeof get_captures>) {
    const q = get_cap_search().trim().toLowerCase();
    const sf = get_cap_status_filter();
    return all.filter((s) => {
        if (sf !== 'all' && s.status !== sf) return false;
        if (!q) return true;
        const name = capture_name(s).toLowerCase();
        const url = (s.url || '').toLowerCase();
        const tags = (s.tags || []).join(' ').toLowerCase();
        return name.includes(q) || url.includes(q) || tags.includes(q);
    });
}

// Re-export export_capture so dashboard.ts can import it (already in shared)

function render_captures(): string {
    const all = get_captures();
    const captures = filter_captures(all);
    const user_config = get_user_config();
    const selected = get_selected();
    const total = all.length;
    const withErr = all.filter((s) => (s.stats?.error_count || 0) > 0).length;
    const completed = all.filter((s) => s.status === 'completed').length;
    const totalBytes = all.reduce((a, s) => a + est_bytes(s), 0);
    const stats = [
        { icon: 'navCaptures', lbl: '全部采集', val: num(total), tint: 'blue', sub: `${num(captures.length)} 次采集`, subTone: 'green' },
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
    const cur_search = get_cap_search().replace(/"/g, '&quot;');
    const cur_sf = get_cap_status_filter();
    const sf_label = cur_sf === 'all' ? '全部' : (cur_sf === 'capturing' ? '采集中' : '已完成');
    return `<div class="page">
        <div class="pg-head">
            <div class="pg-title"><h1>采集记录</h1><p>管理和查看所有已完成的采集记录，支持导出、归档和标签管理。</p></div>
            <div class="pg-actions">
                <div class="searchbox">${I.search}<input placeholder="搜索采集名称、URL、标签…" id="capSearch" value="${esc(cur_search)}"></div>
                <button class="btn fb-status-btn" data-sf="all" data-cur="${cur_sf === 'all' ? 1 : 0}">全部</button>
                <button class="btn fb-status-btn" data-sf="capturing" data-cur="${cur_sf === 'capturing' ? 1 : 0}">采集中</button>
                <button class="btn fb-status-btn" data-sf="completed" data-cur="${cur_sf === 'completed' ? 1 : 0}">已完成</button>
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
            <span class="fb-info">状态: <b>${sf_label}</b> · 共 ${num(captures.length)} 条（全部 ${num(total)}）</span>
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
    // 搜索输入（debounce 300ms）
    const search_input = c.querySelector('#capSearch') as HTMLInputElement | null;
    search_input?.addEventListener('input', debounce(() => {
        set_cap_search(search_input.value);
        router.render_content();
        const restored = document.getElementById('capSearch') as HTMLInputElement | null;
        if (restored) { restored.focus(); restored.setSelectionRange(restored.value.length, restored.value.length); }
    }, 300));
    // 重置：清空搜索 + 状态过滤
    c.querySelector('#capReset')?.addEventListener('click', () => {
        set_cap_search('');
        set_cap_status_filter('all');
        router.render_content();
    });
    // 状态过滤按钮
    c.querySelectorAll('.fb-status-btn').forEach((b) => b.addEventListener('click', () => {
        const sf = (b as HTMLElement).dataset.sf as 'all' | 'capturing' | 'completed';
        set_cap_status_filter(sf);
        router.render_content();
    }));
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
