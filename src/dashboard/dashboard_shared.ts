// dashboard/dashboard_shared.ts — 共享工具函数和常量
import type { CaptureRecord, CaptureEvent, NetworkRequestData, ConsoleEventData, UserConfig } from '../shared/types';
import { escape_html as esc } from '../shared/escape';
import { format_system_time } from '../shared/system_time';
import { download_blob, build_capture_filename } from '../shared/export_utils';
import { build_archive } from '../shared/archive_builder';
import { read_capture_snapshot } from '../shared/capture_data_reader';
import { Logger } from '../shared/logger';
import { get_app_log_transport } from '../background/app_log_storage';
import { I } from './icons';

export const logger = new Logger('dashboard', get_app_log_transport());

export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
    let t: ReturnType<typeof setTimeout> | undefined;
    return ((...args: unknown[]) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }) as T;
}

export const is_extension = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

// ── 共享状态（由 dashboard.ts 声明，模块通过 get/set 访问） ──────────────
let _user_config: UserConfig;
let _captures: CaptureRecord[] = [];
let _page = 'captures';
let _selected = new Set<string>();
let _detail_capture: CaptureRecord | null = null;
let _detail_events: CaptureEvent[] = [];
let _detail_network: NetworkRequestData[] = [];
let _detail_console: ConsoleEventData[] = [];
let _dt_tab = 'timeline';
let _dt_view: 'list' | 'trace' = 'list';
let _dt_quick = 'all';
let _dt_sel = -1;
let _dt_insp_open = false;
let _dt_play = 49.5;
let _dt_net_sel = -1;
let _dt_net_insp_closed = false;

// state accessors
export const get_user_config = () => _user_config;
export const set_user_config = (v: UserConfig) => { _user_config = v; };
export const get_captures = () => _captures;
export const set_captures = (v: CaptureRecord[]) => { _captures = v; };
export const get_page = () => _page;
export const set_page = (v: string) => { _page = v; };
export const get_selected = () => _selected;
export const set_selected = (v: Set<string>) => { _selected = v; };
export const get_detail_capture = () => _detail_capture;
export const set_detail_capture = (v: CaptureRecord | null) => { _detail_capture = v; };
export const get_detail_events = () => _detail_events;
export const set_detail_events = (v: CaptureEvent[]) => { _detail_events = v; };
export const get_detail_network = () => _detail_network;
export const set_detail_network = (v: NetworkRequestData[]) => { _detail_network = v; };
export const get_detail_console = () => _detail_console;
export const set_detail_console = (v: ConsoleEventData[]) => { _detail_console = v; };
export const get_dt_tab = () => _dt_tab;
export const set_dt_tab = (v: string) => { _dt_tab = v; };
export const get_dt_view = () => _dt_view;
export const set_dt_view = (v: 'list' | 'trace') => { _dt_view = v; };
export const get_dt_quick = () => _dt_quick;
export const set_dt_quick = (v: string) => { _dt_quick = v; };
export const get_dt_sel = () => _dt_sel;
export const set_dt_sel = (v: number) => { _dt_sel = v; };
export const get_dt_insp_open = () => _dt_insp_open;
export const set_dt_insp_open = (v: boolean) => { _dt_insp_open = v; };
export const get_dt_play = () => _dt_play;
export const set_dt_play = (v: number) => { _dt_play = v; };
export const get_dt_net_sel = () => _dt_net_sel;
export const set_dt_net_sel = (v: number) => { _dt_net_sel = v; };
export const get_dt_net_insp_closed = () => _dt_net_insp_closed;
export const set_dt_net_insp_closed = (v: boolean) => { _dt_net_insp_closed = v; };

