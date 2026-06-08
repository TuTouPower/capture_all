// detail/detail.ts
import type { Session, RecordEvent, NetworkRequest, ConsoleLog, UserConfig } from '../shared/types';
import { init_locale, t, apply_translations } from '../shared/i18n';
import { init_theme } from '../shared/theme';
import { load_user_config } from '../shared/user_config';
import { DEFAULT_USER_CONFIG } from '../shared/constants';
import { build_export_filename } from '../shared/export_settings';
import { format_system_time } from '../shared/system_time';

const is_extension = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

let session_id: string;
let session_data: Session | null = null;
let user_config: UserConfig = { ...DEFAULT_USER_CONFIG } as UserConfig;
let events: RecordEvent[] = [];
let network_requests: NetworkRequest[] = [];
let console_logs: ConsoleLog[] = [];

// Page size for pagination
const PAGE_SIZE = 50;
let events_page = 0;
let network_page = 0;
let logs_page = 0;

document.addEventListener('DOMContentLoaded', async () => {
    session_id = get_session_id();
    if (is_extension) {
        await init_locale();
        await init_theme();
        user_config = await load_user_config();
    }
    apply_translations();
    setup_tabs();
    setup_export();
    await load_session_data();
});

function get_session_id(): string {
    const params = new URLSearchParams(window.location.search);
    return params.get('session') || '';
}

async function load_session_data(): Promise<void> {
    // Always render the UI structure first
    render_timeline();
    render_network();
    render_console();
    render_events();

    if (!is_extension) return;

    try {
        const response = await chrome.runtime.sendMessage({
            action: 'get_session_data',
            session_id
        });

        if (!response.success) {
            setText('sessionId', session_id);
            setText('startTime', t('sessionNotFound'));
            return;
        }

        session_data = response.session;
        events = response.events || [];
        network_requests = response.network_requests || [];
        console_logs = response.console_logs || [];

        render_overview();
        render_timeline();
        render_network();
        render_console();
        render_events();
    } catch (error) {
        setText('sessionId', session_id);
        setText('startTime', `${t('error')}: ${error}`);
    }
}

function render_overview(): void {
    if (!session_data) return;

    const s = session_data;
    setText('sessionId', s.capture_id);
    setText('startTime', format_system_time(s.started_at, user_config));
    setText('duration', s.ended_at ? format_duration(new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) : 'In progress');
    setText('eventCount', String(s.stats.event_count || events.length));
    setText('requestCount', String(s.stats.request_count || network_requests.length));
    setText('logCount', String(s.stats.log_count || console_logs.length));
}

function render_timeline(): void {
    const container = document.getElementById('timelineContainer')!;
    const filter = document.getElementById('timelineFilter') as HTMLSelectElement;
    const search = document.getElementById('timelineSearch') as HTMLInputElement;

    const filtered = filter_events(events, filter.value, search.value);
    const page_items = filtered.slice(0, (events_page + 1) * PAGE_SIZE);

    container.innerHTML = page_items.length === 0
        ? '<div class="empty-state">No events</div>'
        : page_items.map(render_timeline_item).join('');

    const loadMore = document.getElementById('loadMore')!;
    loadMore.style.display = page_items.length < filtered.length ? 'block' : 'none';

    // Scroll handler for infinite loading
    container.onscroll = () => {
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 50) {
            events_page++;
            render_timeline();
        }
    };
}

function render_timeline_item(event: RecordEvent): string {
    const time = format_detail_time(event.relative_time_ms, event.absolute_time);
    const detail = get_event_detail(event);
    return `<div class="timeline-item">
        <span class="timeline-time">${time}</span>
        <span class="timeline-badge ${event.type}">${event.type}</span>
        <span class="timeline-detail">${escape_html(detail)}</span>
    </div>`;
}

