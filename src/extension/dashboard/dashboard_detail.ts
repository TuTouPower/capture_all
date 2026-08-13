// dashboard/dashboard_detail.ts — 采集详情页 + 网络检查器
import type { CaptureEvent } from '../../shared/types';
import { t, type I18nStrings } from '../shared/i18n';
import {
    debounce, esc, I, num,
    capture_name, capture_dur, format_system_time,
    KIND, kind_label, rel_time, event_kind, event_detail, event_title,
    get_user_config,
    get_detail_capture, get_detail_events, get_detail_network, get_detail_console,
    get_dt_tab, set_dt_tab, get_dt_view, set_dt_view, get_dt_zoom, set_dt_zoom,
    get_dt_zoom_window_pct,
    get_dt_quick, set_dt_quick, get_dt_sel, set_dt_sel,
    get_dt_insp_open, set_dt_insp_open, get_dt_play, set_dt_play,
    get_dt_net_sel, set_dt_net_sel, get_dt_net_insp_closed, set_dt_net_insp_closed,
    save_dt_memory, get_dt_memory,
    set_page,
    load_detail, export_capture,
    router,
} from './dashboard_shared';

// t144: timeline 拖拽标记——轮询 render 检查，拖拽期间不整页重渲染打断 pointermove。
// t186: 不再反向覆写 router；由 dashboard.ts 入口经 wire_dashboard_router 注入 getter。
let _tl_dragging = false;
export const get_tl_dragging = () => _tl_dragging;

const DT_TABS: [string, keyof I18nStrings][] = [
    ['overview', 'overview'], ['timeline', 'timeline'], ['user_action', 'capUser'],
    ['navigation', 'capNav'], ['network', 'capNet'], ['console', 'capConsole'],
    ['error', 'capError'], ['storage', 'capStorage'], ['cookie', 'capCookie'],
    ['config', 'configLabel'],
];

function detail_metrics(): { icon: string; lbl: string; val: string; color: string; danger?: boolean; filter?: string }[] {
    const st = get_detail_capture()?.stats;
    return [
        { icon: 'ui', lbl: t('capUser'), val: num(st?.user_action_count || 0), color: 'var(--src-user)', filter: 'user' },
        { icon: 'nav', lbl: t('capNav'), val: num(st?.nav_count || 0), color: 'var(--src-nav)', filter: 'nav' },
        { icon: 'net', lbl: t('capNet'), val: num(st?.request_count || 0), color: 'var(--src-network)', filter: 'network' },
        { icon: 'console', lbl: t('capConsole'), val: num(st?.log_count || 0), color: 'var(--src-console)', filter: 'console' },
        { icon: 'err', lbl: t('capError'), val: num(st?.error_count || 0), color: 'var(--src-error)', danger: true, filter: 'error' },
        { icon: 'storage', lbl: t('capStorage'), val: num(st?.storage_change_count || 0), color: 'var(--src-storage)', filter: 'storage' },
        { icon: 'cookie', lbl: t('capCookie'), val: num(st?.cookie_change_count || 0), color: 'var(--src-cookie)', filter: 'cookie' },
    ];
}

function render_detail(): string {
    const s = get_detail_capture();
    const user_config = get_user_config();
    const dt_tab = get_dt_tab();
    const dt_sel = get_dt_sel();
    const dt_insp_open = get_dt_insp_open();
    const name = s ? capture_name(s) : t('captureDetail');
    const showInsp = dt_tab === 'timeline' && dt_insp_open && dt_sel >= 0;
    return `<div class="page">
        <div class="dt-bc">
            <button class="back" data-back="1">${I.chevL} Capture All</button>
            <span class="sep">/</span><span class="crumb" data-back="1">${t('captureRecords')}</span>
            <span class="sep">/</span><span class="cur">${esc(name)}</span>
        </div>
        <div class="dt-head">
            <div class="dt-head-l">
                <div class="dt-title-row">
                    <h1>${esc(name)}</h1>
                    ${s ? `<span class="dt-id">${esc(s.capture_id)}</span>` : ''}
                    <span class="dt-state"><span class="dot"></span>${s?.status === 'capturing' ? t('capturing') : t('ended')}</span>
                </div>
                <div class="dt-meta">
                    ${I.cal}<span class="mono">${esc(s ? format_system_time(s.started_at, user_config) : '')}</span>
                    <span class="mdot">·</span><span>${t('duration')} <span class="mono">${s ? capture_dur(s) : '—'}</span></span>
                </div>
            </div>
            <div class="dt-head-r">
                <select id="dtExportFmt" style="padding:6px 8px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--ink);margin-right:6px">
                    <option value="archive">${t('exportZip')}</option><option value="json">JSON</option><option value="jsonl">JSONL</option><option value="html">HTML</option><option value="har">HAR</option>
                </select>
                <button class="btn" data-dexport="1"><span>${I.export}</span>${t('exportLabel')}</button>
                <button class="btn" data-open-url="1"><span>${I.ext}</span>${t('openOriginalPage')}</button>
            </div>
        </div>
        <div class="dt-metrics">
            ${detail_metrics().map((m) => `<button class="dt-metric${m.danger ? ' danger' : ''}" ${m.filter ? `data-mfilter="${m.filter}"` : ''}>
                <span class="dt-metric-top"><span class="dt-metric-ic" style="color:${m.color}">${I[m.icon]}</span><span class="dt-metric-lbl">${m.lbl}</span></span>
                <span class="dt-metric-row"><span class="dt-metric-val mono">${m.val}</span></span>
            </button>`).join('')}
        </div>
        <nav class="dt-tabs">
            ${DT_TABS.map(([k, l]) => `<button data-tab="${k}" data-on="${dt_tab === k ? 1 : 0}">${t(l)}</button>`).join('')}
        </nav>
        ${render_detail_tab(showInsp)}
    </div>`;
}

