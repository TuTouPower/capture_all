// dashboard/dashboard_format.ts — t186: Dashboard 纯函数（格式化/KIND/事件渲染辅助）。
// 无模块级可变状态；依赖 state 的 getter（capture_name 用 user_config）。
import type { CaptureRecord, CaptureEvent } from '../../shared/types';
import { escape_html as esc } from '../../shared/escape';
import { format_system_time } from '../../shared/system_time';
import type { CaptureSnapshot } from '../shared/capture_data_reader';
import { Logger } from '../../shared/logger';
import { get_app_log_transport } from '../background/app_log_storage';
import { t, type I18nStrings } from '../shared/i18n';
import { category_for_event_type } from '../../shared/event_category';
import { generate_unique_suffix } from '../../shared/id';
import { I } from './icons';
import { get_user_config } from './dashboard_state';

export const logger = new Logger('dashboard', get_app_log_transport());

export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return ((...args: unknown[]) => {
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    }) as T;
}

export const is_extension = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

// ── helpers ─────────────────────────────────────────────────────────────
export function num(n: number): string { return (n ?? 0).toLocaleString('en-US'); }
export function strip_proto(u: string): string { return (u || '').replace(/^https?:\/\//, ''); }

export function dur_ms(ms: number): string {
    const sec = Math.floor(ms / 1000);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const p = (x: number) => String(x).padStart(2, '0');
    return `${p(h)}:${p(m)}:${p(s)}`;
}
export function capture_dur(s: CaptureRecord): string {
    if (!s.ended_at) return '—';
    // t154 AC-008: ended_at < started_at 时差值可为负，clamp 0 避免渲染负时长
    const ms = Math.max(0, new Date(s.ended_at).getTime() - new Date(s.started_at).getTime());
    return dur_ms(ms);
}
export function capture_name(s: CaptureRecord): string {
    return s.name || `${format_system_time(s.started_at, get_user_config())}${t('captureNameSuffix')}`;
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
    if (!whole) return `${t('pctPrefix')}0%`;
    return `${t('pctPrefix')}${((part / whole) * 100).toFixed(2)}%`;
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
    // t152 AC-006: 与 category_for_event_type 对齐——ws/clipboard/form/visibility 等不再错标「生命周期」
    const cat = category_for_event_type(e.type);
    switch (cat) {
        case 'user_action': return 'user';
        case 'navigation': return 'nav';
        case 'network': return 'network';
        case 'console': return 'console';
        case 'error': return 'error';
        case 'storage': return 'storage';
        case 'cookie': return 'cookie';
        case 'dom_data': return 'dom';
        case 'capture_lifecycle': return 'capture';
    }
}
const KIND_KEY: Record<string, keyof I18nStrings> = {
    user: 'capUser', nav: 'capNav', network: 'capNet', console: 'capConsole',
    error: 'capError', storage: 'capStorage', cookie: 'capCookie', dom: 'kindDom', capture: 'kindLifecycle',
};
export function kind_label(k: string): string {
    return t(KIND_KEY[k] ?? (k as keyof I18nStrings));
}
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
        case 'route_change': return String(d.to || t('spaRouteChange'));
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
        case 'mouse_event': return `${d.action || t('mouseClick')} ${d.target_tag || ''}`;
        case 'keyboard_event': return `${t('keyPress')} ${d.key || ''}`;
        case 'scroll_event': return t('scroll');
        case 'input_event': return t('inputLabel');
        case 'route_change': return `${t('routeChangeLabel')} ${d.to || ''}`;
        case 'network_request': return `${d.method || ''} ${strip_proto(String(d.url || ''))}`;
        case 'console_event': return String(d.level || 'log');
        case 'storage_change': return `${d.key || 'storage'} changed`;
        case 'cookie_change': return `${d.name || 'cookie'} changed`;
        case 'capture_started': return t('startCapture');
        case 'capture_stopped': return t('stopCapture');
        default: return e.type;
    }
}

// t144: 把 network/console 事件并入 detail_events（CaptureEvent 形态），参与 timeline 轨道与 rail 快速筛选。
// network/console 记录为 CaptureEvent 形态（含 relative_time_ms），get_console_events 类型标注仅暴露
// data 字段，运行时字段齐全；用 as CaptureEvent 断言补足必填字段。
export function merge_detail_events(
    id: string,
    snapshot: Pick<CaptureSnapshot, 'user_events' | 'nav_events' | 'error_events' | 'storage_changes' | 'cookie_changes' | 'network_requests' | 'console_events'>,
): CaptureEvent[] {
    return [
        ...snapshot.user_events,
        ...snapshot.nav_events,
        ...snapshot.error_events,
        ...snapshot.storage_changes,
        ...snapshot.cookie_changes,
        ...snapshot.network_requests.map((n) => ({
            event_id: (n as { event_id?: string }).event_id ?? `net_${n.request_id}`,
            capture_id: id,
            category: 'network' as const,
            type: 'network_request' as const,
            // t144: 兼容两种落库形状——background NetworkRequestData（data.relative_time）
            // 与 content hook CaptureEvent（顶层 relative_time_ms，见 f009）
            relative_time_ms: (n as { relative_time_ms?: number }).relative_time_ms
                ?? n.relative_time
                ?? 0,
            absolute_time: n.start_time_ms ? new Date(n.start_time_ms).toISOString() : '',
            tab_id: 0,
            url: n.url,
            source: 'background' as const,
            severity: 'info' as const,
            created_at: n.start_time_ms ?? Date.now(),
            // f010: content hook 形状下 n 是 CaptureEvent（data 内嵌 NetworkRequestData），
            // 归一化使 timeline 列表/inspector 读 e.data.url/method 正确
            data: (n as { data?: unknown }).data ?? n,
        }) as unknown as CaptureEvent),
        ...snapshot.console_events.map((c) => ({
            event_id: c.event_id ?? `con_${generate_unique_suffix(10)}`,
            capture_id: id,
            category: 'console' as const,
            type: 'console_event' as const,
            relative_time_ms: c.relative_time_ms ?? 0,
            absolute_time: '',
            tab_id: 0,
            url: '',
            source: 'background' as const,
            severity: (c as { severity?: string }).severity ?? 'info',
            created_at: Date.now(),
            data: c,
        }) as unknown as CaptureEvent),
    ].slice().sort((a: CaptureEvent, b: CaptureEvent) => a.relative_time_ms - b.relative_time_ms);
}

// re-exports used by multiple modules
export { esc, I };
export { format_system_time } from '../../shared/system_time';
export { read_capture_snapshot } from '../shared/capture_data_reader';
