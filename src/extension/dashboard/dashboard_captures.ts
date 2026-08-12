// dashboard/dashboard_captures.ts — 采集列表页
import { t } from '../shared/i18n';
import { send_ui_message } from '../../shared/message_contract';
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
        { icon: 'navCaptures', lbl: t('allCaptures'), val: num(total), tint: 'blue', sub: `${num(captures.length)} ${t('captureCountSuffix')}`, subTone: 'green' },
        { icon: 'err', lbl: t('withErrors'), val: num(withErr), tint: 'red', sub: pct(withErr, total) },
        { icon: 'navExport', lbl: t('completed'), val: num(completed), tint: 'green', sub: pct(completed, total) },
        { icon: 'storage', lbl: t('storageUsed'), val: fmt_size(totalBytes), tint: 'green', sub: t('estimatedSize') },
    ];
    const rows = captures.map((s) => {
        const id = esc(s.capture_id);
        return `<tr data-open="${id}" data-sel="${selected.has(s.capture_id) ? 1 : 0}">
            <td class="col-chk" data-stop="1"><input type="checkbox" class="ck" data-chk="${id}" ${selected.has(s.capture_id) ? 'checked' : ''}></td>
            <td><span class="cap-name">${s.status === 'capturing' ? `<span class="recdot" title="${t('capturing')}"></span>` : ''}<b>${esc(capture_name(s))}</b></span></td>
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
                <button class="ibtn" title="${t('exportLabel')}" data-export="${id}">${I.download}</button>
                <button class="ibtn" title="${t('delete')}" data-del="${id}">${I.trash}</button>
            </span></td>
        </tr>`;
    }).join('');
    const empty = `<tr><td colspan="13" style="text-align:center;color:var(--ink-4);padding:40px">${t('noCaptureRecords')}</td></tr>`;
    const cur_search = get_cap_search().replace(/"/g, '&quot;');
    const cur_sf = get_cap_status_filter();
    const sf_label = cur_sf === 'all' ? t('allFilter') : (cur_sf === 'capturing' ? t('capturing') : t('completed'));
    return `<div class="page">
        <div class="pg-head">
            <div class="pg-title"><h1>${t('captureRecords')}</h1><p>${t('captureRecordsDesc')}</p></div>
            <div class="pg-actions">
                <div class="searchbox">${I.search}<input placeholder="${t('searchCapturesPlaceholder')}" id="capSearch" value="${esc(cur_search)}"></div>
                <button class="btn fb-status-btn" data-sf="all" data-cur="${cur_sf === 'all' ? 1 : 0}">${t('allFilter')}</button>
                <button class="btn fb-status-btn" data-sf="capturing" data-cur="${cur_sf === 'capturing' ? 1 : 0}">${t('capturing')}</button>
                <button class="btn fb-status-btn" data-sf="completed" data-cur="${cur_sf === 'completed' ? 1 : 0}">${t('completed')}</button>
                <button class="ibtn" id="capRefresh" title="${t('refresh')}">${I.refresh}</button>
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
            <span class="fb-info">${t('statusLabel')}: <b>${sf_label}</b> · ${num(captures.length)} ${t('filterOf')} ${num(total)}${t('filterTotalSuffix')}</span>
            <button class="fb-reset" id="capReset">${I.reset}${t('reset')}</button>
            <div class="fb-spacer"></div>
            <button class="ibtn" id="capRefresh2" title="${t('refresh')}">${I.refresh}</button>
        </div>
        <div class="cap-tablewrap scroll">
            <table class="cap-table">
                <thead><tr>
                    <th class="col-chk"><input type="checkbox" class="ck" id="capAll"></th>
                    <th>${t('captureName')}</th><th>${t('time')}</th><th>${t('duration')}</th>
                    <th class="col-num">${t('capUser')}</th><th class="col-num">${t('capNav')}</th>
                    <th class="col-num">${t('capNet')}</th><th class="col-num">${t('capConsole')}</th>
                    <th class="col-num">${t('capError')}</th><th class="col-num">${t('capStorage')}</th>
                    <th class="col-num">${t('capCookie')}</th>
                    <th class="col-num">${t('size')}</th><th class="col-act">${t('actions')}</th>
                </tr></thead>
                <tbody>${rows || empty}</tbody>
            </table>
        </div>
        <div class="cap-batch">
            <div class="cap-batch-sel">
                ${t('selectedCount')} <b>${selected.size}</b> ${t('captureRecordsUnit')}
                ${selected.size ? `<span class="lnk-clear" id="capClear">${t('clearSelection')}</span>` : ''}
            </div>
            <div class="cap-batch-sep"></div>
            <div class="cap-batch-acts">
                <button class="btn primary sm" id="batchExport"><span>${I.export}</span>${t('exportLabel')}</button>
                <button class="btn sm danger" id="batchDel"><span>${I.trash}</span>${t('delete')}</button>
            </div>
            <div class="cap-batch-r"><span class="cap-total">${t('filterTotal')} <b class="mono">${num(captures.length)}</b> ${t('countUnit')}</span></div>
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
        if (!selected.size || !confirm(t('deleteSelectedConfirm'))) return;
        for (const id of selected) await send_ui_message('delete_capture', { capture_id: id });
        selected.clear(); await load_captures(); router.render_content();
    });
}

async function del_capture(id: string): Promise<void> {
    if (!is_extension || !confirm(t('deleteCaptureConfirm'))) return;
    await send_ui_message('delete_capture', { capture_id: id });
    get_selected().delete(id);
    await load_captures(); router.render_content();
}

export { render_captures, wire_captures, del_capture };