function render_detail_tab(showInsp: boolean): string {
    const dt_tab = get_dt_tab();
    const dt_net_insp_closed = get_dt_net_insp_closed();
    const dt_net_sel = get_dt_net_sel();
    const detail_network = get_detail_network();
    if (dt_tab === 'overview') return render_dt_overview();
    if (dt_tab === 'config') return render_dt_config();
    if (dt_tab === 'network') {
        const show_net_insp = !dt_net_insp_closed && detail_network.length > 0;
        const selected_net_idx = dt_net_sel >= 0 ? dt_net_sel : 0;
        return `<div class="dt-body dt-network-body" data-insp="${show_net_insp ? 1 : 0}"><div class="dt-list">${render_net_table(selected_net_idx)}</div>${show_net_insp ? `<div class="dt-insp-handle"></div>${render_net_inspector(selected_net_idx)}` : ''}</div>`;
    }
    if (dt_tab === 'console') return `<div class="dt-list" style="flex:1;min-height:0">${render_con_table()}</div>`;
    if (dt_tab === 'user_action') return `<div class="simple-pad scroll">${render_simple_events(['mouse_event', 'keyboard_event', 'scroll_event', 'input_event'], [t('time'), t('type'), t('eventLabel'), t('detail'), t('source')])}</div>`;
    if (dt_tab === 'navigation') return `<div class="simple-pad scroll">${render_simple_events(['route_change', 'page_load', 'tab_switch', 'tab_created', 'tab_url_change', 'dom_ready'], [t('time'), t('type'), t('eventLabel'), t('urlSourceDetail'), t('source')])}</div>`;
    if (dt_tab === 'error') return `<div class="simple-pad scroll">${render_simple_events(['runtime_exception', 'capture_error'], [t('time'), t('type'), t('errorMessage'), t('stack'), t('source')])}</div>`;
    if (dt_tab === 'storage') return `<div class="simple-pad scroll">${render_simple_events(['storage_change'], [t('time'), t('type'), t('keyLabel'), t('detail'), t('source')])}</div>`;
    if (dt_tab === 'cookie') return `<div class="simple-pad scroll">${render_simple_events(['cookie_change'], [t('time'), t('type'), t('nameLabel'), t('detail'), t('source')])}</div>`;
    // timeline
    return `<div class="dt-body" data-insp="${showInsp ? 1 : 0}">
        ${render_dt_rail()}
        ${render_dt_list()}
        ${showInsp ? render_dt_inspector() : ''}
    </div>`;
}

export function render_dt_rail(): string {
    const detail_events = get_detail_events();
    const dt_quick = get_dt_quick();
    const counts: Record<string, number> = { all: detail_events.length };
    for (const e of detail_events) { const k = event_kind(e); counts[k] = (counts[k] || 0) + 1; }
    const quick: [string, string, string, string][] = [
        ['all', 'navCaptures', t('allFilter'), 'var(--ink-2)'],
        ['error', 'err', t('capError'), 'var(--src-error)'],
        ['user', 'ui', t('capUser'), 'var(--src-user)'],
        ['network', 'net', t('capNet'), 'var(--src-network)'],
        ['console', 'console', t('capConsole'), 'var(--src-console)'],
        ['nav', 'nav', t('capNav'), 'var(--src-nav)'],
        ['storage', 'storage', t('capStorage'), 'var(--src-storage)'],
        ['cookie', 'cookie', t('capCookie'), 'var(--src-cookie)'],
        ['dom', 'dom', t('kindDom'), 'var(--src-dom)'],
    ];
    return `<aside class="dt-rail scroll">
        <div class="dt-rail-search">${I.search}<input placeholder="${t('searchRailPlaceholder')}" id="dtSearch" value="${esc((document.getElementById('dtSearch') as HTMLInputElement | null)?.value ?? '')}"><kbd>⌘K</kbd></div>
        <div class="dt-rail-sec">
            <div class="dt-rail-hd">${t('quickFilter')}</div>
            ${quick.map(([k, ic, lbl, color]) => `<button class="qfilter" data-quick="${k}" data-on="${dt_quick === k ? 1 : 0}">
                <span class="qf-ic" style="color:${color}">${I[ic]}</span><span class="qf-lbl">${lbl}</span>
                <span class="qf-n">${num(counts[k === 'all' ? 'all' : k] || 0)}</span>
            </button>`).join('')}
        </div>
        <div class="dt-rail-handle"></div>
    </aside>`;
}

function filtered_events(): import('../../shared/types').CaptureEvent[] {
    const detail_events = get_detail_events();
    const dt_quick = get_dt_quick();
    let list = detail_events;
    if (dt_quick !== 'all') list = list.filter((e) => event_kind(e) === dt_quick);
    const q = (document.getElementById('dtSearch') as HTMLInputElement | null)?.value?.toLowerCase();
    if (q) list = list.filter((e) => (event_title(e) + ' ' + event_detail(e) + ' ' + e.type).toLowerCase().includes(q));
    return list;
}

