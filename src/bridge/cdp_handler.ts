// bridge/cdp_handler.ts
// CDP bridge handler — connects to external Chrome DevTools Protocol,
// captures Network events, and serves body events to the extension.

import http from 'node:http';
import { MAX_BODY_CAPTURE_BYTES } from '../shared/constants';
import { redact_headers, redact_url } from '../shared/redaction';

interface CdpSession {
    session_key: string;
    cdp_ws: WebSocket | null;
    port: number;
    tab_url: string;
    target_id: string | null;
    events: CdpStoredEvent[];
    created_at: number;
    max_body_bytes: number;
    body_bytes: number;
    redact_sensitive_headers: boolean;
    redact_url_query: boolean;
    connect_error: string | null; // T062: ws onerror/onclose 时记录
    // T101: idle TTL 定时器与最后活动时间
    idle_timer: ReturnType<typeof setTimeout> | null;
    last_activity: number;
}

interface CdpStoredEvent {
    request_id: string;
    tab_id: number;
    url: string;
    method: string;
    status_code: number;
    timestamp: number;
    resource_type: string;
    response_body: string | null;
    response_body_status: string;
    request_body: string | null;
    request_body_status: string;
    request_headers: Record<string, string>;
    response_headers: Record<string, string>;
    seq: number;
}

const sessions: Map<string, CdpSession> = new Map();
const CDP_DETECT_TIMEOUT_MS = 3000;
const MAX_EVENTS_PER_POLL = 100;
// T101: idle TTL（活动刷新，非固定墙钟）；events 上限防无界增长
const CDP_SESSION_IDLE_TTL_MS = 5 * 60 * 1000;
const MAX_SESSION_EVENTS = 5000;
// t140: 会话级 body 总字节预算——单条 body 可到 100MB，事件数有界但总内存无聚合上限（最坏 500GB）。
const MAX_SESSION_BODY_BYTES = 200 * 1024 * 1024; // 200MB 会话聚合
let _max_session_body_bytes = MAX_SESSION_BODY_BYTES;
export function _set_max_session_body_bytes_for_test(cap: number): void {
    _max_session_body_bytes = cap;
}
// T101 测试钩子：jsdom 下需小 cap 触发淘汰分支
let _max_session_events = MAX_SESSION_EVENTS;
export function _set_max_session_events_for_test(cap: number): void {
    _max_session_events = cap;
}

// T101: events 有界写入，超上限丢最旧（防无界增长 OOM）
// 淘汰计数（可观测指标；桥无 logging 基础设施）
export const _eviction_count = { value: 0 };
function push_bounded(session: CdpSession, event: CdpStoredEvent): void {
    session.events.push(event);
    if (session.events.length > _max_session_events) {
        const removed = session.events.shift();
        if (removed && typeof removed.response_body === 'string') {
            session.body_bytes = Math.max(0, session.body_bytes - Buffer.byteLength(removed.response_body, 'utf-8'));
        }
        _eviction_count.value += 1;
    }
}

// t140: body 总字节预算——单条 body 100MB × 5000 条最坏 500GB，聚合字节超限丢最旧带 body 事件。
// 在 getResponseBody 回写后调用（body 此时才实际入事件）。
export const _enforce_body_budget_for_test = enforce_body_budget;
function enforce_body_budget(session: CdpSession): void {
    while (session.body_bytes > _max_session_body_bytes && session.events.length > 1) {
        const removed = session.events.shift();
        if (removed && typeof removed.response_body === 'string') {
            session.body_bytes = Math.max(0, session.body_bytes - Buffer.byteLength(removed.response_body, 'utf-8'));
        }
        _eviction_count.value += 1;
    }
}

function destroy_session(session_key: string): void {
    const s = sessions.get(session_key);
    if (!s) return;
    if (s.cdp_ws) {
        try { s.cdp_ws.close(); } catch {}
    }
    if (s.idle_timer) clearTimeout(s.idle_timer);
    sessions.delete(session_key);
}

// T101: 活动事件刷新 idle TTL
function touch_session(session: CdpSession): void {
    session.last_activity = Date.now();
    if (session.idle_timer) clearTimeout(session.idle_timer);
    session.idle_timer = setTimeout(() => {
        // 仅当仍无新活动（last_activity 未被续期）才销毁
        const s = sessions.get(session.session_key);
        if (s && Date.now() - s.last_activity >= CDP_SESSION_IDLE_TTL_MS) {
            destroy_session(session.session_key);
        }
    }, CDP_SESSION_IDLE_TTL_MS);
}

