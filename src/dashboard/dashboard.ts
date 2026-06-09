// dashboard/dashboard.ts — Capture All 主面板 (main panel)
// Faithful port of the design demo, wired to real extension data.
import type { Session, RecordEvent, NetworkRequest, ConsoleLog, UserConfig, ThemeMode } from '../shared/types';
import { init_locale, set_locale, type Locale } from '../shared/i18n';
import { init_theme, set_theme } from '../shared/theme';
import { load_user_config, save_user_config } from '../shared/user_config';
import { DEFAULT_USER_CONFIG } from '../shared/constants';
import { format_system_time } from '../shared/system_time';
import { normalize_agent_bridge_config } from '../shared/agent_bridge_config';
import { Logger } from '../shared/logger';
import { get_app_log_transport } from '../background/app_log_storage';
import { I } from './icons';

const logger = new Logger('dashboard', get_app_log_transport());

const is_extension = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

let user_config: UserConfig = { ...DEFAULT_USER_CONFIG } as UserConfig;
let sessions: Session[] = [];
let page = 'captures';
let selected = new Set<string>();

// detail page state
let detail_session: Session | null = null;
let detail_events: RecordEvent[] = [];
let detail_network: NetworkRequest[] = [];
let detail_console: ConsoleLog[] = [];
let dt_tab = 'timeline';
let dt_view: 'list' | 'trace' = 'list';
let dt_quick = 'all';
let dt_sel = -1;
let dt_insp_open = false;
let dt_play = 49.5; // trace playhead position (%)

// Network detail panel state
let dt_net_sel = -1;

const root = document.getElementById('root')!;

// ── helpers ─────────────────────────────────────────────────────────────
function esc(s: unknown): string {
    return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}