function render_dt_list(): string {
    const dt_view = get_dt_view();
    const dt_sel = get_dt_sel();
    const detail_events = get_detail_events();
    const list = filtered_events();
    // t153 AC-004: 预建 idx 映射（对象恒等，与原线性 index 查找的 === 语义严格等价），
    // 消除 list.map 内每次对全量事件数组做线性 index 查找的 O(n²)。
    const idx_map = new Map<CaptureEvent, number>();
    for (let i = 0; i < detail_events.length; i++) idx_map.set(detail_events[i], i);
    const rows = list.map((e) => {
        const k = KIND[event_kind(e)];
        const isErr = event_kind(e) === 'error' || (e.type === 'console_event' && (e.data as Record<string, unknown>)?.level === 'error');
        const d = (e.data || {}) as Record<string, unknown>;
        const status = e.type === 'network_request' ? (d.status_code as number | undefined) : undefined;
        // t154 AC-009: status 为事件数据，数值校验 + esc() 转义（纵深缺口，M6）
        const detailCell = status != null
            ? `<span><span class="status-pill" data-ok="${Number(status) < 400 ? 1 : 0}">${esc(String(status))}</span><span class="ev-ms">${d.duration_ms != null ? Math.round(d.duration_ms as number) + 'ms' : ''}</span></span>`
            : `<span class="ev-detail" title="${esc(event_detail(e))}">${esc(event_detail(e))}</span>`;
        const idx = idx_map.get(e) ?? -1;
        return `<tr data-ev="${idx}" data-sel="${dt_sel === idx ? 1 : 0}">
            <td><span class="ev-t">${rel_time(e.relative_time_ms)}</span></td>
            <td><span class="ev-type" style="color:${k.color}">${I[k.icon]} ${kind_label(event_kind(e))}</span></td>
            <td><span class="ev-name${isErr ? ' err' : ''}">${esc(event_title(e))}</span></td>
            <td>${detailCell}</td>
            <td><span class="ev-src">${esc((e.data as Record<string, unknown>)?.source || e.source || '—')}</span></td>
        </tr>`;
    }).join('');
    const empty = `<tr><td colspan="5" style="text-align:center;color:var(--ink-4);padding:36px">${t('noEvents')}</td></tr>`;
    return `<div class="dt-list">
        <div class="dt-list-bar">
            <h2>${t('timeline')} <span class="cnt mono">(${num(list.length)} ${t('eventsCountSuffix')})</span></h2>
            <div class="spacer"></div>
            <div class="viewtog">
                <button data-view="list" data-on="${dt_view === 'list' ? 1 : 0}">${I.list} ${t('listView')}</button>
                <button data-view="trace" data-on="${dt_view === 'trace' ? 1 : 0}">${I.trace} ${t('trackView')}</button>
            </div>
        </div>
        ${dt_view === 'trace'
            ? `<div class="dt-events">${render_trace()}</div>`
            : `<div class="dt-events scroll"><table class="dt-ev-table"><thead><tr><th>${t('time')}</th><th>${t('type')}</th><th>${t('eventLabel')}</th><th>${t('detail')}</th><th>${t('source')}</th></tr></thead><tbody>${rows || empty}</tbody></table></div>`}
    </div>`;
}