// ── helpers ─────────────────────────────────────────────────────────────
export function num(n: number): string { return (n ?? 0).toLocaleString('en-US'); }
export function strip_proto(u: string): string { return (u || '').replace(/^https?:\/\//, ''); }

export function dur_ms(ms: number): string {
    const t = Math.floor(ms / 1000);
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    const p = (x: number) => String(x).padStart(2, '0');
    return `${p(h)}:${p(m)}:${p(s)}`;
}
export function capture_dur(s: CaptureRecord): string {
    if (!s.ended_at) return '—';
    return dur_ms(new Date(s.ended_at).getTime() - new Date(s.started_at).getTime());
}
export function capture_name(s: CaptureRecord): string {
    return s.name || `${format_system_time(s.started_at, get_user_config())} 的采集`;
}

export function est_bytes(s: CaptureRecord): number {
    const st = s.stats;
    if (!st) return 0;
    return st.event_count * 120 + st.request_count * 450 + st.log_count * 160
        + st.storage_change_count * 90 + st.cookie_change_count * 80
        + (st.total_body_bytes || 0);
}
export function fmt_size(bytes: number): string {
    if (bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
export function pct(part: number, whole: number): string {
    if (!whole) return '占比 0%';
    return `占比 ${((part / whole) * 100).toFixed(2)}%`;
}
export function delta_pct(cur: number, prev: number): string | null {
    if (prev === 0) return cur > 0 ? '新增' : null;
    const d = ((cur - prev) / prev) * 100;
    return `${d >= 0 ? '+' : ''}${d.toFixed(0)}%`;
}

// event kind → icon + color
export const KIND: Record<string, { icon: string; color: string }> = {
    capture: { icon: 'agent', color: 'var(--src-capture)' },
    nav: { icon: 'nav', color: 'var(--src-nav)' },
    user: { icon: 'ui', color: 'var(--src-user)' },
    network: { icon: 'net', color: 'var(--src-network)' },
    storage: { icon: 'storage', color: 'var(--src-storage)' },
    console: { icon: 'console', color: 'var(--src-console)' },
    dom: { icon: 'dom', color: 'var(--src-dom)' },
    cookie: { icon: 'cookie', color: 'var(--src-cookie)' },
    error: { icon: 'err', color: 'var(--src-error)' },
};
export function event_kind(e: CaptureEvent): string {
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
        default: return 'capture';
    }
}
export const KIND_LABEL: Record<string, string> = {
    user: '用户行为', nav: '页面导航', network: '网络请求', console: '控制台',
    error: '错误异常', storage: 'Storage', cookie: 'Cookie', dom: 'DOM', capture: '生命周期',
};
export function rel_time(ms: number): string {
    const s = Math.floor(ms / 1000), mss = Math.floor(ms % 1000);
    return `+${String(s).padStart(2, '0')}.${String(mss).padStart(3, '0')}s`;
}
export function event_detail(e: CaptureEvent): string {
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
export function event_title(e: CaptureEvent): string {
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

// ── data loading ────────────────────────────────────────────────────────
export async function load_captures(): Promise<void> {
    if (!is_extension) return;
    try { set_captures((await chrome.runtime.sendMessage({ action: 'list_captures' })) || []); }
    catch { set_captures([]); }
    logger.debug('Captures loaded', { count: get_captures().length });
}

export async function load_detail(id: string): Promise<void> {
    set_detail_capture(null); set_detail_events([]); set_detail_network([]); set_detail_console([]);
    if (!is_extension) return;
    try {
        const r = await chrome.runtime.sendMessage({ action: 'get_capture_data', capture_id: id });
        if (!r?.success) return;
        set_detail_capture(r.capture);

        const snapshot = await read_capture_snapshot(id);
        const events = [
            ...snapshot.user_events,
            ...snapshot.nav_events,
            ...snapshot.error_events,
            ...snapshot.storage_changes,
            ...snapshot.cookie_changes,
        ].slice().sort((a: CaptureEvent, b: CaptureEvent) => a.relative_time_ms - b.relative_time_ms);
        set_detail_events(events);
        set_detail_network(snapshot.network_requests);
        set_detail_console(snapshot.console_events);

        logger.debug('Detail loaded', { capture_id: id, events: events.length });
    } catch { /* best effort */ }
}

export async function export_capture(id: string, format: string = 'archive'): Promise<void> {
    if (!is_extension) return;
    try {
        if (format === 'archive') {
            const snapshot = await read_capture_snapshot(id);
            if (!snapshot.capture) { alert('导出失败'); return; }
            const archive = await build_archive({
                capture: snapshot.capture,
                events: [
                    ...snapshot.user_events,
                    ...snapshot.nav_events,
                    ...snapshot.error_events,
                    ...snapshot.storage_changes,
                    ...snapshot.cookie_changes,
                ],
                network_requests: snapshot.network_requests,
                console_events: snapshot.console_events,
            }, {
                inline_text_max_bytes: get_user_config().inline_text_max_bytes,
                system_time_timezone: get_user_config().system_time_timezone,
            });
            const blob = new Blob([archive as BlobPart], { type: 'application/zip' });
            const capture_filename = build_capture_filename({
                export_capture_directory: get_user_config().export_capture_directory,
                export_filename_template: get_user_config().export_filename_template,
                system_time_timezone: get_user_config().system_time_timezone,
            }, id, 'zip');
            await download_blob(blob, capture_filename, 'capture_export');
            return;
        }
        const action = format === 'html' ? 'export_html' : format === 'har' ? 'export_har' : format === 'jsonl' ? 'export_jsonl' : 'export_json';
        const r = await chrome.runtime.sendMessage({ action, capture_id: id });
        if (!r?.success) { alert('导出失败'); return; }
        const ext = format === 'html' ? 'html' as const : format === 'har' ? 'har' as const : format === 'jsonl' ? 'jsonl' as const : 'json' as const;
        const mime = format === 'html' ? 'text/html' : 'application/json';
        const content = r.json ?? r.jsonl ?? r.html ?? r.har ?? JSON.stringify(r);
        const blob = new Blob([content], { type: mime });
        const capture_filename = build_capture_filename({
            export_capture_directory: get_user_config().export_capture_directory,
            export_filename_template: get_user_config().export_filename_template,
            system_time_timezone: get_user_config().system_time_timezone,
        }, id, ext);
        await download_blob(blob, capture_filename, 'capture_export');
    } catch (err) { logger.error('Export error', err); }
}

// ── router（避免循环依赖，由 dashboard.ts 初始化时注入） ──────────────
export const router = {
    go: (_p: string) => {},
    render_content: () => {},
    render_shell: () => {},
    open_detail: (_id: string) => {},
};

// re-exports used by multiple modules
export { esc, I };
export { format_system_time } from '../shared/system_time';
export { read_capture_snapshot } from '../shared/capture_data_reader';
