// background/exporter.ts
import { escape_for_html_embed } from '../shared/escape';
import { get_capture, get_events_by_category, get_network_requests, get_console_events } from './storage';
import { get_app_log_transport } from './app_log_storage';
import { load_user_config } from '../shared/user_config';
import { add_absolute_system_time, add_capture_system_times, add_system_times_to_capture_data, format_system_time } from '../shared/system_time';
import type { NetworkRequestData, CaptureRecord, UserConfig, LogLevel } from '../shared/types';
import type { ExportableCaptureData } from '../shared/system_time';

export interface ExportOptions {
    include_response_body?: boolean;
}

function strip_response_body(requests: NetworkRequestData[], options?: ExportOptions): NetworkRequestData[] {
    if (options?.include_response_body === false) {
        return requests.map(({ response_body: _omit, ...rest }) => rest as NetworkRequestData);
    }
    return requests;
}

export async function export_json(capture_id: string, options?: ExportOptions): Promise<string> {
    const capture = await get_capture(capture_id);
    if (!capture) throw new Error('Capture not found');

    const [user_events, nav_events, network_requests_raw, console_logs, error_events, storage_changes, cookie_changes] = await Promise.all([
        get_events_by_category(capture_id, 'user_action', 0, 100000),
        get_events_by_category(capture_id, 'navigation', 0, 100000),
        get_network_requests(capture_id, 0, 100000),
        get_console_events(capture_id, 0, 100000),
        get_events_by_category(capture_id, 'error', 0, 100000),
        get_events_by_category(capture_id, 'storage', 0, 100000),
        get_events_by_category(capture_id, 'cookie', 0, 100000)
    ]);

    const network_requests = strip_response_body(network_requests_raw, options);
    const all_events = [...user_events, ...nav_events, ...error_events, ...storage_changes, ...cookie_changes]
        .sort((a, b) => (a.relative_time_ms ?? 0) - (b.relative_time_ms ?? 0));

    const user_config = await load_user_config();
    const data: ExportableCaptureData = { capture, events: all_events, network_requests, console_events: console_logs };
    const result = add_system_times_to_capture_data(data, user_config);
    return JSON.stringify(result);
}

export async function export_jsonl(capture_id: string, options?: ExportOptions): Promise<string> {
    const session = await get_capture(capture_id);
    if (!session) throw new Error('Capture not found');

    const [user_events, nav_events, network_requests_raw, console_logs, error_events, storage_changes, cookie_changes] = await Promise.all([
        get_events_by_category(capture_id, 'user_action', 0, 100000),
        get_events_by_category(capture_id, 'navigation', 0, 100000),
        get_network_requests(capture_id, 0, 100000),
        get_console_events(capture_id, 0, 100000),
        get_events_by_category(capture_id, 'error', 0, 100000),
        get_events_by_category(capture_id, 'storage', 0, 100000),
        get_events_by_category(capture_id, 'cookie', 0, 100000)
    ]);

    const network_requests = strip_response_body(network_requests_raw, options);
    const all_events = [...user_events, ...nav_events, ...error_events, ...storage_changes, ...cookie_changes]
        .sort((a, b) => (a.relative_time_ms ?? 0) - (b.relative_time_ms ?? 0));

    const user_config = await load_user_config();
    const lines: string[] = [];
    lines.push(JSON.stringify({ ...add_capture_system_times(session, user_config), type: 'capture' }));

    for (const event of all_events) {
        lines.push(JSON.stringify({ ...add_absolute_system_time(event, user_config), type: 'event' }));
    }
    for (const req of network_requests) {
        lines.push(JSON.stringify({ ...add_absolute_system_time(req, user_config), type: 'network_request' }));
    }
    for (const log of console_logs) {
        lines.push(JSON.stringify({ ...add_absolute_system_time(log, user_config), type: 'console_log' }));
    }

    return lines.join('\n');
}