function fmt_axis(ms: number): string {
    const t = Math.floor(ms / 1000);
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function apply_zoom_filter(): void {
    const dt_play = get_dt_play();
    const detail_events = get_detail_events();
    const maxT = detail_events.reduce((a, e) => Math.max(a, e.relative_time_ms), 1);
    const window_pct = get_dt_zoom_window_pct();
    const win_width_ms = maxT * window_pct / 100;
    const playhead_ms = (dt_play / 100) * maxT;
    const win_left = Math.max(0, Math.min(maxT - win_width_ms, playhead_ms - win_width_ms / 2));
    const win_right = win_left + win_width_ms;
    const boundary_epsilon_ms = Math.max(1e-6, maxT * 1e-9);

    const tracks = document.querySelectorAll('.tl-lane-track');
    for (const track of tracks) {
        const marks = track.querySelectorAll<HTMLElement>('.tl-tick, .tl-dot, .tl-diamond');
        for (const m of marks) {
            const left = parseFloat(m.style.left || '0');
            const ev_ms = (left / 100) * maxT;
            if (
                ev_ms >= win_left - boundary_epsilon_ms
                && ev_ms <= win_right + boundary_epsilon_ms
            ) {
                m.classList.remove('tl-hidden');
            } else {
                m.classList.add('tl-hidden');
            }
        }
    }

    const mm_win = document.querySelector<HTMLElement>('.tl-mm-window');
    if (mm_win) {
        mm_win.style.width = `${window_pct}%`;
        mm_win.style.left = `${(win_left / maxT) * 100}%`;
        mm_win.dataset.draggable = window_pct < 100 ? '1' : '0';
    }
}

function render_trace(): string {
    const detail_events = get_detail_events();
    const dt_play = get_dt_play();
    const dt_zoom = get_dt_zoom();
    const lanes: [string, string, string][] = [
        ['network', 'net', t('laneNetwork')], ['user', 'ui', t('laneUi')],
        ['console', 'console', t('laneConsole')], ['dom', 'dom', t('laneDom')],
        ['storage', 'storage', t('laneStorage')], ['nav', 'nav', t('laneNav')],
        ['error', 'err', t('laneError')],
    ];
    const maxT = detail_events.reduce((a, e) => Math.max(a, e.relative_time_ms), 1);
    const TICKN = 8;
    const ticks = Array.from({ length: TICKN }, (_, i) => fmt_axis((maxT * i) / (TICKN - 1)));
    const playMs = (dt_play / 100) * maxT;
    const window_pct = get_dt_zoom_window_pct();
    const win_width_ms = maxT * window_pct / 100;
    const playhead_ms = (dt_play / 100) * maxT;
    const win_left = Math.max(0, Math.min(maxT - win_width_ms, playhead_ms - win_width_ms / 2));
    // t153 AC-004: 预建 idx 映射（对象恒等），消除 lanes 内对全量事件数组线性 index 查找的 O(n²)
    const idx_map = new Map<CaptureEvent, number>();
    for (let i = 0; i < detail_events.length; i++) idx_map.set(detail_events[i], i);
    const lanesHtml = lanes.map(([k, ic, label]) => {
        const evs = detail_events.filter((e) => event_kind(e) === k);
        const color = KIND[k].color;
        const marks = evs.map((e) => {
            const left = (e.relative_time_ms / maxT) * 100;
            const ev_idx = idx_map.get(e) ?? -1;
            const data_attr = ` data-event-idx="${ev_idx}"`;
            if (k === 'error') return `<span class="tl-diamond"${data_attr} style="left:${left}%"></span>`;
            if (k === 'console') return `<span class="tl-dot"${data_attr} style="left:${left}%;background:${color}"></span>`;
            if (k === 'nav') return `<span class="tl-tick"${data_attr} style="left:${left}%;height:80%;background:${color}"></span>`;
            return `<span class="tl-tick"${data_attr} style="left:${left}%;height:70%;background:${color}"></span>`;
        }).join('');
        return `<div class="tl-lane"><div class="tl-lane-hd"><span class="tl-lane-ic" style="color:${color}">${I[ic]}</span><span class="tl-lane-name">${label}</span><span class="tl-lane-count mono">${evs.length}</span></div><div class="tl-lane-track">${marks}</div></div>`;
    }).join('');
    return `<div class="tl">
        <div class="tl-toolbar">
            <div class="tl-zoom"><span>${t('zoom')}</span><input type="range" min="0" max="100" value="${dt_zoom}" id="tlZoom"></div>
            <span class="tl-playtime mono" id="tlPlaytime">${fmt_axis(playMs)}</span>
        </div>
        <div class="tl-grid">
            <div class="tl-axis">${ticks.map((t, i) => `<span class="mono" style="left:${(i / (TICKN - 1)) * 100}%">${t}</span>`).join('')}</div>
            <div class="tl-lanes" id="tlLanes">
                <div class="tl-lanes-content">
                    ${lanesHtml}
                    <div class="tl-track-overlay" id="tlTrackOverlay">
                        <div class="tl-playhead" id="tlPlayhead" style="left:${dt_play}%"><span class="tl-playhead-lbl mono">${fmt_axis(playMs)}</span></div>
                    </div>
                </div>
            </div>
            <div class="tl-minimap">
                <span class="mono tl-mm-edge">00:00</span>
                <div class="tl-mm-track" id="tlMmTrack"><div class="tl-mm-window" id="tlMmWindow" data-draggable="${window_pct < 100 ? 1 : 0}" style="left:${(win_left / maxT) * 100}%;width:${window_pct}%"></div></div>
                <span class="mono tl-mm-edge">${fmt_axis(maxT)}</span>
            </div>
        </div>
    </div>`;
}

function render_dt_inspector(): string {
    const detail_events = get_detail_events();
    const user_config = get_user_config();
    const e = detail_events[get_dt_sel()];
    if (!e) return '';
    const d = (e.data || {}) as Record<string, unknown>;
    const k = event_kind(e);
    const fields: [string, string][] = [
        [t('type'), kind_label(k) + ' · ' + e.type],
        [t('time'), rel_time(e.relative_time_ms)],
        [t('absoluteTime'), format_system_time(e.absolute_time, user_config)],
        [t('source'), String(d.source || e.source || '—')],
    ];
    if (e.type === 'network_request') {
        fields.push([t('method'), String(d.method || '')], [t('status'), String(d.status_code || '')], [t('url'), String(d.url || '')], [t('duration'), d.duration_ms != null ? Math.round(d.duration_ms as number) + ' ms' : '—']);
    } else {
        fields.push([t('detail'), event_detail(e)]);
    }
    return `<aside class="dt-insp scroll">
        <div class="dti-hd">
            <div class="dti-hd-l"><div class="dti-title"><b class="mono">${esc(event_title(e))}</b></div></div>
            <div class="dti-nav"><button class="ibtn" data-insp-close="1">${I.close}</button></div>
        </div>
        <div class="dti-body">
            ${fields.map(([key, v]) => `<div class="dti-field"><span class="k">${esc(key)}</span><span class="v mono" style="word-break:break-all">${esc(v)}</span></div>`).join('')}
        </div>
    </aside>`;
}

function render_net_table(selected_net_idx = get_dt_net_sel()): string {
    const detail_network = get_detail_network();
    const empty = `<div style="text-align:center;color:var(--ink-4);padding:36px">${t('noNetworkRequests')}</div>`;
    return `<div class="dt-events"><div class="net"><div class="net-table scroll">
        <div class="net-row net-head mono" style="grid-template-columns:130px 64px minmax(220px,1fr) 60px 90px 84px">
            <span>${t('time')}</span><span>${t('method')}</span><span>${t('url')}</span><span>${t('status')}</span><span>${t('type')}</span><span>${t('duration')}</span>
        </div>
        ${detail_network.length ? detail_network.map((r, idx) => {
        const err = (r.status_code || 0) >= 400;
        return `<div class="net-row${err ? ' err' : ''}" style="grid-template-columns:130px 64px minmax(220px,1fr) 60px 90px 84px" data-netidx="${idx}" data-sel="${selected_net_idx === idx ? 1 : 0}">
            <span class="mono dim">${esc(rel_time(typeof r.relative_time === 'number' ? r.relative_time : 0))}</span>
            <span class="mono"><span class="method-sm" data-m="${esc(r.method)}">${esc(r.method)}</span></span>
            <span class="mono url-cell" title="${esc(r.url)}">${esc(r.url)}</span>
            <span class="mono" style="color:${err ? 'var(--red-ink)' : 'var(--green-ink)'}">${esc(r.status_code)}</span>
            <span class="mono dim">${esc(r.resource_type)}</span>
            <span class="mono">${r.duration_ms != null ? Math.round(r.duration_ms) + ' ms' : '—'}</span>
        </div>`;
    }).join('') : empty}
    </div></div></div>`;
}

function render_net_inspector(selected_net_idx = get_dt_net_sel()): string {
    const req = get_detail_network()[selected_net_idx];
    if (!req) return '';
    const err = (req.status_code || 0) >= 400;
    const req_hdrs = req.request_headers ? Object.entries(req.request_headers).map(([k, v]) => `<div class="dti-field"><span class="k">${esc(k)}</span><span class="v mono">${esc(String(v))}</span></div>`).join('') : '<span class="dim">—</span>';
    const res_hdrs = req.response_headers ? Object.entries(req.response_headers).map(([k, v]) => `<div class="dti-field"><span class="k">${esc(k)}</span><span class="v mono">${esc(String(v))}</span></div>`).join('') : '<span class="dim">—</span>';
    const req_body = req.request_body ? `<pre class="body-pre">${esc(req.request_body)}</pre>` : '<span class="dim">—</span>';
    const res_body = req.response_body ? `<pre class="body-pre">${esc(req.response_body.slice(0, 8000))}${req.response_body.length > 8000 ? '\n... (truncated)' : ''}</pre>` : '<span class="dim">—</span>';
    return `<aside class="dt-insp scroll">
        <div class="dti-hd">
            <div class="dti-hd-l"><div class="dti-title"><b class="mono">${esc(req.method)} ${esc(req.url.slice(0, 60))}${req.url.length > 60 ? '...' : ''}</b></div></div>
            <div class="dti-nav"><button class="ibtn" data-net-insp-close="1">${I.close}</button></div>
        </div>
        <div class="dti-body">
            <div class="ov-panel-hd">${t('basicInfo')}</div>
            <div class="dti-grid c2" style="margin-top:4px">
                <div class="dti-field"><span class="k">${t('method')}</span><span class="v mono">${esc(req.method)}</span></div>
                <div class="dti-field"><span class="k">${t('statusCode')}</span><span class="v mono" style="color:${err ? 'var(--red-ink)' : 'var(--green-ink)'}">${esc(req.status_code)} ${esc(req.status_text || '')}</span></div>
                <div class="dti-field"><span class="k">${t('resourceType')}</span><span class="v mono">${esc(req.resource_type)}</span></div>
                <div class="dti-field"><span class="k">${t('duration')}</span><span class="v mono">${req.duration_ms != null ? Math.round(req.duration_ms) + ' ms' : '—'}</span></div>
                <div class="dti-field"><span class="k">${t('protocol')}</span><span class="v mono">${esc(req.protocol || '—')}</span></div>
                <div class="dti-field"><span class="k">MIME</span><span class="v mono">${esc(req.mime_type || '—')}</span></div>
                <div class="dti-field"><span class="k">${t('cache')}</span><span class="v mono">${req.from_cache ? 'from ' + esc(req.cache_status || 'cache') : 'no cache'}</span></div>
                <div class="dti-field"><span class="k">${t('captureMethod')}</span><span class="v mono">${esc(req.capture_method || '—')}</span></div>
            </div>
            <div class="dti-field span2" style="margin-top:4px"><span class="k">${t('url')}</span><span class="v mono" style="word-break:break-all">${esc(req.url)}</span></div>
            ${req.error_text ? `<div class="dti-field span2"><span class="k">${t('error')}</span><span class="v mono" style="color:var(--red-ink)">${esc(req.error_text)}</span></div>` : ''}
            <div class="ov-panel-hd" style="margin-top:12px">${t('requestHeaders')}</div>
            <div class="dti-related" style="margin-top:4px">${req_hdrs}</div>
            <div class="ov-panel-hd" style="margin-top:12px">${t('responseHeaders')}</div>
            <div class="dti-related" style="margin-top:4px">${res_hdrs}</div>
            <div class="ov-panel-hd" style="margin-top:12px">${t('requestBody')}</div>
            <div style="margin-top:4px">${req_body}</div>
            <div class="ov-panel-hd" style="margin-top:12px">${t('responseBody')} <span style="font-weight:400;font-size:11px;color:var(--ink-3)">${req.response_body_status || ''}</span></div>
            <div style="margin-top:4px">${res_body}</div>
        </div>
    </aside>`;
}

function render_con_table(): string {
    const detail_console = get_detail_console();
    const empty = `<div style="text-align:center;color:var(--ink-4);padding:36px">${t('noConsoleLogs')}</div>`;
    return `<div class="dt-events"><div class="con"><div class="con-table scroll">
        <div class="con-row con-head mono"><span>${t('time')}</span><span>${t('levelLabel')}</span><span>${t('messageLabel')}</span><span>${t('source')}</span><span>${t('lineLabel')}</span></div>
        ${detail_console.length ? detail_console.map((l) => `<div class="con-row${l.level === 'error' ? ' err' : ''}">
            <span class="mono dim">${esc(rel_time(typeof l.relative_time_ms === 'number' ? l.relative_time_ms : 0))}</span>
            <span><span class="lvl-tag" data-lvl="${esc(l.level)}">${esc(l.level)}</span></span>
            <span class="con-msg" style="${l.level === 'error' ? 'color:var(--red-ink)' : ''}">${esc((l.args_preview || []).join(' '))}</span>
            <span class="mono dim">${esc(l.source_url || '')}</span>
            <span class="mono dim">${esc(l.line ?? '')}</span>
        </div>`).join('') : empty}
    </div></div></div>`;
}

function render_simple_events(types: string[], headers: string[]): string {
    const detail_events = get_detail_events();
    const list = detail_events.filter((e) => types.includes(e.type));
    const tpl = '110px 110px 1fr 1fr 90px';
    const empty = `<div style="text-align:center;color:var(--ink-4);padding:36px">${t('noData')}</div>`;
    return `<div class="net" style="padding:0"><div class="net-table scroll" style="border-top:0">
        <div class="con-row con-head mono" style="grid-template-columns:${tpl}">${headers.map((h) => `<span>${h}</span>`).join('')}</div>
        ${list.length ? list.map((e) => `<div class="con-row" style="grid-template-columns:${tpl}">
            <span class="mono">${rel_time(e.relative_time_ms)}</span>
            <span class="mono dim">${kind_label(event_kind(e))}</span>
            <span class="mono dim">${esc(event_title(e))}</span>
            <span class="mono dim">${esc(event_detail(e))}</span>
            <span class="mono dim">${esc((e.data as Record<string, unknown>)?.source || e.source || '—')}</span>
        </div>`).join('') : empty}
    </div></div>`;
}

function render_dt_overview(): string {
    const detail_capture = get_detail_capture();
    const detail_events = get_detail_events();
    const st = detail_capture?.stats;
    return `<div class="simple-pad scroll">
        <div class="ov-2col" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px">
            <div class="ov-panel">
                <div class="ov-panel-hd">${t('captureSummary')}</div>
                <div class="dti-grid c3" style="padding:6px 0 12px">
                    <div class="dti-field"><span class="k">${t('duration')}</span><span class="v mono">${detail_capture ? capture_dur(detail_capture) : '—'}</span></div>
                    <div class="dti-field"><span class="k">${t('totalEvents')}</span><span class="v mono">${num(st?.event_count || detail_events.length)}</span></div>
                    <div class="dti-field"><span class="k">${t('totalErrors')}</span><span class="v red mono">${num(st?.error_count || 0)}</span></div>
                </div>
                <div class="ov-panel-hd" style="margin-top:6px">${t('categoryOverview')}</div>
                <div class="dti-related" style="margin-top:4px">
                    ${[
                        { label: t('capUser'), val: num(st?.user_action_count || 0), color: 'var(--src-user)', icon: 'ui' },
                        { label: t('capNav'), val: num(st?.nav_count || 0), color: 'var(--src-nav)', icon: 'nav' },
                        { label: t('capNet'), val: num(st?.request_count || 0), color: 'var(--src-network)', icon: 'net' },
                        { label: t('capConsole'), val: num(st?.log_count || 0), color: 'var(--src-console)', icon: 'console' },
                        { label: t('capError'), val: num(st?.error_count || 0), color: 'var(--src-error)', icon: 'err' },
                        { label: t('capStorage'), val: num(st?.storage_change_count || 0), color: 'var(--src-storage)', icon: 'storage' },
                        { label: t('capCookie'), val: num(st?.cookie_change_count || 0), color: 'var(--src-cookie)', icon: 'cookie' },
                    ].map((m) => `<div class="rel-row" style="cursor:default"><span class="rel-t mono">${m.val}</span><span class="rel-ic" style="color:${m.color}">${I[m.icon]}</span><span class="rel-ev">${m.label}</span></div>`).join('')}
                </div>
            </div>
            <div class="ov-panel">
                <div class="ov-panel-hd">${t('keyTimeline')}</div>
                <div class="dti-related" style="margin-top:4px">
                    ${detail_events.slice(0, 8).map((e) => { const k = KIND[event_kind(e)]; return `<div class="rel-row" style="cursor:default"><span class="rel-t">${rel_time(e.relative_time_ms)}</span><span class="rel-ic" style="color:${k.color}">${I[k.icon]}</span><span class="rel-ev">${esc(event_title(e))}</span></div>`; }).join('') || `<span style="color:var(--ink-4);font-size:12px">${t('noEvents')}</span>`}
                </div>
            </div>
        </div>
    </div>`;
}

function render_dt_config(): string {
    const detail_capture = get_detail_capture();
    const cfg = (detail_capture?.config_snapshot || {}) as Record<string, unknown>;
    const item = (l: string, on: boolean) => `<div class="dt-toggle" style="padding:8px 0"><span class="tg-lbl">${l}</span><span class="switch" data-on="${on ? 1 : 0}"><span class="knob"></span></span></div>`;
    return `<div class="simple-pad scroll" style="max-width:620px">
        <p style="font-size:12.5px;color:var(--ink-3);margin:14px 0 0">${t('configIntro')} <span class="lnk" data-nav-settings="1">${t('settingsDefaultsLink')}</span></p>
        <div class="ov-panel" style="margin-top:14px">
            <div class="ov-panel-hd">${t('captureModules')}</div>
            ${item(t('capUser'), cfg.event_count_enabled !== false)}
            ${item(t('capNav'), cfg.nav_count_enabled !== false)}
            ${item(t('capNet'), cfg.capture_network !== false)}
            ${item(t('capConsole'), cfg.capture_console !== false)}
            ${item(t('capError'), cfg.error_count_enabled !== false)}
            ${item(t('capStorage'), cfg.storage_change_count_enabled !== false)}
            ${item(t('capCookie'), cfg.cookie_change_count_enabled !== false)}
        </div>
        <div class="ov-panel" style="margin-top:14px">
            <div class="ov-panel-hd">${t('captureOptions')}</div>
            ${item(t('captureRequestBody'), !!cfg.capture_request_body)}
            ${item(t('captureResponseBody'), !!cfg.capture_response_body)}
            ${item(t('captureInputValues'), !!cfg.capture_input_values)}
        </div>
        <div class="ov-panel" style="margin-top:14px">
            <div class="ov-panel-hd">${t('privacyRedaction')}</div>
            ${item(t('redactData'), !!cfg.redact_data)}
        </div>
    </div>`;
}

function wire_detail(): void {
    const c = document.getElementById('content')!;
    const detail_capture = get_detail_capture();
    c.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => router.go('captures')));
    c.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { set_dt_tab((b as HTMLElement).dataset.tab!); router.render_content(); }));
    c.querySelectorAll('[data-mfilter]').forEach((b) => b.addEventListener('click', () => { set_dt_tab('timeline'); set_dt_quick((b as HTMLElement).dataset.mfilter!); router.render_content(); }));
    c.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => { set_dt_quick((b as HTMLElement).dataset.quick!); router.render_content(); }));
    c.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { set_dt_view((b as HTMLElement).dataset.view as 'list' | 'trace'); router.render_content(); }));
    c.querySelectorAll('tr[data-ev]').forEach((tr) => tr.addEventListener('click', () => { set_dt_sel(Number((tr as HTMLElement).dataset.ev)); set_dt_insp_open(true); router.render_content(); }));
    c.querySelector('[data-insp-close]')?.addEventListener('click', () => { set_dt_insp_open(false); router.render_content(); });
    c.querySelector('#dtSearch')?.addEventListener('input', debounce(() => router.render_content(), 200));
    c.querySelector('[data-dexport]')?.addEventListener('click', () => {
        const fmt = (c.querySelector('#dtExportFmt') as HTMLSelectElement)?.value || 'json';
        detail_capture && export_capture(detail_capture.capture_id, fmt);
    });
    c.querySelector('[data-open-url]')?.addEventListener('click', () => {
        const u = detail_capture?.start_url;
        // t154 AC-004: start_url 来自采集数据，仅 http/https 可打开，其余拒绝
        if (u && /^https?:\/\//i.test(u)) chrome.tabs.create({ url: u });
    });
    c.querySelector('[data-nav-settings]')?.addEventListener('click', () => router.go('settings'));
    c.querySelectorAll('[data-netidx]').forEach((row) => row.addEventListener('click', () => {
        set_dt_net_sel(Number((row as HTMLElement).dataset.netidx));
        set_dt_net_insp_closed(false);
        router.render_content();
    }));
    c.querySelector('[data-net-insp-close]')?.addEventListener('click', () => { set_dt_net_insp_closed(true); set_dt_net_sel(-1); router.render_content(); });
    wire_rail_resize(c);
    wire_network_resize(c);
    wire_trace();
}

