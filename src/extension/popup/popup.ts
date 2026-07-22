// popup/popup.ts — Capture All 全采 采集控制台
// Unified popup, 3 states: 开始采集 / 采集中 / 采集完成. Real capturing wiring.
import type { CaptureRecord, CaptureStats, Session, UserConfig } from '../../shared/types';
import { init_locale, t, apply_translations } from '../shared/i18n';
import { init_theme } from '../shared/theme';
import { escape_html } from '../../shared/escape';
import { load_user_config } from '../../shared/user_config';
import { DEFAULT_USER_CONFIG } from '../../shared/constants';
import { format_system_time } from '../../shared/system_time';
import { download_blob, build_capture_filename } from '../shared/export_utils';
import { build_archive } from '../shared/archive_builder';
import { read_capture_snapshot } from '../shared/capture_data_reader';
import { generate_capture_id } from '../../shared/id';
import { Logger } from '../../shared/logger';
import { get_app_log_transport } from '../background/app_log_storage';
import type { CaptureConfig } from '../../shared/types';

const logger = new Logger('popup', get_app_log_transport());

type PopupState = 'ready' | 'capturing' | 'saved';

const is_extension = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

let user_config: UserConfig = { ...DEFAULT_USER_CONFIG } as UserConfig;
let state: PopupState = 'ready';
let current_capture: CaptureRecord | null = null;
let finished_capture: CaptureRecord | null = null;
let live_counts: CaptureStats | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

// Data label toggles — all ON by default, clickable only in 'ready' state
const toggles: Record<string, boolean> = {
    event_count: true,          // 用户行为
    nav_count: true,            // 页面导航
    request_count: true,        // 网络请求
    log_count: true,            // 控制台
    error_count: true,          // 错误异常
    storage_change_count: true, // Storage
    cookie_change_count: true,  // Cookie
    mask: true,                 // 脱敏
};

const view = document.getElementById('view')!;
const panelBtn = document.getElementById('panelBtn')!;

// ── inline icons (standard UI glyphs only) ──────────────────────────────
// Toggle key → Chinese tag label (for capture.tags)
const TAG_LABEL: Record<string, string> = {
    event_count: '用户行为',
    nav_count: '页面导航',
    request_count: '网络请求',
    log_count: '控制台',
    error_count: '错误异常',
    storage_change_count: 'Storage',
    cookie_change_count: 'Cookie',
};

function build_tags(): string[] {
    return CAPTURE
        .filter((src) => src.key !== 'mask' && toggles[src.key] !== false)
        .map((src) => TAG_LABEL[src.key]);
}

const ICON: Record<string, string> = {
    ext: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 14v4.5A1.5 1.5 0 0 1 17.5 20h-12A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5H10"/></svg>',
    clock: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v4.8l3 1.7"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.4 12.4l2.5 2.5 4.7-5.3"/></svg>',
    download: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v11m0 0l-3.8-3.8M12 14.5l3.8-3.8M5 19.5h14"/></svg>',
    doc: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3.5h7l5 5v12H7z"/><path d="M14 3.5v5h5M10 13h6M10 16.5h4"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11.5A8 8 0 1 0 18 17"/><path d="M20 5v5h-5"/></svg>',
    stop: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="3"/></svg>',
    pointer: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M5 3l5.4 15.6 2.25-6.45 6.45-2.25z"/></svg>',
    globe: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/></svg>',
    braces: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4c-2 0-2.5 1-2.5 3.5S5 11 3.5 12c1.5 1 2 2 2 4.5S6 20 8 20M16 4c2 0 2.5 1 2.5 3.5S19 11 20.5 12c-1.5 1-2 2-2 4.5S18 20 16 20"/></svg>',
    console: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="19" height="16" rx="2.5"/><path d="M6 9l3 3-3 3M12.5 15h4"/></svg>',
    alert: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4.5M12 17h.01"/></svg>',
    storage: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
    cookie: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 9 9 4 4 0 0 1-5-5 4 4 0 0 1-4-4z"/><path d="M9 11.5h.01M14 14.5h.01M9.5 15.5h.01M15 9h.01"/></svg>',
    shield: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/></svg>',
};

interface CaptureSource {
    key: keyof CaptureStats | 'mask';
    i18n: string;
    icon: string;
    tone: string;
    stat: keyof CaptureStats | null;
}