export async function export_html(capture_id: string, options?: ExportOptions): Promise<string> {
    const session = await get_capture(capture_id);
    if (!session) throw new Error('Capture not found');

    const [user_events, nav_events, network_requests_raw, console_logs, error_events, storage_changes, cookie_changes] = await Promise.all([
        get_events_by_category(capture_id, 'user_action', 0, 100000),
        get_events_by_category(capture_id, 'navigation', 0, 100000),
        get_network_requests(capture_id, 0, 100000),
        get_console_events(capture_id, 0, 100000),
        get_events_by_category(capture_id, 'error', 0, 100000),
        get_events_by_category(capture_id, 'storage', 0, 100000),
        get_events_by_category(capture_id, 'cookie', 0, 100000)
    ]);

    const network_requests = strip_response_body(network_requests_raw, options);
    const all_events = [...user_events, ...nav_events, ...error_events, ...storage_changes, ...cookie_changes]
        .sort((a, b) => (a.relative_time_ms ?? 0) - (b.relative_time_ms ?? 0));

    const user_config = await load_user_config();
    const data: ExportableCaptureData = { capture: session, events: all_events, network_requests, console_events: console_logs };
    const result = add_system_times_to_capture_data(data, user_config);
    const json_str = JSON.stringify(result);
    const safe_json = escape_for_html_embed(json_str);

    const start_date = format_system_time(session.started_at, user_config);
    const duration_ms = session.ended_at ? new Date(session.ended_at).getTime() - new Date(session.started_at).getTime() : 0;
    const duration_str = format_duration(duration_ms);

    const event_count = session.stats.event_count || all_events.length;
    const request_count = session.stats.request_count || network_requests.length;
    const log_count = session.stats.log_count || console_logs.length;

    const total_size_kb = Math.round(
        (event_count + request_count + log_count) * 0.5
    );

    const body_capture_info = session.body_capture_mode
        ? `<div class="summary-item"><label>Body Capture</label><span>${session.body_capture_mode} · ${session.body_capture_status || 'unknown'}</span></div>`
        : '';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Capture All - Capture ${capture_id}</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; color: #333; }
.container { max-width: 960px; margin: 0 auto; }
h1 { font-size: 20px; margin-bottom: 8px; }
.summary { background: white; border-radius: 8px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.summary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.summary-item label { font-size: 11px; color: #666; display: block; }
.summary-item span { font-weight: 500; font-size: 14px; }
details { background: white; border-radius: 8px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
summary { cursor: pointer; font-weight: 500; }
pre { background: #f8f8f8; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px; max-height: 500px; overflow-y: auto; }
.footer { text-align: center; padding: 16px; color: #999; font-size: 11px; }
</style>
</head>
<body>
<div class="container">
<h1>Capture All - Capture Report</h1>
<div class="summary">
  <div class="summary-grid">
    <div class="summary-item"><label>Capture ID</label><span>${capture_id}</span></div>
    <div class="summary-item"><label>Start Time</label><span>${start_date}</span></div>
    <div class="summary-item"><label>Duration</label><span>${duration_str}</span></div>
    <div class="summary-item"><label>Events</label><span>${event_count}</span></div>
    <div class="summary-item"><label>Network Requests</label><span>${request_count}</span></div>
    <div class="summary-item"><label>Console Logs</label><span>${log_count}</span></div>
    <div class="summary-item"><label>Est. Size</label><span>${total_size_kb} KB</span></div>
${body_capture_info}
  </div>
</div>

<details>
  <summary>View Raw Data (JSON)</summary>
  <pre id="jsonData"></pre>
</details>

<div class="footer">Generated by Capture All</div>
</div>
<script>
const data = JSON.parse('${safe_json}');
document.getElementById('jsonData').textContent = JSON.stringify(data, null, 2);
</script>
</body>
</html>`;
}

export async function export_har(capture_id: string, options?: ExportOptions): Promise<string> {
    const session = await get_capture(capture_id);
    if (!session) throw new Error('Capture not found');

    const network_requests_raw = await get_network_requests(capture_id, 0, 100000);
    const network_requests = strip_response_body(network_requests_raw, options);
    const user_config = await load_user_config();
    const har = build_har(session, network_requests, user_config);
    return JSON.stringify(har, null, 2);
}

interface HarNameValue { name: string; value: string; }

interface HarEntry {
    startedDateTime: string;
    time: number;
    request: {
        method: string;
        url: string;
        httpVersion: string;
        headers: HarNameValue[];
        queryString: HarNameValue[];
        postData?: { mimeType: string; text: string };
        headersSize: number;
        bodySize: number;
    };
    response: {
        status: number;
        statusText: string;
        httpVersion: string;
        headers: HarNameValue[];
        cookies: HarNameValue[];
        content: { size: number; mimeType: string; text?: string };
        redirectURL: string;
        headersSize: number;
        bodySize: number;
    };
    cache: Record<string, never>;
    timings: { send: number; wait: number; receive: number };
    _resourceType?: string;
    _startedDateTimeSystemTime: string;
}

interface HarPage {
    startedDateTime: string;
    _startedDateTimeSystemTime: string;
    id: string;
    title: string;
    pageTimings: {
        onContentLoad: number;
        onLoad: number;
    };
}

interface HarLog {
    log: {
        version: string;
        creator: { name: string; version: string };
        browser: { name: string; version: string };
        pages: HarPage[];
        entries: HarEntry[];
    };
}

function build_har(session: CaptureRecord, requests: NetworkRequestData[], user_config: Pick<UserConfig, 'system_time_timezone'>): HarLog {
    const entries = requests.map(r => build_har_entry(r, user_config));
    const started_at_ms = new Date(session.started_at).getTime();
    const ended_at_ms = session.ended_at ? new Date(session.ended_at).getTime() : -1;
    return {
        log: {
            version: '1.2',
            creator: { name: 'capture_all', version: '1.0' },
            browser: { name: 'Chrome', version: 'unknown' },
            pages: [{
                startedDateTime: new Date(started_at_ms).toISOString(),
                _startedDateTimeSystemTime: format_system_time(session.started_at, user_config),
                id: session.capture_id,
                title: `Capture ${session.capture_id}`,
                pageTimings: {
                    onContentLoad: -1,
                    onLoad: ended_at_ms > 0 ? ended_at_ms - started_at_ms : -1
                }
            }],
            entries
        }
    };
}

function build_har_entry(r: NetworkRequestData, user_config: Pick<UserConfig, 'system_time_timezone'>): HarEntry {
    const req_headers = headers_to_array(r.request_headers);
    const res_headers = headers_to_array(r.response_headers);
    const query_string = parse_query_string(r.url);
    const req_mime = get_header(r.request_headers, 'content-type') || 'application/octet-stream';
    const res_mime = get_header(r.response_headers, 'content-type') || 'application/octet-stream';
    const duration = Math.max(0, r.duration_ms || 0);

    // Use request start_time_ms as absolute time proxy (relative to capture start)
    const abs_time_ms = r.start_time_ms ?? 0;

    const entry: HarEntry = {
        startedDateTime: new Date(abs_time_ms).toISOString(),
        _startedDateTimeSystemTime: format_system_time(abs_time_ms, user_config),
        time: duration,
        request: {
            method: (r.method || 'GET').toUpperCase(),
            url: r.url || '',
            httpVersion: 'HTTP/1.1',
            headers: req_headers,
            queryString: query_string,
            headersSize: -1,
            bodySize: r.request_body ? r.request_body.length : (has_body_method(r.method) ? 0 : -1)
        },
        response: {
            status: r.status_code || 0,
            statusText: status_text(r.status_code ?? 0),
            httpVersion: 'HTTP/1.1',
            headers: res_headers,
            cookies: [],
            content: {
                size: r.response_body ? r.response_body.length : (r.response_body_bytes ?? 0),
                mimeType: res_mime,
                ...(r.response_body ? { text: r.response_body } : {})
            },
            redirectURL: get_header(r.response_headers, 'location') || '',
            headersSize: -1,
            bodySize: r.response_body ? r.response_body.length : -1
        },
        cache: {},
        timings: { send: 0, wait: duration, receive: 0 },
        _resourceType: r.resource_type
    };

    if (r.request_body) {
        entry.request.postData = { mimeType: req_mime, text: r.request_body };
    }

    return entry;
}

function headers_to_array(h: Record<string, string> | null | undefined): HarNameValue[] {
    if (!h) return [];
    return Object.entries(h).map(([name, value]) => ({ name, value: String(value ?? '') }));
}

function get_header(h: Record<string, string> | null | undefined, name: string): string | null {
    if (!h) return null;
    const lower = name.toLowerCase();
    for (const k of Object.keys(h)) {
        if (k.toLowerCase() === lower) return h[k];
    }
    return null;
}

function parse_query_string(url: string): HarNameValue[] {
    if (!url) return [];
    const q_idx = url.indexOf('?');
    if (q_idx < 0) return [];
    const qs = url.slice(q_idx + 1).split('#')[0];
    if (!qs) return [];
    return qs.split('&').filter(Boolean).map(pair => {
        const eq = pair.indexOf('=');
        const name = eq < 0 ? pair : pair.slice(0, eq);
        const value = eq < 0 ? '' : pair.slice(eq + 1);
        return { name: safe_decode(name), value: safe_decode(value) };
    });
}

function safe_decode(s: string): string {
    try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; }
}

function has_body_method(method: string): boolean {
    const m = (method || '').toUpperCase();
    return m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE';
}

function status_text(code: number): string {
    const map: Record<number, string> = {
        200: 'OK', 201: 'Created', 204: 'No Content',
        301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
        400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
        500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable'
    };
    return map[code] || '';
}

function format_duration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return hours + 'h ' + (minutes % 60) + 'm ' + (seconds % 60) + 's';
    return minutes + 'm ' + (seconds % 60) + 's';
}

// ============================================================
// App log export
// ============================================================

export interface ExportAppLogsOptions {
    format?: 'log';
    level?: LogLevel;
    module?: string;
    since?: number;
    until?: number;
}

export async function export_app_logs(options: ExportAppLogsOptions = {}): Promise<string> {
    const transport = get_app_log_transport();
    // Flush pending buffer entries before querying IndexedDB
    await transport.flush();
    const entries = await transport.get_entries(100000, 0, {
        level: options.level,
        module: options.module,
        since: options.since,
        until: options.until,
    });
    const user_config = await load_user_config();

    return entries.map(entry => {
        const time = format_system_time(entry.timestamp, user_config);
        const details = entry.details === undefined ? '' : ` ${JSON.stringify(entry.details)}`;
        return `${time} [${entry.level}] [${entry.module}] ${entry.message}${details}`;
    }).join('\n');
}