function wire_rail_resize(c: HTMLElement): void {
    const handle = c.querySelector('.dt-rail-handle') as HTMLElement | null;
    if (!handle) return;
    const body = handle.closest('.dt-body') as HTMLElement | null;
    const rail = handle.closest('.dt-rail') as HTMLElement | null;
    if (!body || !rail) return;
    const STORAGE_KEY = 'dt_rail_width';
    const MIN_W = 160, MAX_W = 480;

    const apply_width = (w: number) => {
        const cols = body.style.gridTemplateColumns || getComputedStyle(body).gridTemplateColumns;
        const parts = cols.split(' ').filter(Boolean);
        if (parts.length >= 2) {
            parts[0] = `${w}px`;
            body.style.gridTemplateColumns = parts.join(' ');
        }
    };

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        const w = parseInt(saved);
        if (w >= MIN_W && w <= MAX_W) apply_width(w);
    }

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        handle.classList.add('active');
        const startX = (e as MouseEvent).clientX;
        const startWidth = rail.getBoundingClientRect().width;

        const onMove = (ev: MouseEvent) => {
            const dx = ev.clientX - startX;
            const w = Math.max(MIN_W, Math.min(MAX_W, startWidth + dx));
            apply_width(w);
        };
        const onUp = () => {
            handle.classList.remove('active');
            localStorage.setItem(STORAGE_KEY, String(Math.round(rail.getBoundingClientRect().width)));
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            window.removeEventListener('pointercancel', onUp);
            document.removeEventListener('mouseleave', onUp);
        };
        // t154 AC-007: pointercancel/mouseleave 也触发清理——鼠标移出窗口释放时 mouseup 可能不派发，
        // 不清理会导致拖拽状态残留
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        window.addEventListener('pointercancel', onUp);
        document.addEventListener('mouseleave', onUp);
    });
}