function num(n: number): string { return (n ?? 0).toLocaleString('en-US'); }
function strip_proto(u: string): string { return (u || '').replace(/^https?:\/\//, ''); }

function dur_ms(ms: number): string {
    const t = Math.floor(ms / 1000);
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    const p = (x: number) => String(x).padStart(2, '0');
    return `${p(h)}:${p(m)}:${p(s)}`;
}
function session_dur(s: Session): string {
    if (!s.ended_at) return '—';
    return dur_ms(new Date(s.ended_at).getTime() - new Date(s.started_at).getTime());
}
function session_name(s: Session): string {
    return s.name || `${format_system_time(s.started_at, user_config)} 的采集`;
}

// estimated on-disk size from stats (real storage size is not tracked per session)
function est_bytes(s: Session): number {
    const st = s.stats;
    if (!st) return 0;
    return st.event_count * 120 + st.request_count * 450 + st.log_count * 160
        + st.storage_change_count * 90 + st.cookie_change_count * 80;
}
function fmt_size(bytes: number): string {
    if (bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
function pct(part: number, whole: number): string {
    if (!whole) return '占比 0%';
    return `占比 ${((part / whole) * 100).toFixed(2)}%`;
}
function delta_pct(cur: number, prev: number): string | null {
    if (prev === 0) return cur > 0 ? '新增' : null;
    const d = ((cur - prev) / prev) * 100;
    return `${d >= 0 ? '+' : ''}${d.toFixed(0)}%`;
}

// event kind → icon + color (matches demo KIND)
const KIND: Record<string, { icon: string; color: string }> = {
    session: { icon: 'agent', color: 'var(--src-session)' },
    nav: { icon: 'nav', color: 'var(--src-nav)' },
    user: { icon: 'ui', color: 'var(--src-user)' },
    network: { icon: 'net', color: 'var(--src-network)' },
    storage: { icon: 'storage', color: 'var(--src-storage)' },
    console: { icon: 'console', color: 'var(--src-console)' },
    dom: { icon: 'dom', color: 'var(--src-dom)' },
    cookie: { icon: 'cookie', color: 'var(--src-cookie)' },
    error: { icon: 'err', color: 'var(--src-error)' },
};
function event_kind(e: RecordEvent): string {
    switch (e.type) {
        case 'mouse_event': case 'keyboard_event': case 'scroll_event': case 'input_event': return 'user';
        case 'page_navigation': case 'route_change': case 'page_load': case 'tab_switch':
        case 'tab_created': case 'tab_url_change': case 'dom_ready': return 'nav';
        case 'network_request': return 'network';
        case 'console_event': return 'console';
        case 'runtime_exception': case 'unhandled_rejection': case 'resource_error':
        case 'network_failed': case 'capture_error': return 'error';
        case 'storage_change': return 'storage';
        case 'cookie_change': return 'cookie';
        case 'dom_mutation': return 'dom';
        default: return 'session';
    }
}
const KIND_LABEL: Record<string, string> = {
    user: '用户', nav: '导航', network: '网络', console: '控制台',
    error: '错误', storage: '存储', cookie: 'Cookie', dom: 'DOM', session: '生命周期',
};
function rel_time(ms: number): string {
    const s = Math.floor(ms / 1000), mss = Math.floor(ms % 1000);
    return `+${String(s).padStart(2, '0')}.${String(mss).padStart(3, '0')}s`;
}
function event_detail(e: RecordEvent): string {
    const d = (e.data || {}) as Record<string, unknown>;
    switch (e.type) {
        case 'mouse_event': return `${d.action} (${d.x}, ${d.y}) ${d.target_tag || ''}`;
        case 'keyboard_event': return `${d.action} ${d.key || ''}`;
        case 'scroll_event': return `scroll (${d.scroll_x}, ${d.scroll_y})`;
        case 'input_event': return `${d.target_tag || ''} ${d.target_selector || ''}`;
        case 'dom_mutation': return `${d.action || ''} ${d.target_selector || d.target_tag || ''}`;
        case 'page_navigation': return `${d.from || ''} → ${d.to || ''}`;
        case 'route_change': return String(d.to || 'SPA 路由变化');
        case 'page_load': return `loaded in ${d.load_time_ms}ms`;
        case 'network_request': return String(d.url || '');
        case 'console_event': return Array.isArray(d.args_preview) ? (d.args_preview as string[]).join(' ') : '';
        case 'storage_change': return `${d.key || ''} changed`;
        case 'cookie_change': return `${d.name || ''} changed`;
        default: return '';
    }
}
function event_title(e: RecordEvent): string {
    const d = (e.data || {}) as Record<string, unknown>;
    switch (e.type) {
        case 'mouse_event': return `${d.action || '点击'} ${d.target_tag || ''}`;
        case 'keyboard_event': return `按键 ${d.key || ''}`;
        case 'scroll_event': return '滚动';
        case 'input_event': return '输入';
        case 'page_navigation': return `打开 ${d.to || ''}`;
        case 'route_change': return `路由变化 ${d.to || ''}`;
        case 'network_request': return `${d.method || ''} ${strip_proto(String(d.url || ''))}`;
        case 'console_event': return String(d.level || 'log');
        case 'storage_change': return `${d.key || 'storage'} changed`;
        case 'cookie_change': return `${d.name || 'cookie'} changed`;
        case 'dom_mutation': return 'DOM 变化';
        case 'capture_started': return '开始采集';
        case 'capture_stopped': return '停止采集';
        default: return e.type;
    }
}

// ── data ────────────────────────────────────────────────────────────────
async function load_sessions(): Promise<void> {
    if (!is_extension) return;
    try { sessions = (await chrome.runtime.sendMessage({ action: 'list_sessions' })) || []; }
    catch { sessions = []; }
}
async function load_detail(id: string): Promise<void> {
    detail_session = null; detail_events = []; detail_network = []; detail_console = [];
    if (!is_extension) return;
    try {
        const r = await chrome.runtime.sendMessage({ action: 'get_session_data', session_id: id });
        if (r?.success) {
            detail_session = r.session;
            detail_events = (r.events || []).slice().sort((a: RecordEvent, b: RecordEvent) => a.relative_time_ms - b.relative_time_ms);
            detail_network = r.network_requests || [];
            detail_console = r.console_logs || [];
        }
    } catch { /* best effort */ }
}

// ── sidebar / shell ─────────────────────────────────────────────────────
const NAV = [
    { key: 'captures', icon: 'navCaptures', lbl: '采集记录' },
    { key: 'current', icon: 'navCurrent', lbl: '当前采集' },
    { key: 'exports', icon: 'navExport', lbl: '导出任务' },
    { key: 'settings', icon: 'navSettings', lbl: '设置' },
    { key: 'integrations', icon: 'navMcp', lbl: 'MCP / 集成' },
];

function render_shell(): void {
    const active = page === 'detail' ? 'captures' : page;
    const live = sessions.filter((s) => s.status === 'capturing').length;
    root.innerHTML = `<div class="app">
        <div class="titlebar">
            <span class="tl-lights"><i></i><i></i><i></i></span>
            <span class="tl-title">Capture All — 主面板</span>
        </div>
        <div class="app-body">
            <aside class="sidebar">
                <div class="sb-brand"><span class="sb-logo"><span class="sb-logo-ring"></span></span><b>Capture All</b></div>
                <nav class="sb-nav">
                    ${NAV.map((n) => `<button class="sb-item" data-nav="${n.key}" data-on="${active === n.key ? 1 : 0}">
                        <span class="sb-ic">${I[n.icon]}</span><span class="sb-lbl">${n.lbl}</span>
                        ${n.key === 'current' && live ? `<span class="sb-badge mono">${live}</span>` : ''}
                    </button>`).join('')}
                </nav>
                <div class="sb-spacer"></div>
                <div class="sb-user">
                    <span class="sb-ava">A</span>
                    <div class="sb-user-meta"><b>本地用户</b><span>Capture All</span></div>
                </div>
            </aside>
            <div class="content" id="content"></div>
        </div>
    </div>`;
    root.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => go((b as HTMLElement).dataset.nav!)));
    render_content();
}

function go(p: string): void { page = p; render_shell(); }

function render_content(): void {
    const c = document.getElementById('content')!;
    if (page === 'captures') { c.innerHTML = render_captures(); wire_captures(); }
    else if (page === 'detail') { c.innerHTML = render_detail(); wire_detail(); }
    else if (page === 'settings') { c.innerHTML = render_settings(); wire_settings(); }
    else if (page === 'current') { c.innerHTML = render_current(); wire_simple_open(); }
    else if (page === 'exports') { c.innerHTML = render_exports(); }
    else if (page === 'integrations') { c.innerHTML = render_integrations(); }
}

// ── captures page ───────────────────────────────────────────────────────
function render_captures(): string {
    const total = sessions.length;
    const withErr = sessions.filter((s) => (s.stats?.error_count || 0) > 0).length;
    const completed = sessions.filter((s) => s.status === 'completed').length;
    const totalBytes = sessions.reduce((a, s) => a + est_bytes(s), 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yest = new Date(today.getTime() - 86400000);
    const cntDay = (d0: Date, d1: Date) => sessions.filter((s) => {
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
    const rows = sessions.map((s) => {
        const id = esc(s.capture_id);
        return `<tr data-open="${id}" data-sel="${selected.has(s.capture_id) ? 1 : 0}">
            <td class="col-chk" data-stop="1"><input type="checkbox" class="ck" data-chk="${id}" ${selected.has(s.capture_id) ? 'checked' : ''}></td>
            <td><span class="cap-name">${s.status === 'capturing' ? '<span class="recdot" title="采集中"></span>' : ''}<b>${esc(session_name(s))}</b></span></td>
            <td><span class="cap-url mono" title="${esc(s.start_url)}">${esc(strip_proto(s.start_url) || '—')}</span></td>
            <td><span class="cap-time mono">${esc(format_system_time(s.started_at, user_config))}</span></td>
            <td><span class="cap-dur mono">${session_dur(s)}</span></td>
            <td class="col-num mono">${num(s.stats?.event_count || 0)}</td>
            <td class="col-num mono">${num(s.stats?.request_count || 0)}</td>
            <td class="col-num"><span class="cap-errs mono" data-bad="${(s.stats?.error_count || 0) > 0 ? 1 : 0}">${num(s.stats?.error_count || 0)}</span></td>
            <td class="col-num mono">${fmt_size(est_bytes(s))}</td>
            <td>${(s.tags && s.tags[0]) ? `<span class="chip-tag">${esc(s.tags[0])}</span>` : '<span class="cap-time">—</span>'}</td>
            <td class="col-act" data-stop="1"><span class="rowact">
                <button class="ibtn" title="导出" data-export="${id}">${I.download}</button>
                <button class="ibtn" title="删除" data-del="${id}">${I.trash}</button>
            </span></td>
        </tr>`;
    }).join('');
    const empty = `<tr><td colspan="12" style="text-align:center;color:var(--ink-4);padding:40px">暂无采集记录</td></tr>`;
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
                    <th>采集名称</th><th>页面 / URL</th><th>时间</th><th>时长</th>
                    <th class="col-num">事件数</th><th class="col-num">请求数</th><th class="col-num">错误数</th>
                    <th class="col-num">大小</th><th>导出状态</th><th>标签</th><th class="col-act">操作</th>
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
            <div class="cap-batch-r"><span class="cap-total">共 <b class="mono">${num(sessions.length)}</b> 条</span></div>
        </div>
    </div>`;
}

function wire_captures(): void {
    const c = document.getElementById('content')!;
    c.querySelectorAll('tr[data-open]').forEach((tr) => {
        tr.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('[data-stop]')) return;
            open_detail((tr as HTMLElement).dataset.open!);
        });
    });
    c.querySelectorAll('[data-chk]').forEach((cb) => cb.addEventListener('change', () => {
        const id = (cb as HTMLElement).dataset.chk!;
        if ((cb as HTMLInputElement).checked) selected.add(id); else selected.delete(id);
        render_content();
    }));
    const all = c.querySelector('#capAll') as HTMLInputElement | null;
    all?.addEventListener('change', () => {
        if (all.checked) sessions.forEach((s) => selected.add(s.capture_id)); else selected.clear();
        render_content();
    });
    c.querySelector('#capClear')?.addEventListener('click', () => { selected.clear(); render_content(); });
    c.querySelectorAll('#capRefresh, #capRefresh2').forEach((b) => b.addEventListener('click', async () => { await load_sessions(); render_content(); }));
    c.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => export_session((b as HTMLElement).dataset.export!)));
    c.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => del_session((b as HTMLElement).dataset.del!)));
    c.querySelector('#batchExport')?.addEventListener('click', () => selected.forEach((id) => export_session(id)));
    c.querySelector('#batchDel')?.addEventListener('click', async () => {
        if (!selected.size || !confirm('确定删除选中的采集记录？')) return;
        for (const id of selected) await chrome.runtime.sendMessage({ action: 'delete_session', session_id: id });
        selected.clear(); await load_sessions(); render_content();
    });
}

async function export_session(id: string, format: string = 'json'): Promise<void> {
    if (!is_extension) return;
    try {
        const action = format === 'html' ? 'export_html' : format === 'har' ? 'export_har' : format === 'jsonl' ? 'export_jsonl' : 'export_json';
        const r = await chrome.runtime.sendMessage({ action, session_id: id });
        if (!r?.success) { alert('导出失败'); return; }
        const ext = format === 'html' ? 'html' : format === 'har' ? 'har' : format === 'jsonl' ? 'jsonl' : 'json';
        const mime = format === 'html' ? 'text/html' : 'application/json';
        const content = r.json ?? r.jsonl ?? r.html ?? r.har ?? JSON.stringify(r);
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `capture_all_${id}.${ext}`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
    } catch (err) { logger.error('Export error', err); }
}
async function del_session(id: string): Promise<void> {
    if (!is_extension || !confirm('确定删除此采集记录？')) return;
    await chrome.runtime.sendMessage({ action: 'delete_session', session_id: id });
    selected.delete(id);
    await load_sessions(); render_content();
}

async function open_detail(id: string): Promise<void> {
    page = 'detail'; dt_tab = 'timeline'; dt_view = 'list'; dt_quick = 'all'; dt_sel = -1; dt_insp_open = false;
    await load_detail(id);
    render_shell();
}

// ── detail page ─────────────────────────────────────────────────────────
function detail_metrics(): { icon: string; lbl: string; val: string; color: string; danger?: boolean; filter?: string; delta?: string; dTone?: string }[] {
    const st = detail_session?.stats;
    // previous session (chronologically before current) for real deltas
    let prev: Session | null = null;
    if (detail_session) {
        const cur = new Date(detail_session.started_at).getTime();
        for (const s of sessions) {
            const t = new Date(s.started_at).getTime();
            if (t < cur && (!prev || t > new Date(prev.started_at).getTime())) prev = s;
        }
    }
    const ps = prev?.stats;
    const d = (cur: number, p: number | undefined): { delta?: string; dTone?: string } => {
        if (p == null) return {};
        const txt = delta_pct(cur, p);
        if (!txt) return {};
        return { delta: txt, dTone: txt.startsWith('-') ? 'red' : 'green' };
    };
    return [
        { icon: 'ui', lbl: '用户行为', val: num(st?.event_count || 0), color: 'var(--src-user)', filter: 'user', ...d(st?.event_count || 0, ps?.event_count) },
        { icon: 'nav', lbl: '页面导航', val: num(st?.nav_count || 0), color: 'var(--src-nav)', filter: 'nav', ...d(st?.nav_count || 0, ps?.nav_count) },
        { icon: 'net', lbl: '网络请求', val: num(st?.request_count || 0), color: 'var(--src-network)', filter: 'network', ...d(st?.request_count || 0, ps?.request_count) },
        { icon: 'console', lbl: '控制台', val: num(st?.log_count || 0), color: 'var(--src-console)', filter: 'console', ...d(st?.log_count || 0, ps?.log_count) },
        { icon: 'err', lbl: '错误异常', val: num(st?.error_count || 0), color: 'var(--src-error)', danger: true, filter: 'error', ...d(st?.error_count || 0, ps?.error_count) },
        { icon: 'storage', lbl: 'Storage', val: num(st?.storage_change_count || 0), color: 'var(--src-storage)', filter: 'storage', ...d(st?.storage_change_count || 0, ps?.storage_change_count) },
        { icon: 'cookie', lbl: 'Cookie', val: num(st?.cookie_change_count || 0), color: 'var(--src-cookie)', filter: 'cookie', ...d(st?.cookie_change_count || 0, ps?.cookie_change_count) },
    ];
}

const DT_TABS: [string, string][] = [
    ['overview', '概览'], ['timeline', '时间线'], ['network', '网络'],
    ['console', '控制台'], ['evidence', '证据'], ['storage', '存储'], ['config', '本次配置'],
];

function render_detail(): string {
    const s = detail_session;
    const name = s ? session_name(s) : '采集详情';
    const showInsp = dt_tab === 'timeline' && dt_insp_open && dt_sel >= 0;
    return `<div class="page">
        <div class="dt-bc">
            <button class="back" data-back="1">${I.chevL} Capture All</button>
            <span class="sep">/</span><span class="crumb" data-back="1">采集记录</span>
            <span class="sep">/</span><span class="cur">${esc(name)}</span>
        </div>
        <div class="dt-head">
            <div class="dt-head-l">
                <div class="dt-title-row">
                    <h1>${esc(name)}</h1>
                    ${s ? `<span class="dt-id">${esc(s.capture_id)}</span>` : ''}
                    <span class="dt-state"><span class="dot"></span>${s?.status === 'capturing' ? '采集中' : '已结束'}</span>
                </div>
                <div class="dt-meta">
                    ${I.cal}<span class="mono">${esc(s ? format_system_time(s.started_at, user_config) : '')}</span>
                    <span class="mdot">·</span><span>时长 <span class="mono">${s ? session_dur(s) : '—'}</span></span>
                </div>
            </div>
            <div class="dt-head-r">
                <select id="dtExportFmt" style="padding:6px 8px;border-radius:8px;border:1px solid var(--border);background:var(--surface);margin-right:6px">
                    <option value="json">JSON</option><option value="jsonl">JSONL</option><option value="html">HTML</option><option value="har">HAR</option>
                </select>
                <button class="btn" data-dexport="1"><span>${I.export}</span>导出</button>
                <button class="btn" data-open-url="1"><span>${I.ext}</span>打开原页面</button>
            </div>
        </div>
        <div class="dt-metrics">
            ${detail_metrics().map((m) => `<button class="dt-metric${m.danger ? ' danger' : ''}" ${m.filter ? `data-mfilter="${m.filter}"` : ''}>
                <span class="dt-metric-top"><span class="dt-metric-ic" style="color:${m.color}">${I[m.icon]}</span><span class="dt-metric-lbl">${m.lbl}</span></span>
                <span class="dt-metric-row"><span class="dt-metric-val mono">${m.val}</span>${m.delta ? `<span class="dt-metric-delta t-${m.dTone}">${m.delta}</span>` : ''}</span>
            </button>`).join('')}
        </div>
        <nav class="dt-tabs">
            ${DT_TABS.map(([k, l]) => `<button data-tab="${k}" data-on="${dt_tab === k ? 1 : 0}">${l}</button>`).join('')}
        </nav>
        ${render_detail_tab(showInsp)}
    </div>`;
}

function render_detail_tab(showInsp: boolean): string {
    if (dt_tab === 'overview') return render_dt_overview();
    if (dt_tab === 'config') return render_dt_config();
    if (dt_tab === 'network') {
        const show_net_insp = dt_insp_open && dt_net_sel >= 0 && dt_net_sel < detail_network.length;
        return `<div class="dt-body" data-insp="${show_net_insp ? 1 : 0}"><div class="dt-list">${render_net_table()}</div>${show_net_insp ? render_net_inspector() : ''}</div>`;
    }
    if (dt_tab === 'console') return `<div class="dt-list" style="flex:1;min-height:0">${render_con_table()}</div>`;
    if (dt_tab === 'storage') return `<div class="simple-pad scroll">${render_simple_events(['storage_change', 'cookie_change'], ['时间', '类型', 'Key / 名称', '详情', '来源'])}</div>`;
    if (dt_tab === 'evidence') return `<div class="simple-pad scroll">${render_simple_events(['mouse_event', 'keyboard_event', 'scroll_event', 'input_event', 'dom_mutation'], ['时间', '类型', '事件', '详情', '来源'])}</div>`;
    // timeline
    return `<div class="dt-body" data-insp="${showInsp ? 1 : 0}">
        ${render_dt_rail()}
        ${render_dt_list()}
        ${showInsp ? render_dt_inspector() : ''}
    </div>`;
}

function render_dt_rail(): string {
    const counts: Record<string, number> = { all: detail_events.length };
    for (const e of detail_events) { const k = event_kind(e); counts[k] = (counts[k] || 0) + 1; }
    const quick: [string, string, string, string][] = [
        ['all', 'navCaptures', '全部', 'var(--ink-2)'],
        ['error', 'err', '错误', 'var(--src-error)'],
        ['user', 'ui', '用户操作', 'var(--src-user)'],
        ['network', 'net', '网络请求', 'var(--src-network)'],
        ['console', 'console', '控制台', 'var(--src-console)'],
        ['nav', 'nav', '页面导航', 'var(--src-nav)'],
        ['storage', 'storage', '存储', 'var(--src-storage)'],
        ['cookie', 'cookie', 'Cookie', 'var(--src-cookie)'],
        ['dom', 'dom', 'DOM', 'var(--src-dom)'],
    ];
    return `<aside class="dt-rail scroll">
        <div class="dt-rail-search">${I.search}<input placeholder="搜索事件、URL、Storage key…" id="dtSearch"><kbd>⌘K</kbd></div>
        <div class="dt-rail-sec">
            <div class="dt-rail-hd">快速筛选</div>
            ${quick.map(([k, ic, lbl, color]) => `<button class="qfilter" data-quick="${k}" data-on="${dt_quick === k ? 1 : 0}">
                <span class="qf-ic" style="color:${color}">${I[ic]}</span><span class="qf-lbl">${lbl}</span>
                <span class="qf-n">${num(counts[k === 'all' ? 'all' : k] || 0)}</span>
            </button>`).join('')}
        </div>
    </aside>`;
}

function filtered_events(): RecordEvent[] {
    let list = detail_events;
    if (dt_quick !== 'all') list = list.filter((e) => event_kind(e) === dt_quick);
    const q = (document.getElementById('dtSearch') as HTMLInputElement | null)?.value?.toLowerCase();
    if (q) list = list.filter((e) => (event_title(e) + ' ' + event_detail(e) + ' ' + e.type).toLowerCase().includes(q));
    return list;
}

function render_dt_list(): string {
    const list = filtered_events();
    const rows = list.map((e, i) => {
        const k = KIND[event_kind(e)];
        const isErr = event_kind(e) === 'error' || (e.type === 'console_event' && (e.data as Record<string, unknown>)?.level === 'error');
        const d = (e.data || {}) as Record<string, unknown>;
        const status = e.type === 'network_request' ? (d.status_code as number | undefined) : undefined;
        const detailCell = status != null
            ? `<span><span class="status-pill" data-ok="${status < 400 ? 1 : 0}">${status}</span><span class="ev-ms">${d.duration_ms != null ? Math.round(d.duration_ms as number) + 'ms' : ''}</span></span>`
            : `<span class="ev-detail" title="${esc(event_detail(e))}">${esc(event_detail(e))}</span>`;
        return `<tr data-ev="${i}" data-sel="${dt_sel === i ? 1 : 0}">
            <td><span class="ev-t">${rel_time(e.relative_time_ms)}</span></td>
            <td><span class="ev-type" style="color:${k.color}">${I[k.icon]} ${KIND_LABEL[event_kind(e)]}</span></td>
            <td><span class="ev-name${isErr ? ' err' : ''}">${esc(event_title(e))}</span></td>
            <td>${detailCell}</td>
            <td><span class="ev-src">${esc((e.data as Record<string, unknown>)?.source || e.source || '—')}</span></td>
        </tr>`;
    }).join('');
    const empty = `<tr><td colspan="5" style="text-align:center;color:var(--ink-4);padding:36px">暂无事件</td></tr>`;
    return `<div class="dt-list">
        <div class="dt-list-bar">
            <h2>时间线 <span class="cnt mono">（${num(list.length)} 个事件）</span></h2>
            <div class="spacer"></div>
            <div class="viewtog">
                <button data-view="list" data-on="${dt_view === 'list' ? 1 : 0}">${I.list} 列表视图</button>
                <button data-view="trace" data-on="${dt_view === 'trace' ? 1 : 0}">${I.trace} 轨道视图</button>
            </div>
        </div>
        ${dt_view === 'trace'
            ? `<div class="dt-events">${render_trace()}</div>`
            : `<div class="dt-events scroll"><table class="dt-ev-table"><thead><tr><th>时间</th><th>类型</th><th>事件</th><th>详情</th><th>来源</th></tr></thead><tbody>${rows || empty}</tbody></table></div>`}
    </div>`;
}

function fmt_axis(ms: number): string {
    const t = Math.floor(ms / 1000);
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function render_trace(): string {
    const lanes: [string, string, string][] = [
        ['network', 'net', 'Network / 网络'], ['user', 'ui', 'UI Events / 界面事件'],
        ['console', 'console', 'Console / 控制台'], ['dom', 'dom', 'DOM 变更'],
        ['storage', 'storage', 'Storage / 存储'], ['nav', 'nav', 'Navigation / 导航'],
        ['error', 'err', 'Errors / 错误'],
    ];
    const maxT = detail_events.reduce((a, e) => Math.max(a, e.relative_time_ms), 1);
    const TICKN = 8;
    const ticks = Array.from({ length: TICKN }, (_, i) => fmt_axis((maxT * i) / (TICKN - 1)));
    const playMs = (dt_play / 100) * maxT;
    const lanesHtml = lanes.map(([k, ic, label]) => {
        const evs = detail_events.filter((e) => event_kind(e) === k);
        const color = KIND[k].color;
        const marks = evs.map((e) => {
            const left = (e.relative_time_ms / maxT) * 100;
            if (k === 'error') return `<span class="tl-diamond" style="left:${left}%"></span>`;
            if (k === 'console') return `<span class="tl-dot" style="left:${left}%;background:${color}"></span>`;
            if (k === 'nav') return `<span class="tl-tick" style="left:${left}%;height:80%;background:${color}"></span>`;
            return `<span class="tl-tick" style="left:${left}%;height:70%;background:${color}"></span>`;
        }).join('');
        return `<div class="tl-lane"><div class="tl-lane-hd"><span class="tl-lane-ic" style="color:${color}">${I[ic]}</span><span class="tl-lane-name">${label}</span><span class="tl-lane-count mono">${evs.length}</span></div><div class="tl-lane-track">${marks}</div></div>`;
    }).join('');
    return `<div class="tl">
        <div class="tl-toolbar">
            <div class="tl-zoom"><span>缩放</span><input type="range" min="0" max="100" value="50" id="tlZoom"></div>
            <span class="tl-playtime mono" id="tlPlaytime">${fmt_axis(playMs)}</span>
        </div>
        <div class="tl-grid">
            <div class="tl-axis">${ticks.map((t, i) => `<span class="mono" style="left:${(i / (TICKN - 1)) * 100}%">${t}</span>`).join('')}</div>
            <div class="tl-lanes" id="tlLanes">
                <div class="tl-playhead" id="tlPlayhead" style="left:${dt_play}%"><span class="tl-playhead-lbl mono">${fmt_axis(playMs)}</span></div>
                ${lanesHtml}
            </div>
            <div class="tl-minimap">
                <span class="mono tl-mm-edge">00:00</span>
                <div class="tl-mm-track"><div class="tl-mm-window" style="left:${Math.max(0, dt_play - 22)}%;width:44%"></div></div>
                <span class="mono tl-mm-edge">${fmt_axis(maxT)}</span>
            </div>
        </div>
    </div>`;
}

function render_dt_inspector(): string {
    const e = filtered_events()[dt_sel];
    if (!e) return '';
    const d = (e.data || {}) as Record<string, unknown>;
    const k = event_kind(e);
    const fields: [string, string][] = [
        ['类型', KIND_LABEL[k] + ' · ' + e.type],
        ['时间', rel_time(e.relative_time_ms)],
        ['绝对时间', format_system_time(e.absolute_time, user_config)],
        ['来源', String(d.source || e.source || '—')],
    ];
    if (e.type === 'network_request') {
        fields.push(['方法', String(d.method || '')], ['状态', String(d.status_code || '')], ['URL', String(d.url || '')], ['耗时', d.duration_ms != null ? Math.round(d.duration_ms as number) + ' ms' : '—']);
    } else {
        fields.push(['详情', event_detail(e)]);
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

function render_net_table(): string {
    const rows = detail_network.map((r) => {
        const err = (r.status_code || 0) >= 400;
        return `<div class="net-row${err ? ' err' : ''}">
            <span class="mono dim">${esc((r as unknown as Record<string, unknown>).timestamp || '')}</span>
            <span class="mono"><span class="method-sm" data-m="${esc(r.method)}">${esc(r.method)}</span></span>
            <span class="mono url-cell" title="${esc(r.url)}">${esc(r.url)}</span>
            <span class="mono" style="color:${err ? 'var(--red-ink)' : 'var(--green-ink)'}">${esc(r.status_code)}</span>
            <span class="mono dim">${esc(r.resource_type)}</span>
            <span class="mono">${r.duration_ms != null ? Math.round(r.duration_ms) + ' ms' : '—'}</span>
        </div>`;
    }).join('');
    const empty = `<div style="text-align:center;color:var(--ink-4);padding:36px">暂无网络请求</div>`;
    return `<div class="dt-events"><div class="net"><div class="net-table scroll">
        <div class="net-row net-head mono" style="grid-template-columns:130px 64px minmax(220px,1fr) 60px 90px 84px">
            <span>时间</span><span>方法</span><span>URL</span><span>状态</span><span>类型</span><span>耗时</span>
        </div>
        ${detail_network.length ? detail_network.map((r, idx) => {
        const err = (r.status_code || 0) >= 400;
        return `<div class="net-row${err ? ' err' : ''}" style="grid-template-columns:130px 64px minmax(220px,1fr) 60px 90px 84px" data-netidx="${idx}" data-sel="${dt_net_sel === idx ? 1 : 0}">
            <span class="mono dim">${esc((r as unknown as Record<string, unknown>).timestamp || rel_time(0))}</span>
            <span class="mono"><span class="method-sm" data-m="${esc(r.method)}">${esc(r.method)}</span></span>
            <span class="mono url-cell" title="${esc(r.url)}">${esc(r.url)}</span>
            <span class="mono" style="color:${err ? 'var(--red-ink)' : 'var(--green-ink)'}">${esc(r.status_code)}</span>
            <span class="mono dim">${esc(r.resource_type)}</span>
            <span class="mono">${r.duration_ms != null ? Math.round(r.duration_ms) + ' ms' : '—'}</span>
        </div>`;
    }).join('') : empty}
    </div></div></div>` + (rows ? '' : '');
}

function render_net_inspector(): string {
    const req = detail_network[dt_net_sel];
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
            <div class="ov-panel-hd">基本信息</div>
            <div class="dti-grid c2" style="margin-top:4px">
                <div class="dti-field"><span class="k">方法</span><span class="v mono">${esc(req.method)}</span></div>
                <div class="dti-field"><span class="k">状态码</span><span class="v mono" style="color:${err ? 'var(--red-ink)' : 'var(--green-ink)'}">${esc(req.status_code)} ${esc(req.status_text || '')}</span></div>
                <div class="dti-field"><span class="k">资源类型</span><span class="v mono">${esc(req.resource_type)}</span></div>
                <div class="dti-field"><span class="k">耗时</span><span class="v mono">${req.duration_ms != null ? Math.round(req.duration_ms) + ' ms' : '—'}</span></div>
                <div class="dti-field"><span class="k">协议</span><span class="v mono">${esc(req.protocol || '—')}</span></div>
                <div class="dti-field"><span class="k">MIME</span><span class="v mono">${esc(req.mime_type || '—')}</span></div>
                <div class="dti-field"><span class="k">缓存</span><span class="v mono">${req.from_cache ? 'from ' + (req.cache_status || 'cache') : 'no cache'}</span></div>
                <div class="dti-field"><span class="k">采集方式</span><span class="v mono">${esc(req.capture_method || '—')}</span></div>
            </div>
            <div class="dti-field span2" style="margin-top:4px"><span class="k">URL</span><span class="v mono" style="word-break:break-all">${esc(req.url)}</span></div>
            ${req.error_text ? `<div class="dti-field span2"><span class="k">错误</span><span class="v mono" style="color:var(--red-ink)">${esc(req.error_text)}</span></div>` : ''}
            <div class="ov-panel-hd" style="margin-top:12px">请求头</div>
            <div class="dti-related" style="margin-top:4px">${req_hdrs}</div>
            <div class="ov-panel-hd" style="margin-top:12px">响应头</div>
            <div class="dti-related" style="margin-top:4px">${res_hdrs}</div>
            <div class="ov-panel-hd" style="margin-top:12px">请求体</div>
            <div style="margin-top:4px">${req_body}</div>
            <div class="ov-panel-hd" style="margin-top:12px">响应体 <span style="font-weight:400;font-size:11px;color:var(--ink-3)">${req.response_body_status || ''}</span></div>
            <div style="margin-top:4px">${res_body}</div>
        </div>
    </aside>`;
}

function render_con_table(): string {
    const empty = `<div style="text-align:center;color:var(--ink-4);padding:36px">暂无控制台日志</div>`;
    return `<div class="dt-events"><div class="con"><div class="con-table scroll">
        <div class="con-row con-head mono"><span>时间</span><span>级别</span><span>消息</span><span>来源</span><span>行</span></div>
        ${detail_console.length ? detail_console.map((l) => `<div class="con-row${l.level === 'error' ? ' err' : ''}">
            <span class="mono dim">${esc((l as unknown as Record<string, unknown>).timestamp || '')}</span>
            <span><span class="lvl-tag" data-lvl="${esc(l.level)}">${esc(l.level)}</span></span>
            <span class="con-msg" style="${l.level === 'error' ? 'color:var(--red-ink)' : ''}">${esc((l.args_preview || []).join(' '))}</span>
            <span class="mono dim">${esc(l.source_url || '')}</span>
            <span class="mono dim">${esc(l.line ?? '')}</span>
        </div>`).join('') : empty}
    </div></div></div>`;
}

function render_simple_events(types: string[], headers: string[]): string {
    const list = detail_events.filter((e) => types.includes(e.type));
    const tpl = '110px 110px 1fr 1fr 90px';
    const empty = `<div style="text-align:center;color:var(--ink-4);padding:36px">暂无数据</div>`;
    return `<div class="net" style="padding:0"><div class="net-table scroll" style="border-top:0">
        <div class="con-row con-head mono" style="grid-template-columns:${tpl}">${headers.map((h) => `<span>${h}</span>`).join('')}</div>
        ${list.length ? list.map((e) => `<div class="con-row" style="grid-template-columns:${tpl}">
            <span class="mono">${rel_time(e.relative_time_ms)}</span>
            <span class="mono dim">${KIND_LABEL[event_kind(e)]}</span>
            <span class="mono dim">${esc(event_title(e))}</span>
            <span class="mono dim">${esc(event_detail(e))}</span>
            <span class="mono dim">${esc((e.data as Record<string, unknown>)?.source || e.source || '—')}</span>
        </div>`).join('') : empty}
    </div></div>`;
}

function render_dt_overview(): string {
    const st = detail_session?.stats;
    return `<div class="simple-pad scroll">
        <div class="ov-2col" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px">
            <div class="ov-panel">
                <div class="ov-panel-hd">本次采集摘要</div>
                <div class="dti-grid c3" style="padding:6px 0 12px">
                    <div class="dti-field"><span class="k">时长</span><span class="v mono">${detail_session ? session_dur(detail_session) : '—'}</span></div>
                    <div class="dti-field"><span class="k">事件总数</span><span class="v mono">${num(st?.event_count || detail_events.length)}</span></div>
                    <div class="dti-field"><span class="k">错误总数</span><span class="v red mono">${num(st?.error_count || 0)}</span></div>
                </div>
                <div class="ov-panel-hd" style="margin-top:6px">七标签概览</div>
                <div class="dti-related" style="margin-top:4px">
                    ${[
                        { label: '用户行为', val: num(st?.event_count || 0), color: 'var(--src-user)', icon: 'ui' },
                        { label: '页面导航', val: num(st?.nav_count || 0), color: 'var(--src-nav)', icon: 'nav' },
                        { label: '网络请求', val: num(st?.request_count || 0), color: 'var(--src-network)', icon: 'net' },
                        { label: '控制台', val: num(st?.log_count || 0), color: 'var(--src-console)', icon: 'console' },
                        { label: '错误异常', val: num(st?.error_count || 0), color: 'var(--src-error)', icon: 'err' },
                        { label: 'Storage', val: num(st?.storage_change_count || 0), color: 'var(--src-storage)', icon: 'storage' },
                        { label: 'Cookie', val: num(st?.cookie_change_count || 0), color: 'var(--src-cookie)', icon: 'cookie' },
                    ].map((m) => `<div class="rel-row" style="cursor:default"><span class="rel-t mono">${m.val}</span><span class="rel-ic" style="color:${m.color}">${I[m.icon]}</span><span class="rel-ev">${m.label}</span></div>`).join('')}
                </div>
            </div>
            <div class="ov-panel">
                <div class="ov-panel-hd">关键时间线</div>
                <div class="dti-related" style="margin-top:4px">
                    ${detail_events.slice(0, 8).map((e) => { const k = KIND[event_kind(e)]; return `<div class="rel-row" style="cursor:default"><span class="rel-t">${rel_time(e.relative_time_ms)}</span><span class="rel-ic" style="color:${k.color}">${I[k.icon]}</span><span class="rel-ev">${esc(event_title(e))}</span></div>`; }).join('') || '<span style="color:var(--ink-4);font-size:12px">暂无事件</span>'}
                </div>
            </div>
        </div>
    </div>`;
}

function render_dt_config(): string {
    const cfg = (detail_session?.config_snapshot || {}) as Record<string, unknown>;
    const item = (l: string, on: boolean) => `<div class="dt-toggle" style="padding:8px 0"><span class="tg-lbl">${l}</span><span class="switch" data-on="${on ? 1 : 0}"><span class="knob"></span></span></div>`;
    return `<div class="simple-pad scroll" style="max-width:620px">
        <p style="font-size:12.5px;color:var(--ink-3);margin:14px 0 0">本次采集使用的配置（只读快照）。如需修改默认值，请前往 <span class="lnk" data-nav-settings="1">设置 → 采集默认值</span>。</p>
        <div class="ov-panel" style="margin-top:14px">
            <div class="ov-panel-hd">采集模块</div>
            ${item('用户行为', cfg.event_count_enabled !== false)}
            ${item('页面导航', cfg.nav_count_enabled !== false)}
            ${item('网络请求', cfg.capture_network !== false)}
            ${item('控制台', cfg.capture_console !== false)}
            ${item('错误异常', cfg.error_count_enabled !== false)}
            ${item('Storage', cfg.storage_change_count_enabled !== false)}
            ${item('Cookie', cfg.cookie_change_count_enabled !== false)}
        </div>
        <div class="ov-panel" style="margin-top:14px">
            <div class="ov-panel-hd">采集选项</div>
            ${item('请求体采集', !!cfg.capture_request_body)}
            ${item('响应体采集', !!cfg.capture_response_body)}
            ${item('输入值', !!cfg.capture_input_values)}
        </div>
        <div class="ov-panel" style="margin-top:14px">
            <div class="ov-panel-hd">隐私与脱敏</div>
            ${item('脱敏敏感数据', !!cfg.redact_data)}
        </div>
    </div>`;
}

function wire_detail(): void {
    const c = document.getElementById('content')!;
    c.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => go('captures')));
    c.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { dt_tab = (b as HTMLElement).dataset.tab!; render_content(); }));
    c.querySelectorAll('[data-mfilter]').forEach((b) => b.addEventListener('click', () => { dt_tab = 'timeline'; dt_quick = (b as HTMLElement).dataset.mfilter!; render_content(); }));
    c.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => { dt_quick = (b as HTMLElement).dataset.quick!; render_content(); }));
    c.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { dt_view = (b as HTMLElement).dataset.view as 'list' | 'trace'; render_content(); }));
    c.querySelectorAll('tr[data-ev]').forEach((tr) => tr.addEventListener('click', () => { dt_sel = Number((tr as HTMLElement).dataset.ev); dt_insp_open = true; render_content(); }));
    c.querySelector('[data-insp-close]')?.addEventListener('click', () => { dt_insp_open = false; render_content(); });
    c.querySelector('#dtSearch')?.addEventListener('input', () => render_content());
    c.querySelector('[data-dexport]')?.addEventListener('click', () => {
        const fmt = (c.querySelector('#dtExportFmt') as HTMLSelectElement)?.value || 'json';
        detail_session && export_session(detail_session.capture_id, fmt);
    });
    c.querySelector('[data-open-url]')?.addEventListener('click', () => { const u = detail_session?.start_url; if (u) chrome.tabs.create({ url: u }); });
    c.querySelector('[data-nav-settings]')?.addEventListener('click', () => go('settings'));
    // Network row click → open detail inspector
    c.querySelectorAll('[data-netidx]').forEach((row) => row.addEventListener('click', () => {
        dt_net_sel = Number((row as HTMLElement).dataset.netidx);
        dt_insp_open = true;
        render_content();
    }));
    c.querySelector('[data-net-insp-close]')?.addEventListener('click', () => { dt_insp_open = false; dt_net_sel = -1; render_content(); });
    wire_trace();
}