// the 8 capture sources (fixed order + colors per spec)
const CAPTURE: CaptureSource[] = [
    { key: 'event_count',          i18n: 'capUser',    icon: 'pointer', tone: 'blue',   stat: 'user_action_count' },
    { key: 'nav_count',            i18n: 'capNav',     icon: 'globe',   tone: 'indigo', stat: 'nav_count' },
    { key: 'request_count',        i18n: 'capNet',     icon: 'braces',  tone: 'purple', stat: 'request_count' },
    { key: 'log_count',            i18n: 'capConsole', icon: 'console', tone: 'amber',  stat: 'log_count' },
    { key: 'error_count',          i18n: 'capError',   icon: 'alert',   tone: 'red',    stat: 'error_count' },
    { key: 'storage_change_count', i18n: 'capStorage', icon: 'storage', tone: 'green',  stat: 'storage_change_count' },
    { key: 'cookie_change_count',  i18n: 'capCookie',  icon: 'cookie',  tone: 'cyan',   stat: 'cookie_change_count' },
    { key: 'mask',                 i18n: 'capMask',    icon: 'shield',  tone: 'green',  stat: null },
];

function fmt_num(n: number): string {
    return n.toLocaleString('en-US');
}

function fmt_hms(seconds: number): string {
    const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    const s = String(Math.floor(seconds % 60)).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function fmt_dur_ms(ms: number): string {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}m ${String(s).padStart(2, '0')}s`;
}

function metric_grid(stats: CaptureStats | null, can_toggle: boolean): string {
    const cards = CAPTURE.map((src) => {
        const has = stats != null && src.stat != null;
        const n = has ? fmt_num(stats![src.stat!]) : '';
        const on = toggles[src.key] !== false;
        return `<div class="mcard ${can_toggle ? 'mcard-toggle' : ''} ${on ? '' : 'mcard-off'}" data-key="${src.key}" data-tone="${src.tone}" data-count="${has ? 1 : 0}">
            <div class="mcard-row">
                <span class="mcard-ic">${ICON[src.icon]}</span>
                <span class="mcard-lbl">${t(src.i18n as never)}</span>
            </div>
            ${has ? `<span class="mcard-n mono">${n}</span>` : ''}
        </div>`;
    }).join('');
    return `<div class="metrics">${cards}</div>`;
}

let recent_captures: Session[] = [];

function recent_list(): string {
    const rows = recent_captures.slice(0, 3).map((s) => {
        const events = fmt_num(s.stats?.event_count ?? 0);
        const dur = s.ended_at
            ? fmt_dur_ms(new Date(s.ended_at).getTime() - new Date(s.started_at).getTime())
            : '—';
        const when = escape_html(format_system_time(s.started_at, user_config));
        return `<a class="recent-row" data-capture="${escape_html(s.capture_id)}">
            <span class="recent-ic">${ICON.clock}</span>
            <span class="recent-main">
                <span class="recent-top"><b>${when}</b></span>
                <span class="recent-sub mono">${dur} · ${events} events</span>
            </span>
            <span class="recent-go link">${t('viewDetail')} ${ICON.chevron}</span>
        </a>`;
    }).join('');
    const body = rows || `<div class="recent-empty">${t('noCaptures')}</div>`;
    return `<div class="recent">
        <div class="recent-hd">
            <span>${t('recentCaptures')}</span>
            <a class="link" id="viewAll">${t('viewAll')} ${ICON.chevron}</a>
        </div>
        <div class="recent-list">${body}</div>
    </div>`;
}

function render_ready(): string {
    return `<div class="body">
        <div class="action">
            <button class="actbtn act-start" id="startBtn">
                <span class="start-glyph"></span>
                <span class="start-txt">${t('startCapture')}</span>
            </button>
        </div>
        ${metric_grid(null, true)}
        ${recent_list()}
    </div>`;
}

function render_capturing(): string {
    const elapsed = current_capture
        ? fmt_hms((Date.now() - new Date(current_capture.started_at).getTime()) / 1000)
        : '00:00:00';
    return `<div class="body">
        <div class="action">
            <button class="actbtn act-stop" id="stopBtn" title="${t('clickToEnd')}">
                <span class="stop-time mono" id="timer">${elapsed}</span>
                <span class="stop-row">
                    <span class="stop-glyph">${ICON.stop}</span>
                    <span class="stop-hint">${t('clickToEnd')}</span>
                </span>
            </button>
            <button class="actbtn act-ghost" id="liveDetailBtn">
                ${ICON.ext}<span>${t('liveDetail')}</span>
            </button>
        </div>
        ${metric_grid(live_counts ?? current_capture?.stats ?? null, false)}
        ${recent_list()}
    </div>`;
}

function render_saved(): string {
    const cap = finished_capture;
    const dur = cap && cap.ended_at
        ? fmt_dur_ms(new Date(cap.ended_at).getTime() - new Date(cap.started_at).getTime())
        : fmt_dur_ms(cap?.duration_ms ?? 0);
    return `<div class="body">
        <div class="action">
            <div class="act-done">
                <span class="done-time mono">${dur}</span>
                <span class="done-check">${ICON.check}</span>
            </div>
            <div class="act-col">
                <a class="actbtn act-ghost" id="openDetailBtn">
                    ${ICON.ext}<span>${t('openDetail')}</span>
                </a>
                <button class="actbtn act-ghost" id="exportBtn">
                    ${ICON.download}<span>${t('exportLabel')}</span>
                </button>
                <button class="actbtn act-ghost" id="newBtn">
                    ${ICON.refresh}<span>${t('newCapture')}</span>
                </button>
            </div>
        </div>
        ${metric_grid(cap?.stats ?? null, false)}
        ${recent_list()}
    </div>`;
}

function render(): void {
    const popup = document.getElementById('popup')!;
    popup.classList.toggle('is-rec', state === 'capturing');
    if (state === 'capturing') view.innerHTML = render_capturing();
    else if (state === 'saved') view.innerHTML = render_saved();
    else view.innerHTML = render_ready();
    apply_translations();
    wire_view();
}

function open_dashboard(query = ''): void {
    if (!is_extension) return;
    const url = chrome.runtime.getURL('src/extension/dashboard/dashboard.html' + query);
    chrome.tabs.create({ url });
}

function wire_view(): void {
    view.querySelector('#startBtn')?.addEventListener('click', start_capture);
    view.querySelector('#stopBtn')?.addEventListener('click', stop_capture);
    view.querySelector('#newBtn')?.addEventListener('click', () => { state = 'ready'; render(); });
    view.querySelector('#liveDetailBtn')?.addEventListener('click', () => {
        if (current_capture) open_dashboard(`?capture=${current_capture.capture_id}&page=detail`);
    });
    view.querySelector('#openDetailBtn')?.addEventListener('click', () => {
        if (finished_capture) open_dashboard(`?capture=${finished_capture.capture_id}&page=detail`);
    });
    view.querySelector('#exportBtn')?.addEventListener('click', async () => {
        if (!finished_capture) return;
        try {
            const resp = await chrome.runtime.sendMessage({
                action: 'get_capture_data',
                capture_id: finished_capture.capture_id,
            });
            if (!resp?.success) {
                logger.error('Export failed', resp?.error);
                alert(`${t('error')}: ${resp?.error ?? 'Export failed'}`);
                return;
            }
            const snapshot = await read_capture_snapshot(finished_capture.capture_id);
            if (!snapshot.capture) {
                alert(`${t('error')}: Capture not found`);
                return;
            }
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
                inline_text_max_bytes: user_config.inline_text_max_bytes,
                system_time_timezone: user_config.system_time_timezone,
            });
            const blob = new Blob([archive as BlobPart], { type: 'application/zip' });
            const filename = build_capture_filename(
                {
                    export_capture_directory: user_config.export_capture_directory,
                    export_filename_template: user_config.export_filename_template,
                    system_time_timezone: user_config.system_time_timezone,
                },
                finished_capture.capture_id,
                'zip',
            );
            await download_blob(blob, filename, 'capture_export');
        } catch (e) {
            logger.error('Export message failed', e);
            alert(`${t('error')}: ${e}`);
        }
    });
    view.querySelector('#viewAll')?.addEventListener('click', () => open_dashboard());
    view.querySelectorAll('.recent-row').forEach((row) => {
        row.addEventListener('click', () => {
            const id = (row as HTMLElement).dataset.capture;
            if (id) open_dashboard(`?capture=${id}&page=detail`);
        });
    });
    // Toggle switches — only active in 'ready' state
    view.querySelectorAll('.mcard-toggle').forEach((card) => {
        card.addEventListener('click', () => {
            if (state !== 'ready') return;
            const key = (card as HTMLElement).dataset.key;
            if (key) {
                toggles[key] = !toggles[key];
                render();
            }
        });
    });
}

function get_capture_config(): CaptureConfig {
    return {
        // Category gates: popup toggles are direct on/off
        capture_network: toggles.request_count !== false,
        capture_console: toggles.log_count !== false,
        // Mouse precision from user config
        mouse_precision: user_config.mouse_precision,
        // Keyboard capture mode from user config
        keyboard_capture_mode: user_config.keyboard_capture_mode,
        // Fine-grained extras: from dashboard settings
        capture_input_values: user_config.capture_input_values,
        capture_request_body: user_config.capture_request_body,
        capture_response_body: user_config.capture_response_body,
        max_body_capture_bytes: user_config.max_body_capture_bytes,
        inline_text_max_bytes: user_config.inline_text_max_bytes,
        redact_data: toggles.mask !== false,
        // Redaction settings
        redact_sensitive_headers: true,
        redact_url_query: true,
        sample_rate_ms: 50,
        // Toggle flags for config display (carried as extra keys)
        event_count_enabled: toggles.event_count !== false,
        nav_count_enabled: toggles.nav_count !== false,
        error_count_enabled: toggles.error_count !== false,
        storage_change_count_enabled: toggles.storage_change_count !== false,
        cookie_change_count_enabled: toggles.cookie_change_count !== false,
    } as CaptureConfig;
}

async function start_capture(): Promise<void> {
    if (!is_extension) { state = 'capturing'; render(); return; }
    const config = get_capture_config();
    const capture_id = generate_capture_id();
    logger.info('Starting capture', { capture_id });
    try {
        const response = await chrome.runtime.sendMessage({ action: 'start', capture_id: capture_id, config });
        if (!response?.success) {
            logger.error('Start capture failed', response?.error);
            alert(`${t('error')}: ${response?.error}`); return;
        }
        current_capture = {
            capture_id,
            name: 'Capture ' + new Date().toLocaleString(),
            status: 'capturing',
            started_at: new Date().toISOString(),
            ended_at: null,
            duration_ms: 0,
            start_url: '', end_url: null, tab_id: 0, window_id: null,
            config_snapshot: config,
            stats: { event_count: 0, user_action_count: 0, nav_count: 0, request_count: 0, log_count: 0, error_count: 0, storage_change_count: 0, cookie_change_count: 0, total_body_bytes: 0 },
            tags: build_tags(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        live_counts = null;
        chrome.storage.local.set({ is_capturing: true, current_capture, capture_toggles: toggles });
        state = 'capturing';
        render();
        start_timer();
    } catch (error) {
        alert(`${t('error')}: ${error}`);
    }
}

async function stop_capture(): Promise<void> {
    if (!is_extension) { state = 'saved'; render(); return; }
    logger.info('Stopping capture');
    try {
        const response = await chrome.runtime.sendMessage({ action: 'stop' });
        if (!response?.success) {
            logger.warn('stop returned success=false, forcing state transition');
        } else {
            logger.info('Capture stopped successfully');
        }
        stop_timer();
        if (current_capture) {
            finished_capture = {
                ...current_capture,
                status: 'completed',
                ended_at: new Date().toISOString(),
                duration_ms: Date.now() - new Date(current_capture.started_at).getTime(),
                stats: live_counts ?? current_capture.stats,
            };
        }
        current_capture = null;
        live_counts = null;
        chrome.storage.local.set({ is_capturing: false, current_capture: null });
        await load_history();
        state = 'saved';
        render();
    } catch (error) {
        alert(`${t('error')}: ${error}`);
    }
}

function start_timer(): void {
    stop_timer();
    refresh_counts();
    timer = setInterval(async () => {
        const el = document.getElementById('timer');
        if (el && current_capture) {
            el.textContent = fmt_hms((Date.now() - new Date(current_capture.started_at).getTime()) / 1000);
        }
        await refresh_counts();
    }, 1000);
}

function stop_timer(): void {
    if (timer) { clearInterval(timer); timer = null; }
}

async function refresh_counts(): Promise<void> {
    if (!is_extension || state !== 'capturing') return;
    try {
        const status = await chrome.runtime.sendMessage({ action: 'get_status' });
        const stats: CaptureStats | undefined = status?.stats ?? status?.current_capture?.stats;
        if (stats) {
            live_counts = stats;
            CAPTURE.forEach((src, i) => {
                if (!src.stat) return;
                const card = view.querySelectorAll('.mcard')[i];
                const n = card?.querySelector('.mcard-n');
                if (n) n.textContent = fmt_num(stats[src.stat!]);
            });
        }
    } catch {
        // best-effort live counts
    }
}

async function load_history(): Promise<void> {
    if (!is_extension) return;
    try {
        recent_captures = await chrome.runtime.sendMessage({ action: 'list_captures' }) || [];
    } catch {
        recent_captures = [];
    }
}

async function load_state(): Promise<void> {
    const result = await chrome.storage.local.get(['is_capturing', 'current_capture']);
    if (result.is_capturing && result.current_capture) {
        current_capture = result.current_capture;
        state = 'capturing';
    } else {
        state = 'ready';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    if (is_extension) {
        await init_locale();
        await init_theme();
        user_config = await load_user_config();
        await load_state();
        await load_history();
    }
    panelBtn.addEventListener('click', () => open_dashboard());
    render();
    if (state === 'capturing') start_timer();

    // MCP 通过 Bridge 触发 start/stop 时，service_worker 写 storage 让 popup 实时反映状态变化。
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (!('is_capturing' in changes) && !('current_capture' in changes)) return;
        const was_capturing = state === 'capturing';
        void load_state().then(() => {
            render();
            const now_capturing = state === 'capturing';
            if (now_capturing && !was_capturing) start_timer();
            else if (!now_capturing && was_capturing) stop_timer();
        });
    });
});