function wire_network_resize(c: HTMLElement): void {
    const handle = c.querySelector('.dt-insp-handle') as HTMLElement | null;
    if (!handle) return;
    const body = handle.closest('.dt-network-body') as HTMLElement | null;
    const insp = body?.querySelector('.dt-insp') as HTMLElement | null;
    if (!body || !insp) return;
    const STORAGE_KEY = 'dt_network_detail_width';
    const MIN_W = 320, MAX_W = 720;

    const apply_width = (w: number) => {
        body.style.gridTemplateColumns = `minmax(0, 1fr) 5px ${w}px`;
    };

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        const w = parseInt(saved);
        if (w >= MIN_W && w <= MAX_W) apply_width(w);
    }

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        handle.classList.add('active');
        const startX = (e as MouseEvent).clientX;
        const startWidth = insp.getBoundingClientRect().width;

        const onMove = (ev: MouseEvent) => {
            const dx = startX - ev.clientX;
            const w = Math.max(MIN_W, Math.min(MAX_W, startWidth + dx));
            apply_width(w);
        };
        const onUp = () => {
            handle.classList.remove('active');
            localStorage.setItem(STORAGE_KEY, String(Math.round(insp.getBoundingClientRect().width)));
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            window.removeEventListener('pointercancel', onUp);
            document.removeEventListener('mouseleave', onUp);
        };
        // t154 AC-007: pointercancel/mouseleave 也触发清理——鼠标移出窗口释放时 mouseup 可能不派发，
        // 不清理会导致拖拽状态残留
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        window.addEventListener('pointercancel', onUp);
        document.addEventListener('mouseleave', onUp);
    });
}