export async function handle_cdp_detect(
    _req: http.IncomingMessage,
    body: Record<string, unknown>
): Promise<{ status: number; body: unknown }> {
    const port = typeof body.port === 'number' ? body.port : parseInt(String(body.port || ''), 10);
    if (!port || port < 1 || port > 65535) {
        return { status: 400, body: { ok: false, error: { code: 'INVALID_QUERY', message: 'Invalid port' } } };
    }

    try {
        const version_url = `http://127.0.0.1:${port}/json/version`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CDP_DETECT_TIMEOUT_MS);

        const version_res = await fetch(version_url, { signal: controller.signal });
        clearTimeout(timeout);
        const version_data = await version_res.json();

        const list_url = `http://127.0.0.1:${port}/json/list`;
        const list_controller = new AbortController();
        const list_timeout = setTimeout(() => list_controller.abort(), CDP_DETECT_TIMEOUT_MS);
        const list_res = await fetch(list_url, { signal: list_controller.signal });
        clearTimeout(list_timeout);
        const targets = await list_res.json() as Array<{ id: string; url: string; title: string }>;

        return {
            status: 200,
            body: {
                ok: true,
                port,
                version: version_data,
                target_count: targets.length,
                targets: targets.map(t => ({ id: t.id, url: t.url, title: t.title }))
            }
        };
    } catch {
        return {
            status: 200,
            body: { ok: false, error: { code: 'cdp_port_not_found', message: `No CDP on port ${port}` } }
        };
    }
}

