// detail/detail.ts
import type { Session, RecordEvent, NetworkRequest, ConsoleLog } from '../shared/types';
import { init_locale, t, apply_translations } from '../shared/i18n';

const is_extension = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

let session_id: string;
let session_data: Session | null = null;
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
    setText('sessionId', s.id);
    setText('startTime', new Date(s.start_time).toLocaleString());
    setText('duration', s.end_time ? format_duration(s.end_time - s.start_time) : 'In progress');
    setText('mode', s.config.capture_mode === 'basic' ? t('basicTitle') : t('advancedTitle'));
    setText('eventCount', String(s.stats.event_count));
    setText('requestCount', String(s.stats.request_count));
    setText('logCount', String(s.stats.log_count));
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
    const time = format_relative_time(event.relative_time);
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
        ? '<tr><td colspan="5" class="empty-state">No network requests</td></tr>'
        : page_items.map(render_network_row).join('');
}

function render_network_row(req: NetworkRequest): string {
    const method_class = req.method.toUpperCase();
    const status_class = `s${String(req.status_code)[0]}xx`;
    return `<tr>
        <td><span class="method-badge ${method_class}">${req.method}</span></td>
        <td class="url-cell" title="${escape_html(req.url)}">${escape_html(req.url)}</td>
        <td><span class="status-badge ${status_class}">${req.status_code}</span></td>
        <td>${req.resource_type}</td>
        <td>${req.duration_ms.toFixed(0)}ms</td>
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
        filtered = filtered.filter(l => l.args.some(a => a.toLowerCase().includes(q)));
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
        <span class="console-args">${log.args.map(a => escape_html(a)).join(' ')}</span>
        <span class="console-source">${log.url}:${log.line}:${log.column}</span>
        ${stack_html}
    </div>`;
}

function render_events(): void {
    const container = document.getElementById('eventsContainer')!;
    const filter = document.getElementById('eventsFilter') as HTMLSelectElement;
    const search = document.getElementById('eventsSearch') as HTMLInputElement;

    const filtered = filter_events(events, filter.value, search.value)
        .filter(e => ['mouse', 'keyboard', 'scroll', 'dom_change'].includes(e.type));

    container.innerHTML = filtered.length === 0
        ? '<div class="empty-state">No events</div>'
        : filtered.map(render_event_item).join('');
}

function render_event_item(event: RecordEvent): string {
    const time = format_relative_time(event.relative_time);
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
    document.getElementById('exportHtmlBtn')!.addEventListener('click', export_html);
}

async function export_json(): Promise<void> {
    if (!is_extension) return;

    const data = {
        session: session_data,
        events,
        network_requests,
        console_logs
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const filename = `record_all_${session_id}_${new Date().toISOString().slice(0, 10)}.json`;
    chrome.downloads.download({ url, filename });
}

async function export_html(): Promise<void> {
    if (!is_extension) return;

    const response = await chrome.runtime.sendMessage({
        action: 'export_html',
        session_id
    });

    if (response.success) {
        const blob = new Blob([response.html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const filename = `record_all_${session_id}_${new Date().toISOString().slice(0, 10)}.html`;
        chrome.downloads.download({ url, filename });
    }
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
    const data = event.data as unknown as Record<string, unknown>;
    if (!data) return '';

    switch (event.type) {
        case 'mouse':
            return `${data.action} (${data.x}, ${data.y}) ${data.target_tag || ''}`;
        case 'keyboard':
            return `${data.action} ${data.key} ${data.code || ''}`;
        case 'scroll':
            return `scroll (${data.scroll_x}, ${data.scroll_y})`;
        case 'dom_change':
            return `${data.action} ${data.target_tag || ''} ${data.target_selector || ''}`;
        case 'navigation':
            return `${data.from} → ${data.to}`;
        case 'page_load':
            return `loaded in ${data.load_time_ms}ms`;
        case 'tab_switch':
            return `${data.action} ${data.tab_title || ''}`;
        default:
            return JSON.stringify(data);
    }
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