function wire_trace(): void {
    const detail_events = get_detail_events();
    const lanes = document.getElementById('tlLanes');
    const overlay = document.getElementById('tlTrackOverlay');
    const head = document.getElementById('tlPlayhead');
    const lbl = head?.querySelector('.tl-playhead-lbl') as HTMLElement | null;
    const time = document.getElementById('tlPlaytime');
    const zoom = document.getElementById('tlZoom') as HTMLInputElement | null;
    const mm_track = document.getElementById('tlMmTrack');
    const mm_window = document.getElementById('tlMmWindow');
    if (!lanes || !overlay || !head) return;
    const maxT = detail_events.reduce((a, e) => Math.max(a, e.relative_time_ms), 1);

    const update_playhead = make_update_playhead(head, lbl, time, maxT);

    wire_lane_pointerdown(lanes, overlay, detail_events, maxT, update_playhead);
    if (mm_track && mm_window) {
        wire_minimap_drag(mm_track, mm_window, update_playhead);
    }
    if (zoom) {
        zoom.addEventListener('input', () => {
            set_dt_zoom(Number(zoom.value));
            apply_zoom_filter();
        });
    }
    apply_zoom_filter();
}

/** 构造 playhead 更新器（含 zoom 过滤应用）。 */
function make_update_playhead(
    head: HTMLElement,
    lbl: HTMLElement | null,
    time: HTMLElement | null,
    maxT: number,
): (playhead_pct: number) => void {
    return (playhead_pct: number) => {
        const p = Math.min(100, Math.max(0, playhead_pct));
        set_dt_play(p);
        head.style.left = `${p}%`;
        const txt = fmt_axis((p / 100) * maxT);
        if (lbl) lbl.textContent = txt;
        if (time) time.textContent = txt;
        apply_zoom_filter();
    };
}