export async function handle_cdp_start(
    _req: http.IncomingMessage,
    body: Record<string, unknown>
): Promise<{ status: number; body: unknown }> {
    const port = typeof body.port === 'number' ? body.port : parseInt(String(body.port || ''), 10);
    const tab_url = String(body.tab_url || '');
    // T063: max_body_capture_bytes 校验：安全整数且 0..MAX_BODY_CAPTURE_BYTES
    const raw_max = body.max_body_capture_bytes;
    const max_body_bytes = (typeof raw_max === 'number' && Number.isSafeInteger(raw_max) && raw_max >= 0 && raw_max <= MAX_BODY_CAPTURE_BYTES)
        ? raw_max
        : MAX_BODY_CAPTURE_BYTES;
    const redact_data = body.redact_data !== false;
    const redact_sensitive_headers = redact_data
        && body.redact_sensitive_headers !== false;
    const redact_url_query = redact_data && body.redact_url_query !== false;

    if (!port || port < 1 || port > 65535) {
        return { status: 400, body: { ok: false, error: { code: 'INVALID_QUERY', message: 'Invalid port' } } };
    }

    try {
        // Get available targets
        const list_url = `http://127.0.0.1:${port}/json/list`;
        const list_controller = new AbortController();
        const list_timeout = setTimeout(() => list_controller.abort(), CDP_DETECT_TIMEOUT_MS);
        const list_res = await fetch(list_url, { signal: list_controller.signal });
        clearTimeout(list_timeout);
        const targets = await list_res.json() as Array<{ id: string; url: string; title: string; webSocketDebuggerUrl: string; type?: string }>;

        if (!targets || targets.length === 0) {
            return { status: 200, body: { ok: false, error: { code: 'cdp_target_not_found', message: 'No CDP targets available' } } };
        }

        // T061: tab_url 非空时精确匹配；无匹配则 fail fast，不退回其他页面
        let target;
        if (tab_url) {
            target = targets.find(t => t.url === tab_url);
            if (!target) {
                return { status: 200, body: { ok: false, error: { code: 'cdp_target_not_found', message: `No target matching tab_url: ${tab_url}` } } };
            }
        } else {
            // tab_url 为空时退回首个 page target
            target = targets.find(t => t.type === 'page') || targets[0];
        }
        if (!target || !target.webSocketDebuggerUrl) {
            return { status: 200, body: { ok: false, error: { code: 'cdp_target_not_found', message: 'Target has no WebSocket URL' } } };
        }

        const session_key = `cdp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const session: CdpSession = {
            session_key,
            cdp_ws: null,
            port,
            tab_url,
            target_id: target.id,
            events: [],
            created_at: Date.now(),
            max_body_bytes,
            body_bytes: 0,
            redact_sensitive_headers,
            redact_url_query,
            connect_error: null,
            idle_timer: null,
            last_activity: Date.now(),
        };

        // Connect to CDP WebSocket（T101: 建立超时，onopen/超时竞速）
        const ws = new WebSocket(target.webSocketDebuggerUrl);
        let seq = 0;
        const body_seq_to_req_id = new Map<number, string>();

        const ws_connect = await new Promise<'ok' | 'timeout' | 'failed'>((resolve) => {
            const timeout = setTimeout(() => {
                // T101 f004: 超时关闭 socket，防迟到 onopen 留孤儿连接
                try { ws.close(); } catch {}
                resolve('timeout');
            }, CDP_DETECT_TIMEOUT_MS);
            ws.onopen = () => {
                clearTimeout(timeout);
                session.cdp_ws = ws;
                // Enable Network domain
                ws.send(JSON.stringify({ id: ++seq, method: 'Network.enable' }));
                resolve('ok');
            };
            ws.onerror = () => {
                clearTimeout(timeout);
                session.connect_error = 'WebSocket error';
                resolve('failed');
            };
            ws.onclose = () => {
                clearTimeout(timeout);
                session.connect_error = 'WebSocket closed';
                resolve('failed');
            };
        });
        if (ws_connect !== 'ok') {
            sessions.delete(session_key);
            // T101 f005: 区分超时与连接失败文案
            const msg = ws_connect === 'timeout'
                ? `CDP WebSocket connect timeout on port ${port}`
                : `CDP WebSocket connect failed on port ${port} (${session.connect_error})`;
            return { status: 200, body: { ok: false, error: { code: 'cdp_start_failed', message: msg } } };
        }

        ws.onmessage = (event) => {
            try {
                // T101: 任意 CDP 活动刷新 idle TTL
                touch_session(session);
                const msg = JSON.parse(event.data as string);
                if (msg.method === 'Network.responseReceived') {
                    const params = msg.params;
                    const response = params?.response;
                    const req_id = params?.requestId;
                    if (req_id && response) {
                        // Wait for loadingFinished before storing
                        const existing = session.events.find(e => e.request_id === req_id);
                        if (!existing) {
                            push_bounded(session, {
                                request_id: req_id,
                                tab_id: 0,
                                url: redact_url(
                                    response.url || '',
                                    session.redact_url_query,
                                ).url,
                                method: '',
                                status_code: response.status || 0,
                                timestamp: Date.now(),
                                resource_type: params?.type || 'other',
                                response_body: null,
                                response_body_status: 'pending',
                                request_body: null,
                                request_body_status: 'not_enabled',
                                request_headers: {},
                                response_headers: redact_headers(
                                    headers_from_cdp(response.headers || {}),
                                    session.redact_sensitive_headers,
                                ).headers,
                                seq: ++seq
                            });
                        } else {
                            existing.status_code = response.status || 0;
                            existing.response_headers = redact_headers(
                                headers_from_cdp(response.headers || {}),
                                session.redact_sensitive_headers,
                            ).headers;
                        }
                    }
                } else if (msg.method === 'Network.requestWillBeSent') {
                    const params = msg.params;
                    const request = params?.request;
                    const req_id = params?.requestId;
                    if (req_id && request) {
                        const existing = session.events.find(e => e.request_id === req_id);
                        if (!existing) {
                            push_bounded(session, {
                                request_id: req_id,
                                tab_id: 0,
                                url: redact_url(
                                    request.url || '',
                                    session.redact_url_query,
                                ).url,
                                method: request.method || 'GET',
                                status_code: 0,
                                timestamp: Date.now(),
                                resource_type: params?.type || 'other',
                                response_body: null,
                                response_body_status: 'pending',
                                request_body: null,
                                request_body_status: 'not_enabled',
                                request_headers: redact_headers(
                                    headers_from_cdp(request.headers || {}),
                                    session.redact_sensitive_headers,
                                ).headers,
                                response_headers: {},
                                seq: ++seq
                            });
                        } else {
                            existing.method = request.method || 'GET';
                            existing.request_headers = redact_headers(
                                headers_from_cdp(request.headers || {}),
                                session.redact_sensitive_headers,
                            ).headers;
                        }
                    }
                } else if (msg.method === 'Network.loadingFinished') {
                    const req_id = msg.params?.requestId;
                    if (req_id) {
                        // Fetch response body
                        ws.send(JSON.stringify({
                            id: ++seq,
                            method: 'Network.getResponseBody',
                            params: { requestId: req_id }
                        }));

                        // Store the seq mapping so we can match the response
                        body_seq_to_req_id.set(seq, req_id);
                    }
                } else if (msg.method === 'Network.loadingFailed') {
                    const req_id = msg.params?.requestId;
                    if (req_id) {
                        const event = session.events.find(e => e.request_id === req_id);
                        if (event) {
                            event.response_body_status = 'failed';
                        }
                    }
                } else if (msg.id && typeof msg.id === 'number') {
                    // Response to a command — likely getResponseBody
                    // Find the event that was waiting for this response
                    const pending_req_id = body_seq_to_req_id.get(msg.id);
                    const waiting_event = pending_req_id
                        ? session.events.find(e => e.request_id === pending_req_id && e.response_body_status === 'pending')
                        : undefined;
                    body_seq_to_req_id.delete(msg.id);
                    if (waiting_event) {
                        if (msg.result) {
                            if (msg.result.body && typeof msg.result.body === 'string') {
                                if (msg.result.base64Encoded) {
                                    waiting_event.response_body_status = 'unsupported_binary';
                                } else {
                                    let body: string = msg.result.body;
                                    const bytes = new TextEncoder().encode(body);
                                    if (bytes.length > session.max_body_bytes) {
                                        body = new TextDecoder().decode(bytes.slice(0, session.max_body_bytes));
                                        waiting_event.response_body = body;
                                        waiting_event.response_body_status = 'too_large';
                                    } else {
                                        waiting_event.response_body = body;
                                        waiting_event.response_body_status = 'captured';
                                    }
                                    // t140: body 回写后更新会话聚合字节并触发预算淘汰（超限丢最旧带 body 事件）。
                                    // 记账用实际存储长度（截断后），与淘汰减量口径一致。
                                    session.body_bytes += Math.min(bytes.length, session.max_body_bytes);
                                    enforce_body_budget(session);
                                }
                            } else {
                                waiting_event.response_body_status = 'cdp_failed';
                            }
                        } else {
                            // CDP 返回 {id, error}：资源已释放/无 stream 等，事件终态 cdp_failed
                            waiting_event.response_body_status = 'cdp_failed';
                        }
                    }
                }
            } catch {
                // ignore malformed CDP messages
            }
        };

        sessions.set(session_key, session);
        // T101: idle TTL 启动（活动刷新，非固定墙钟）
        touch_session(session);

        return { status: 200, body: { ok: true, session_key, target: { id: target.id, url: target.url, title: target.title } } };
    } catch (e) {
        return { status: 200, body: { ok: false, error: { code: 'cdp_start_failed', message: String(e) } } };
    }
}

export async function handle_cdp_events(
    _req: http.IncomingMessage,
    url: URL
): Promise<{ status: number; body: unknown }> {
    const session_key = url.searchParams.get('session_key') || '';
    const session = sessions.get(session_key);

    if (!session) {
        return { status: 404, body: { ok: false, events: [] } };
    }

    // Return completed events and remove only the returned ones from the session
    const completed: CdpStoredEvent[] = [];
    const pending: CdpStoredEvent[] = [];

    for (const evt of session.events) {
        if (evt.response_body_status !== 'pending') {
            completed.push(evt);
        } else {
            pending.push(evt);
        }
    }

    const to_return = completed.slice(0, MAX_EVENTS_PER_POLL);
    const remaining_completed = completed.slice(MAX_EVENTS_PER_POLL);
    // 未返回的 completed 事件保留到下次轮询
    session.events = pending.concat(remaining_completed);

    return {
        status: 200,
        body: { ok: true, events: to_return.map(e => ({
            request_id: e.request_id,
            tab_id: e.tab_id,
            url: e.url,
            method: e.method,
            status_code: e.status_code,
            timestamp: e.timestamp,
            resource_type: e.resource_type,
            response_body: e.response_body,
            response_body_status: e.response_body_status,
            request_body: e.request_body,
            request_body_status: e.request_body_status,
            request_headers: e.request_headers,
            response_headers: e.response_headers
        })) }
    };
}

export async function handle_cdp_stop(body: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
    const session_key = String(body.session_key || '');
    // T101: destroy 也清 idle_timer，避免泄漏
    destroy_session(session_key);

    return { status: 200, body: { ok: true } };
}

function headers_from_cdp(headers: Record<string, string>): Record<string, string> {
    return { ...headers };
}