function wire_trace(): void {
    const lanes = document.getElementById('tlLanes');
    const head = document.getElementById('tlPlayhead');
    const lbl = head?.querySelector('.tl-playhead-lbl') as HTMLElement | null;
    const time = document.getElementById('tlPlaytime');
    if (!lanes || !head) return;
    const maxT = detail_events.reduce((a, e) => Math.max(a, e.relative_time_ms), 1);
    const seek = (clientX: number) => {
        const r = lanes.getBoundingClientRect();
        const p = Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100));
        dt_play = p;
        head.style.left = `${p}%`;
        const txt = fmt_axis((p / 100) * maxT);
        if (lbl) lbl.textContent = txt;
        if (time) time.textContent = txt;
    };
    lanes.addEventListener('pointerdown', (e) => {
        seek((e as PointerEvent).clientX);
        const mv = (ev: PointerEvent) => seek(ev.clientX);
        const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', mv);
        window.addEventListener('pointerup', up);
    });
}

// ── settings page (real config) ─────────────────────────────────────────
function seg(name: string, opts: [string, string][], val: string): string {
    return `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button data-val="${v}" data-on="${val === v ? 1 : 0}">${l}</button>`).join('')}</div>`;
}
function sw(name: string, on: boolean, sm = false): string {
    return `<span class="switch${sm ? ' sm' : ''}" data-sw="${name}" data-on="${on ? 1 : 0}"><span class="knob"></span></span>`;
}

function render_settings(): string {
    const cfg = user_config;
    const SET_NAV: [string, string, string][] = [
        ['general', '通用', 'navSettings'], ['defaults', '采集默认值', 'navCurrent'],
        ['privacy', '隐私与脱敏', 'err'], ['export', '导出', 'navExport'],
        ['diagnostics', '诊断日志', 'console'], ['integrations', '集成', 'navMcp'],
    ];
    return `<div class="page">
        <div class="pg-head">
            <div class="pg-title"><h1>设置</h1><p>管理 Capture All 的全局偏好、采集默认值、隐私策略、导出规则和集成能力。</p></div>
        </div>
        <div class="set-body">
            <nav class="set-subnav scroll">
                ${SET_NAV.map(([k, l, ic], i) => `<button class="set-navitem" data-setnav="set-${k}" data-on="${i === 0 ? 1 : 0}">${I[ic]}${l}</button>`).join('')}
            </nav>
            <div class="set-scroll scroll">
                <section class="set-section" id="set-general">
                    <h2>通用</h2>
                    <div class="set-card"><div class="set-grid">
                        <div class="field"><span class="field-lbl">语言</span>
                            <select class="input" data-cfg="locale"><option value="zh" ${cfg.locale === 'zh' ? 'selected' : ''}>简体中文</option><option value="en" ${cfg.locale === 'en' ? 'selected' : ''}>English</option></select>
                        </div>
                        <div class="field"><span class="field-lbl">主题</span>${seg('theme', [['follow-system', '跟随系统'], ['light', '浅色'], ['dark', '深色']], cfg.theme)}</div>
                        <div class="field"><span class="field-lbl">时间显示</span>${seg('detail_time_display_mode', [['relative', '相对时间'], ['system', '系统时间']], cfg.detail_time_display_mode)}</div>
                        <div class="field"><span class="field-lbl">系统时区</span>
                            <select class="input" data-cfg="system_time_timezone"><option value="browser" ${cfg.system_time_timezone === 'browser' ? 'selected' : ''}>跟随浏览器</option><option value="UTC" ${cfg.system_time_timezone === 'UTC' ? 'selected' : ''}>UTC</option><option value="Asia/Shanghai" ${cfg.system_time_timezone === 'Asia/Shanghai' ? 'selected' : ''}>Asia/Shanghai</option></select>
                        </div>
                    </div></div>
                </section>
                <section class="set-section" id="set-defaults">
                    <h2>采集默认值</h2>
                    <div class="set-card">
                        <div class="set-grid c3">
                            <div class="field"><span class="field-lbl">捕获请求体</span>${sw('capture_request_body', cfg.capture_request_body)}</div>
                            <div class="field"><span class="field-lbl">捕获响应体</span>${sw('capture_response_body', cfg.capture_response_body)}</div>
                            <div class="field"><span class="field-lbl">捕获输入值</span>${sw('capture_input_values', cfg.capture_input_values)}</div>
                        </div>
                    </div>
                </section>
                <section class="set-section" id="set-privacy">
                    <div class="set-subhead"><h2>隐私与脱敏</h2>${sw('redact_data', cfg.redact_data)}</div>
                    <div class="set-card"><div class="set-grid">
                        <div class="field"><span class="field-lbl">脱敏敏感数据</span><span style="font-size:12px;color:var(--ink-3)">遮蔽密码、令牌，截断长文本</span></div>
                    </div></div>
                </section>
                <section class="set-section" id="set-export">
                    <h2>导出</h2>
                    <div class="set-card"><div class="set-grid">
                        <div class="field span2"><span class="field-lbl">文件名模板</span><input class="input mono" data-cfg="export_filename_template" value="${esc(cfg.export_filename_template)}"></div>
                        <div class="field span2"><span class="field-lbl">导出目录</span><input class="input mono" data-cfg="export_directory" value="${esc(cfg.export_directory)}" placeholder="capture-all/exports"></div>
                        <div class="field"><span class="field-lbl">每次询问保存位置</span>${sw('export_save_as', cfg.export_save_as)}</div>
                    </div></div>
                </section>
                <section class="set-section" id="set-diagnostics">
                    <h2>诊断日志</h2>
                    <div class="set-card"><div class="set-grid">
                        <div class="field"><span class="field-lbl">日志级别</span>${seg('log_level', [['debug', 'debug'], ['info', 'info'], ['warn', 'warn'], ['error', 'error'], ['silent', 'silent']], cfg.log_level)}</div>
                        <div class="field"><span class="field-lbl">最大储存条数</span><input class="input mono" type="number" data-cfg="log_max_entries" value="${esc(String(cfg.log_max_entries))}" min="100" max="100000" step="100"><span style="font-size:12px;color:var(--ink-3)">超出后自动删除最旧记录</span></div>
                        <div class="field"><span class="field-lbl">当前日志数</span><span id="logCount" class="mono" style="font-weight:600">—</span></div>
                        <div class="field span2" style="display:flex;gap:8px">
                            <button class="btn sm" id="exportLogJson"><span>${I.export}</span>导出 JSON</button>
                            <button class="btn sm" id="exportLogJsonl"><span>${I.export}</span>导出 JSONL</button>
                            <button class="btn sm danger" id="clearLogs"><span>${I.trash}</span>清除所有日志</button>
                        </div>
                    </div></div>
                </section>
                <section class="set-section" id="set-integrations" style="margin-bottom:8px">
                    <h2>集成 · MCP Bridge</h2>
                    <div class="set-card"><div class="set-grid">
                        <div class="field"><span class="field-lbl">启用 MCP bridge</span>${sw('agent_bridge_enabled', cfg.agent_bridge_enabled)}</div>
                        <div class="field span2"><span class="field-lbl">Bridge URL</span><input class="input mono" data-cfg="agent_bridge_url" value="${esc(cfg.agent_bridge_url)}" placeholder="http://127.0.0.1:17831"></div>
                        <div class="field span2"><span class="field-lbl">Bridge Token</span><input class="input mono" type="password" data-cfg="agent_bridge_token" value="${esc(cfg.agent_bridge_token)}"></div>
                        <div class="field"><span class="field-lbl">轮询间隔 (ms)</span><input class="input mono" type="number" data-cfg="agent_bridge_poll_interval_ms" value="${esc(cfg.agent_bridge_poll_interval_ms)}"></div>
                        <div class="field span2"><span class="field-lbl error-text" id="bridgeErr" style="display:none;color:var(--red-ink)"></span></div>
                    </div></div>
                </section>
            </div>
        </div>
        <div class="set-footer"><span class="info">${I.agent} 更改即时保存</span></div>
    </div>`;
}

async function persist(patch: Partial<UserConfig>): Promise<void> {
    user_config = { ...user_config, ...patch };
    if (is_extension) await save_user_config(patch);
}
async function persist_bridge(): Promise<void> {
    const c = document.getElementById('content')!;
    const errEl = c.querySelector('#bridgeErr') as HTMLElement | null;
    try {
        const patch = normalize_agent_bridge_config({
            agent_bridge_enabled: (c.querySelector('[data-sw="agent_bridge_enabled"]') as HTMLElement)?.dataset.on === '1',
            agent_bridge_url: (c.querySelector('[data-cfg="agent_bridge_url"]') as HTMLInputElement)?.value || '',
            agent_bridge_token: (c.querySelector('[data-cfg="agent_bridge_token"]') as HTMLInputElement)?.value || '',
            agent_bridge_poll_interval_ms: Number((c.querySelector('[data-cfg="agent_bridge_poll_interval_ms"]') as HTMLInputElement)?.value),
        });
        await persist(patch);
        if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
    } catch (e) {
        await persist({ agent_bridge_enabled: false });
        const swEl = c.querySelector('[data-sw="agent_bridge_enabled"]') as HTMLElement | null;
        if (swEl) swEl.dataset.on = '0';
        if (errEl) { errEl.textContent = e instanceof Error ? e.message : String(e); errEl.style.display = 'block'; }
    }
}

function wire_settings(): void {
    const c = document.getElementById('content')!;
    c.querySelectorAll('[data-setnav]').forEach((b) => b.addEventListener('click', () => {
        c.querySelectorAll('[data-setnav]').forEach((x) => (x as HTMLElement).dataset.on = '0');
        (b as HTMLElement).dataset.on = '1';
        document.getElementById((b as HTMLElement).dataset.setnav!)?.scrollIntoView({ block: 'start' });
    }));
    // segmented controls
    c.querySelectorAll('[data-seg]').forEach((s) => {
        const name = (s as HTMLElement).dataset.seg!;
        s.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', async () => {
            const val = (btn as HTMLElement).dataset.val!;
            s.querySelectorAll('button').forEach((x) => (x as HTMLElement).dataset.on = '0');
            (btn as HTMLElement).dataset.on = '1';
            if (name === 'theme') { await set_theme(val as ThemeMode); await persist({ theme: val as ThemeMode }); }
            else if (name === 'log_level') {
                Logger.set_level(val as 'debug' | 'info' | 'warn' | 'error' | 'silent');
                await persist({ log_level: val as 'debug' | 'info' | 'warn' | 'error' | 'silent' });
                chrome.runtime.sendMessage({ action: 'set_log_level', level: val }).catch(() => {});
            }
            else await persist({ [name]: val } as Partial<UserConfig>);
        }));
    });
    // switches
    c.querySelectorAll('[data-sw]').forEach((el) => el.addEventListener('click', async () => {
        const name = (el as HTMLElement).dataset.sw!;
        const on = (el as HTMLElement).dataset.on !== '1';
        (el as HTMLElement).dataset.on = on ? '1' : '0';
        if (name.startsWith('agent_bridge')) await persist_bridge();
        else await persist({ [name]: on } as Partial<UserConfig>);
    }));
    // selects + inputs
    c.querySelectorAll('[data-cfg]').forEach((el) => {
        const name = (el as HTMLElement).dataset.cfg!;
        el.addEventListener('change', async () => {
            const v = (el as HTMLInputElement).value;
            if (name === 'locale') { set_locale(v as Locale); await persist({ locale: v as Locale }); }
            else if (name.startsWith('agent_bridge')) await persist_bridge();
            else if (name === 'agent_bridge_poll_interval_ms') await persist({ [name]: Number(v) } as Partial<UserConfig>);
            else if (name === 'log_max_entries') await persist({ [name]: Number(v) } as Partial<UserConfig>);
            else await persist({ [name]: v } as Partial<UserConfig>);
        });
    });
    wire_diagnostics_settings(c);
}

async function wire_diagnostics_settings(c: HTMLElement): Promise<void> {
    // Load current log count
    const update_count = async () => {
        const el = c.querySelector('#logCount');
        if (!el) return;
        try {
            const r = await chrome.runtime.sendMessage({ action: 'get_app_log_count' });
            el.textContent = r?.count != null ? `${r.count.toLocaleString('en-US')} 条` : '—';
        } catch {
            el.textContent = '—';
        }
    };
    update_count();

    // Export JSON
    c.querySelector('#exportLogJson')?.addEventListener('click', async () => {
        try {
            const r = await chrome.runtime.sendMessage({ action: 'export_app_logs', options: { format: 'json' } });
            if (!r?.success) { alert('导出失败'); return; }
            const blob = new Blob([r.data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `capture_all_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
        } catch (e) { logger.error('Export logs error', e); }
    });

    // Export JSONL
    c.querySelector('#exportLogJsonl')?.addEventListener('click', async () => {
        try {
            const r = await chrome.runtime.sendMessage({ action: 'export_app_logs', options: { format: 'jsonl' } });
            if (!r?.success) { alert('导出失败'); return; }
            const blob = new Blob([r.data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `capture_all_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
        } catch (e) { logger.error('Export JSONL error', e); }
    });

    // Clear logs
    c.querySelector('#clearLogs')?.addEventListener('click', async () => {
        if (!confirm('确定清空所有诊断日志？此操作不可撤销。')) return;
        try {
            await chrome.runtime.sendMessage({ action: 'clear_app_logs' });
            update_count();
        } catch (e) { logger.error('Clear logs error', e); }
    });
}

// ── current / exports / integrations ────────────────────────────────────
function render_current(): string {
    const live = sessions.filter((s) => s.status === 'capturing');
    const rows = live.map((s) => `<div class="exp-task" data-open="${esc(s.capture_id)}" style="cursor:pointer">
        <span class="et-ic" style="color:var(--blue-ink)">${I.navCurrent}</span>
        <div class="et-main"><b>${esc(session_name(s))}</b><div class="et-sub">${esc(strip_proto(s.start_url))} · ${num(s.stats?.event_count || 0)} 事件 · ${num(s.stats?.request_count || 0)} 请求</div></div>
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
    const rows = sessions.map((s) => `<div class="exp-task">
        <span class="et-ic">${I.navExport}</span>
        <div class="et-main"><b>${esc(session_name(s))}</b><div class="et-sub">${num(s.stats?.event_count || 0)} 事件 · ${session_dur(s)}</div></div>
        <button class="btn sm" data-export="${esc(s.capture_id)}"><span>${I.export}</span>导出</button>
    </div>`).join('');
    return `<div class="page">
        <div class="pg-head"><div class="pg-title"><h1>导出任务</h1><p>选择采集记录导出。已就绪 ${num(sessions.length)} 条。</p></div></div>
        <div class="simple-pad scroll">${sessions.length ? rows : '<div style="text-align:center;color:var(--ink-4);padding:48px">暂无采集记录</div>'}</div>
    </div>`;
}

function render_integrations(): string {
    const on = user_config.agent_bridge_enabled;
    const cards: [string, string, string, boolean, string][] = [
        ['MCP Bridge', 'navMcp', '连接本地 MCP 服务，向 Agent 暴露采集数据', on, on ? '已连接' : '配置'],
        ['本地 Agent', 'navCurrent', '连接本地 Agent 以分析与回答问题', on, '配置'],
        ['Webhook', 'navExport', '采集结束后向自定义地址推送事件', false, '连接'],
        ['Issue 平台', 'err', '把失败请求与错误同步为 Issue', false, '连接'],
    ];
    return `<div class="page">
        <div class="pg-head"><div class="pg-title"><h1>MCP / 集成</h1><p>连接本地 Agent、MCP 服务与外部平台，把采集数据接入你的工作流。</p></div>
            <div class="pg-actions"><button class="btn" data-setnav-go="1"><span>${I.navSettings}</span>前往设置</button></div></div>
        <div class="simple-pad scroll"><div class="integrations" style="margin-top:14px">
            ${cards.map(([name, ic, desc, conn, btn]) => `<div class="integ-card">
                <div class="integ-top"><span class="integ-ic">${I[ic]}</span>
                    <div class="integ-meta"><b>${name}</b><span>${desc}</span></div>
                    <span class="integ-state" data-on="${conn ? 1 : 0}">${conn ? '已连接' : '未连接'}</span></div>
                <button class="btn sm" style="justify-content:center">${btn}</button>
            </div>`).join('')}
        </div></div>
    </div>`;
}

// ── init ────────────────────────────────────────────────────────────────
async function init(): Promise<void> {
    if (is_extension) {
        await init_locale();
        await init_theme();
        user_config = await load_user_config();
        await load_sessions();
    }
    const params = new URLSearchParams(location.search);
    const sid = params.get('session');
    const p = params.get('page');
    if (sid && (p === 'detail' || !p)) {
        await open_detail(sid);
    } else {
        if (p) page = p;
        render_shell();
    }
    // Auto-refresh: poll for capture state changes every 2s
    setInterval(async () => {
        if (!is_extension) return;
        const prev_state = sessions.map(s => `${s.capture_id}:${s.status}`);
        await load_sessions();
        const cur_state = sessions.map(s => `${s.capture_id}:${s.status}`);
        const sessions_changed = prev_state.join(',') !== cur_state.join(',');
        if (sessions_changed) {
            if (page === 'captures' || page === 'current' || page === 'exports') {
                render_content();
            }
        }
        // 实时详情页自动刷新：采集中每 2s 更新数据
        if (page === 'detail' && detail_session?.status === 'capturing') {
            await load_detail(detail_session.capture_id);
            render_content();
        }
    }, 2000);
}

document.addEventListener('DOMContentLoaded', init);