function render_network(): void {
    const tbody = document.getElementById('networkBody')!;
    const filter = document.getElementById('networkFilter') as HTMLSelectElement;
    const search = document.getElementById('networkSearch') as HTMLInputElement;

    let filtered = network_requests;
    if (filter.value !== 'all') {
        filtered = filtered.filter(r => r.resource_type === filter.value);
    }
    if (search.value) {
        const q = search.value.toLowerCase();
        filtered = filtered.filter(r => r.url.toLowerCase().includes(q));
    }

    const page_items = filtered.slice(0, (network_page + 1) * PAGE_SIZE);

    tbody.innerHTML = page_items.length === 0
        ? '<tr><td colspan="6" class="empty-state">No network requests</td></tr>'
        : page_items.map(render_network_row).join('');
}

function render_network_row(req: NetworkRequest): string {
    const method_class = req.method.toUpperCase();
    const status_class = `s${String(req.status_code)[0]}xx`;
    const body_status = req.response_body_status || '-';
    const corr = ((req as unknown) as Record<string, unknown>).correlation_status ? ` · ${((req as unknown) as Record<string, unknown>).correlation_status}` : '';
    return `<tr>
        <td><span class="method-badge ${method_class}">${req.method}</span></td>
        <td class="url-cell" title="${escape_html(req.url)}">${escape_html(req.url)}</td>
        <td><span class="status-badge ${status_class}">${req.status_code}</span></td>
        <td>${req.resource_type}</td>
        <td title="${body_status}${corr}">${body_status}${corr}</td>
        <td>${req.duration_ms?.toFixed(0) ?? '-'}ms</td>
    </tr>`;
}

function render_console(): void {
    const container = document.getElementById('consoleContainer')!;
    const filter = document.getElementById('consoleFilter') as HTMLSelectElement;
    const search = document.getElementById('consoleSearch') as HTMLInputElement;

    let filtered = console_logs;
    if (filter.value !== 'all') {
        filtered = filtered.filter(l => l.level === filter.value);
    }
    if (search.value) {
        const q = search.value.toLowerCase();
        filtered = filtered.filter(l => l.args_preview.some((a: string) => a.toLowerCase().includes(q)));
    }

    const page_items = filtered.slice(0, (logs_page + 1) * PAGE_SIZE);

    container.innerHTML = page_items.length === 0
        ? '<div class="empty-state">No console logs</div>'
        : page_items.map(render_console_item).join('');
}

function render_console_item(log: ConsoleLog): string {
    const stack_html = log.stack_trace
        ? `<div class="console-stack">${escape_html(log.stack_trace)}</div>`
        : '';
    return `<div class="console-item ${log.level}">
        <span class="console-level ${log.level}">${log.level}</span>
        <span class="console-args">${log.args_preview.map(a => escape_html(a)).join(' ')}</span>
        <span class="console-source">${log.source_url}:${log.line}:${log.column}</span>
        ${stack_html}
    </div>`;
}

function render_events(): void {
    const container = document.getElementById('eventsContainer')!;
    const filter = document.getElementById('eventsFilter') as HTMLSelectElement;
    const search = document.getElementById('eventsSearch') as HTMLInputElement;

    const filtered = filter_events(events, filter.value, search.value)
        .filter(e => ['mouse_event', 'keyboard_event', 'scroll_event', 'dom_mutation'].includes(e.type));

    container.innerHTML = filtered.length === 0
        ? '<div class="empty-state">No events</div>'
        : filtered.map(render_event_item).join('');
}

function render_event_item(event: RecordEvent): string {
    const time = format_detail_time(event.relative_time_ms, event.absolute_time);
    const detail = get_event_detail(event);
    return `<div class="event-item">
        <span class="event-time">${time}</span>
        <span class="timeline-badge ${event.type} event-type">${event.type}</span>
        <span class="event-detail">${escape_html(detail)}</span>
    </div>`;
}