/** lanes 拖拽与 marker 点击处理。 */
function wire_lane_pointerdown(
    lanes: HTMLElement,
    overlay: HTMLElement,
    detail_events: CaptureEvent[],
    maxT: number,
    update_playhead: (pct: number) => void,
): void {
    const seek = (clientX: number) => {
        const r = overlay.getBoundingClientRect();
        if (r.width <= 0) return;
        update_playhead(((clientX - r.left) / r.width) * 100);
    };
    const MARKER_SELECTOR = '.tl-tick, .tl-dot, .tl-diamond';
    let marker_start_x = 0;
    let marker_start_y = 0;
    let marker_el: HTMLElement | null = null;

    lanes.addEventListener('pointerdown', (e) => {
        const pe = e as PointerEvent;
        const target = pe.target as HTMLElement;
        const m = target.matches(MARKER_SELECTOR) ? target : target.closest(MARKER_SELECTOR) as HTMLElement | null;
        if (m) {
            e.stopPropagation();
            marker_start_x = pe.clientX;
            marker_start_y = pe.clientY;
            marker_el = m;
            // t144: 拖拽标记——轮询 render 检查，拖拽期间不整页重渲染打断
            _tl_dragging = true;
            const mv = (ev: PointerEvent) => seek(ev.clientX);
            // t189 AC-006: finish 统一处理 pointerup/pointercancel/lostpointercapture/blur——
            // 任一结束路径都清 _tl_dragging，详情轮询不再永久跳过刷新
            const finish_marker = (ev: PointerEvent | Event) => {
                window.removeEventListener('pointermove', mv);
                window.removeEventListener('pointerup', finish_marker);
                window.removeEventListener('pointercancel', finish_marker);
                window.removeEventListener('lostpointercapture', finish_marker);
                window.removeEventListener('blur', finish_marker);
                _tl_dragging = false;
                const p_ev = ev as PointerEvent;
                if (p_ev.clientX !== undefined) {
                    const dx = p_ev.clientX - marker_start_x;
                    const dy = p_ev.clientY - marker_start_y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist <= 3 && marker_el) {
                        const idx_str = marker_el.dataset.eventIdx;
                        if (idx_str != null) {
                            const idx = parseInt(idx_str, 10);
                            const evt = detail_events[idx];
                            if (evt) {
                                update_playhead((evt.relative_time_ms / maxT) * 100);
                                const same_event = get_dt_sel() === idx && get_dt_insp_open();
                                set_dt_sel(idx);
                                set_dt_insp_open(true);
                                if (!same_event) router.render_content();
                            }
                        }
                    }
                }
                marker_el = null;
            };
            window.addEventListener('pointermove', mv);
            window.addEventListener('pointerup', finish_marker);
            window.addEventListener('pointercancel', finish_marker);
            window.addEventListener('lostpointercapture', finish_marker);
            window.addEventListener('blur', finish_marker);
            return;
        }
        // Normal lanes drag — non-marker area
        seek(pe.clientX);
        set_dt_insp_open(false);
        router.render_content();
        const mv = (ev: PointerEvent) => seek(ev.clientX);
        // t189 AC-006: normal lane 同样统一 pointerup/pointercancel/lostpointercapture/blur 清理
        const finish_lane = () => {
            window.removeEventListener('pointermove', mv);
            window.removeEventListener('pointerup', finish_lane);
            window.removeEventListener('pointercancel', finish_lane);
            window.removeEventListener('lostpointercapture', finish_lane);
            window.removeEventListener('blur', finish_lane);
        };
        window.addEventListener('pointermove', mv);
        window.addEventListener('pointerup', finish_lane);
        window.addEventListener('pointercancel', finish_lane);
        window.addEventListener('lostpointercapture', finish_lane);
        window.addEventListener('blur', finish_lane);
    });
}

/** 最小地图窗口拖拽。 */
function wire_minimap_drag(
    mm_track: HTMLElement,
    mm_window: HTMLElement,
    update_playhead: (pct: number) => void,
): void {
    let active_pointer_id: number | null = null;
    mm_window.addEventListener('pointerdown', (event) => {
        const pointer_event = event as PointerEvent;
        const window_pct = get_dt_zoom_window_pct();
        const track_rect = mm_track.getBoundingClientRect();
        if (
            pointer_event.button !== 0
            || window_pct >= 100
            || track_rect.width <= 0
            || active_pointer_id !== null
        ) return;

        event.preventDefault();
        event.stopPropagation();
        const pointer_id = pointer_event.pointerId;
        active_pointer_id = pointer_id;
        // t144: minimap 拖拽同样置标记，轮询 render 不打断
        _tl_dragging = true;
        const start_client_x = pointer_event.clientX;
        const start_left_pct = parseFloat(mm_window.style.left || '0');
        let is_active = true;

        const finish_drag = () => {
            if (!is_active) return;
            is_active = false;
            active_pointer_id = null;
            _tl_dragging = false;
            mm_window.removeEventListener('pointermove', move);
            mm_window.removeEventListener('pointerup', finish);
            mm_window.removeEventListener('pointercancel', finish);
            mm_window.removeEventListener('lostpointercapture', finish);
            if (mm_window.hasPointerCapture(pointer_id)) {
                mm_window.releasePointerCapture(pointer_id);
            }
            mm_window.classList.remove('is-dragging');
        };
        const move = (move_event: PointerEvent) => {
            if (!is_active || move_event.pointerId !== pointer_id) return;
            const delta_pct = ((move_event.clientX - start_client_x) / track_rect.width) * 100;
            const max_left_pct = Math.max(0, 100 - window_pct);
            const left_pct = Math.min(max_left_pct, Math.max(0, start_left_pct + delta_pct));
            update_playhead(left_pct + window_pct / 2);
        };
        const finish = (finish_event: Event) => {
            const pointer_finish_event = finish_event as PointerEvent;
            if (pointer_finish_event.pointerId !== pointer_id) return;
            finish_drag();
        };

        mm_window.classList.add('is-dragging');
        mm_window.setPointerCapture(pointer_id);
        mm_window.addEventListener('pointermove', move);
        mm_window.addEventListener('pointerup', finish);
        mm_window.addEventListener('pointercancel', finish);
        mm_window.addEventListener('lostpointercapture', finish);
    });
}

export { render_detail, wire_detail, open_detail, render_trace };

// 测试钩子（p022）：直连 filtered 列表渲染，供详情搜索过滤语义断言。
export function _render_dt_list_for_test(): string {
    return render_dt_list();
}

// 测试钩子（t151）：直连其余事件渲染函数，供参数化 XSS 转义断言（真实输入 → 渲染输出）。
export function _render_net_inspector_for_test(selected_net_idx?: number): string {
    return render_net_inspector(selected_net_idx);
}
export function _render_con_table_for_test(): string {
    return render_con_table();
}
export function _render_net_table_for_test(): string {
    return render_net_table();
}
export function _render_simple_events_for_test(types: string[], headers: string[]): string {
    return render_simple_events(types, headers);
}
export function _render_dt_inspector_for_test(): string {
    return render_dt_inspector();
}

async function open_detail(id: string): Promise<void> {
    // t154 AC-003: 先保存当前采集（若已打开详情）的 tab/view/quick，供下次打开恢复
    save_dt_memory(get_detail_capture()?.capture_id);
    set_page('detail'); set_dt_tab('timeline'); set_dt_view('list'); set_dt_quick('all'); set_dt_sel(-1); set_dt_insp_open(false);
    await load_detail(id);
    // 按 capture_id 恢复上次 tab/view/quick（若有记忆）
    const mem = get_dt_memory(id);
    if (mem) { set_dt_tab(mem.tab); set_dt_view(mem.view); set_dt_quick(mem.quick); }
    router.render_shell();
}