// Tab switching
function setup_tabs(): void {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            (document.querySelectorAll('.tab-content') as NodeListOf<HTMLElement>).forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const tab = btn.getAttribute('data-tab')!;
            document.getElementById(`${tab}-tab`)!.classList.add('active');
        });
    });

    // Filter listeners
    ['timelineFilter', 'timelineSearch', 'networkFilter', 'networkSearch',
     'consoleFilter', 'consoleSearch', 'eventsFilter', 'eventsSearch'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                events_page = 0;
                network_page = 0;
                logs_page = 0;
                render_timeline();
                render_network();
                render_console();
                render_events();
            });
        }
    });
}

// Export
function setup_export(): void {
    document.getElementById('exportJsonBtn')!.addEventListener('click', export_json);
    document.getElementById('exportJsonlBtn')!.addEventListener('click', export_jsonl);
    document.getElementById('exportHtmlBtn')!.addEventListener('click', export_html);
    document.getElementById('exportHarBtn')!.addEventListener('click', export_har);
}

async function export_json(): Promise<void> {
    if (!is_extension) return;

    const response = await chrome.runtime.sendMessage({
        action: 'export_json',
        session_id
    });

    if (response.success) {
        download_export(response.json, 'application/json', 'json');
    }
}

async function export_jsonl(): Promise<void> {
    if (!is_extension) return;

    const response = await chrome.runtime.sendMessage({
        action: 'export_jsonl',
        session_id
    });

    if (response.success) {
        download_export(response.jsonl, 'application/x-ndjson', 'jsonl');
    }
}

async function export_html(): Promise<void> {
    if (!is_extension) return;

    const response = await chrome.runtime.sendMessage({
        action: 'export_html',
        session_id
    });

    if (response.success) {
        download_export(response.html, 'text/html', 'html');
    }
}

async function export_har(): Promise<void> {
    if (!is_extension) return;

    const response = await chrome.runtime.sendMessage({
        action: 'export_har',
        session_id
    });

    if (response.success) {
        download_export(response.har, 'application/json', 'har');
    }
}

function download_export(content: string, type: string, extension: 'json' | 'jsonl' | 'html' | 'har'): void {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const filename = build_export_filename(user_config, session_id, extension);
    chrome.downloads.download({ url, filename, saveAs: user_config.export_save_as });
}

// Helpers
function filter_events(evts: RecordEvent[], type_filter: string, search: string): RecordEvent[] {
    let filtered = evts;
    if (type_filter !== 'all') {
        filtered = filtered.filter(e => e.type === type_filter);
    }
    if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(e => {
            const detail = get_event_detail(e);
            return detail.toLowerCase().includes(q) || e.type.includes(q);
        });
    }
    return filtered;
}

function get_event_detail(event: RecordEvent): string {
    const data = event.data as Record<string, unknown> | undefined;
    if (!data) return '';

    switch (event.type) {
        case 'mouse_event':
            return `${data.action} (${data.x}, ${data.y}) ${data.target_tag || ''}`;
        case 'keyboard_event':
            return `${data.action} ${data.key} ${data.code || ''}`;
        case 'scroll_event':
            return `scroll (${data.scroll_x}, ${data.scroll_y})`;
        case 'dom_mutation':
            return `${data.action} ${data.target_tag || ''} ${data.target_selector || ''}`;
        case 'page_navigation':
            return `${data.from} → ${data.to}`;
        case 'page_load':
            return `loaded in ${data.load_time_ms}ms`;
        case 'tab_switch':
            return `${data.action} ${data.tab_title || ''}`;
        default:
            return JSON.stringify(data);
    }
}

function format_detail_time(relative_time: number, absolute_time: string): string {
    if (user_config.detail_time_display_mode === 'relative') {
        return format_relative_time(relative_time);
    }
    return format_system_time(absolute_time, user_config);
}

function format_relative_time(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const millis = Math.floor(ms % 1000);
    return `${minutes}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function format_duration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    return `${minutes}m ${seconds % 60}s`;
}

function setText(id: string, text: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function escape_html(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
