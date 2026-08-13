// bridge/cdp_handler.ts
// CDP bridge handler — connects to external Chrome DevTools Protocol,
// captures Network events, and serves body events to the extension.

import http from 'node:http';
import { MAX_BODY_CAPTURE_BYTES } from '../shared/constants';
import { redact_headers, redact_url } from '../shared/redaction';
import { bridge_warn } from './logger';

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
    // t157: getResponseBody 命令 seq → request_id 映射（挂 session 供淘汰路径清理）
    body_seq_to_req_id: Map<number, string>;
    // t157 AC-005: 事件数淘汰产生的 evicted 终态待返回队列（不占 events 上限）
    evicted_events: CdpStoredEvent[];
    // t158: 建连成功后 WS close/error 导致的 terminal 标记（幂等；session 保留供 /cdp/events 返回 410）
    terminal_reason: string | null;
    terminal_message: string | null;
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
const MAX_EVICTED_EVENTS = MAX_SESSION_EVENTS; // t157: evicted 待返回队列上限，防无界增长（已终态事件，超限丢最旧）
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
// t157 测试钩子：evicted 队列上限
let _max_evicted_events = MAX_EVICTED_EVENTS;
export function _set_max_evicted_events_for_test(cap: number): void {
    _max_evicted_events = cap;
}
// t157 测试钩子：读 session 内部状态（body_bytes / events）断言账本
export function _get_session_for_test(session_key: string): CdpSession | null {
    return sessions.get(session_key) ?? null;
}

// t157: 事件移除时的账本递减——从 events 移除事件时按实际存储 response_body UTF-8 字节递减 body_bytes。
// 所有移除路径（poll 返回、事件数淘汰、body 预算淘汰）都必须走这里，禁止多路径各自维护计数。
// 本函数只递减账本；事件数组的移除由各调用方负责。
function decrement_body_bytes(session: CdpSession, evt: CdpStoredEvent): void {
    if (typeof evt.response_body === 'string') {
        session.body_bytes = Math.max(0, session.body_bytes - Buffer.byteLength(evt.response_body, 'utf-8'));
    }
}

// t157: 清理某 request 的 getResponseBody 命令映射，防迟到响应误匹配已淘汰事件
function clear_body_seq(session: CdpSession, request_id: string): void {
    for (const [seq, req_id] of session.body_seq_to_req_id) {
        if (req_id === request_id) {
            session.body_seq_to_req_id.delete(seq);
        }
    }
}

// T101: events 有界写入，超上限丢最旧（防无界增长 OOM）
// 淘汰计数（可观测指标；B1-M13 淘汰补结构化日志）
export const _eviction_count = { value: 0 };
function push_bounded(session: CdpSession, event: CdpStoredEvent): void {
    session.events.push(event);
    if (session.events.length <= _max_session_events) return;
    // t157 AC-005: 事件数淘汰若删到 pending，不静默消失——转 evicted 终态进独立待返回队列，
    // 并清理 command 映射（防迟到 getResponseBody 响应误匹配）；events 数组严格保持 ≤ 上限。
    const removed = session.events.shift();
    if (removed && removed.response_body_status === 'pending') {
        removed.response_body_status = 'evicted';
        clear_body_seq(session, removed.request_id);
        session.evicted_events.push(removed);
        // t157 f005: evicted 队列有界——超限丢最旧已终态事件（不违反 AC-005：已终态无等待语义）
        if (session.evicted_events.length > _max_evicted_events) {
            session.evicted_events.shift();
        }
    } else if (removed) {
        decrement_body_bytes(session, removed);
    }
    _eviction_count.value += 1;
    bridge_warn('cdp_event_evicted', { session_key: session.session_key, reason: 'event_count_cap', events: session.events.length });
}

// t140: body 总字节预算——单条 body 100MB × 5000 条最坏 500GB，聚合字节超限丢最旧带 body 事件。
// 在 getResponseBody 回写后调用（body 此时才实际入事件）。
export const _enforce_body_budget_for_test = enforce_body_budget;
function enforce_body_budget(session: CdpSession): void {
    while (session.body_bytes > _max_session_body_bytes) {
        // t157 AC-003: 只淘汰「已终态且确有 response_body」的最旧事件，pending 元数据不得偿还 body 预算
        const idx = session.events.findIndex(e => typeof e.response_body === 'string');
        if (idx === -1) break; // 无带 body 事件（全 pending 或 body 已置 null），无可释放
        const victim = session.events[idx];
        const bytes = Buffer.byteLength(victim.response_body as string, 'utf-8');
        // t157 AC-004: 只剩唯一带 body 事件（数组里可有 pending 元数据）——无法通过淘汰降到预算内，
        // 保留请求元数据，body 置 null 标 too_large，事件仍可被 /cdp/events 返回。
        const has_other_body = session.events.some((e, i) => i !== idx && typeof e.response_body === 'string');
        if (!has_other_body) {
            victim.response_body = null;
            victim.response_body_status = 'too_large';
            session.body_bytes = Math.max(0, session.body_bytes - bytes);
            bridge_warn('cdp_body_too_large', { session_key: session.session_key, request_id: victim.request_id, body_bytes: bytes });
            break;
        }
        session.events.splice(idx, 1);
        session.body_bytes = Math.max(0, session.body_bytes - bytes);
        _eviction_count.value += 1;
        bridge_warn('cdp_event_evicted', { session_key: session.session_key, reason: 'body_budget_cap', body_bytes: session.body_bytes });
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

// t158: 建连成功后 WS 异常关闭/错误 → 终态化 session（幂等）。
// 终态化所有 pending 事件、关闭 WS；session 保留在 map 中供 /cdp/events 返回 410（terminal 可观察），
// 并设 terminal TTL（5 分钟）自动销毁——即使调用方不主动 stop，内存也被回收（t158 f001）。
function terminate_session(session: CdpSession, reason: string, message: string): void {
    if (session.terminal_reason) return; // 幂等
    session.terminal_reason = reason;
    session.terminal_message = message;
    // 终态化 pending 事件（不再永久 pending）
    for (const evt of session.events) {
        if (evt.response_body_status === 'pending') {
            evt.response_body_status = 'cdp_failed';
        }
    }
    // getResponseBody 命令不会再有响应，清理映射
    session.body_seq_to_req_id.clear();
    // 关闭 WS
    if (session.cdp_ws) {
        try { session.cdp_ws.close(); } catch {}
        session.cdp_ws = null;
    }
    // terminal TTL：保留供 410 观察后自动销毁（destroy_session 幂等，stop 提前销毁也无害）
    if (session.idle_timer) clearTimeout(session.idle_timer);
    session.idle_timer = setTimeout(() => {
        destroy_session(session.session_key);
    }, CDP_SESSION_IDLE_TTL_MS);
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

        // t170 SEC-002: discovery 返回的 WebSocket URL 不可信（占用 loopback 端口的恶意服务可返回
        // 远端 wss:// 目标）。校验 scheme/host/port/credentials 后，用 target ID 自行构造
        // 已知 loopback URL（ws://127.0.0.1:{port}/devtools/page/{id}），不信任 discovery authority。
        const ws_url = safe_cdp_ws_url(target, port);
        if (!ws_url) {
            return {
                status: 400,
                body: {
                    ok: false,
                    error: {
                        code: 'cdp_invalid_ws_url',
                        message: 'CDP WebSocket URL must be ws:// on loopback with the requested port',
                    },
                },
            };
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
            body_seq_to_req_id: new Map<number, string>(),
            evicted_events: [],
            terminal_reason: null,
            terminal_message: null,
        };

        // Connect to CDP WebSocket（T101: 建立超时，onopen/超时竞速；t170: 使用校验后的 loopback URL）
        const ws = new WebSocket(ws_url);
        let seq = 0;
        const body_seq_to_req_id = session.body_seq_to_req_id;

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
            // B1-M13: CDP 连接失败补结构化日志
            bridge_warn('cdp_connect_failed', { session_key, port, connect: ws_connect, reason: session.connect_error });
            return { status: 200, body: { ok: false, error: { code: 'cdp_start_failed', message: msg } } };
        }

        // t158: 建连成功后安装运行态 close/error 处理——WS 中断即终态化 session（
        // 替代 t101 建连期 handler：后者只 resolve 已 settled promise，不清理、不暴露 failure）。
        ws.onclose = () => {
            terminate_session(session, 'ws_closed', 'CDP WebSocket closed');
        };
        ws.onerror = () => {
            // onerror 后通常伴随 onclose；不单独终态，避免双路径竞态
        };

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
                                    // 记账用实际存储字符串字节（截断后），与淘汰减量口径一致。
                                    session.body_bytes += new TextEncoder().encode(body).length;
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
            } catch (err) {
                // B1-M13: 畸形/异常 CDP 消息补结构化日志（不再静默吞）
                bridge_warn('cdp_message_parse_failed', { session_key: session.session_key, error: String(err) });
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

    // t158: terminal session 返回 410 + 终态化后的全部事件（含 evicted 待返回，不静默消失）+ 结构化错误
    // （d007: 410 Gone 语义；stop 销毁后为 404，与 terminal 区分）。
    if (session.terminal_reason) {
        return {
            status: 410,
            body: {
                ok: false,
                events: [...session.events, ...session.evicted_events].map(serialize_cdp_event),
                error: {
                    code: 'cdp_session_terminal',
                    reason: session.terminal_reason,
                    message: session.terminal_message,
                },
            },
        };
    }

    // Return completed events and remove only the returned ones from the session
    // t157 AC-001: 返回时按实际 response_body 字节递减 body_bytes（统一走 decrement_body_bytes），
    // 预算只统计当前驻留事件字节，不再退化为累计写入量。
    // t157 AC-005: evicted 待返回队列优先返回（pending 淘汰产生的可观察终态，不占 events 上限）。
    const evicted_batch = session.evicted_events.splice(0, MAX_EVENTS_PER_POLL);

    const completed: CdpStoredEvent[] = [];
    const pending: CdpStoredEvent[] = [];

    for (const evt of session.events) {
        if (evt.response_body_status !== 'pending') {
            completed.push(evt);
        } else {
            pending.push(evt);
        }
    }

    const completed_slot = MAX_EVENTS_PER_POLL - evicted_batch.length;
    const to_return_completed = completed.slice(0, completed_slot);
    const remaining_completed = completed.slice(completed_slot);
    // 未返回的 completed 事件保留到下次轮询
    session.events = pending.concat(remaining_completed);
    for (const evt of evicted_batch) {
        decrement_body_bytes(session, evt);
    }
    for (const evt of to_return_completed) {
        decrement_body_bytes(session, evt);
    }
    const to_return = evicted_batch.concat(to_return_completed);

    return {
        status: 200,
        body: { ok: true, events: to_return.map(serialize_cdp_event) }
    };
}

// t158: 事件序列化（terminal 410 与正常 200 共用同一输出形态）
function serialize_cdp_event(e: CdpStoredEvent): Record<string, unknown> {
    return {
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

// t170 SEC-002: CDP WebSocket URL allowlist——仅允许 ws: scheme + loopback host + 请求 port；
// 拒绝 credentials/fragment/wss:/远端 host。校验通过后用 target ID 自行构造 loopback URL
// （标准 CDP page target 路径 ws://127.0.0.1:{port}/devtools/page/{id}），不信任 discovery authority。
function safe_cdp_ws_url(target: { id: string; webSocketDebuggerUrl: string }, port: number): string | null {
    if (!target.id) return null;
    try {
        const u = new URL(target.webSocketDebuggerUrl);
        if (u.protocol !== 'ws:') return null;
        const host = u.hostname;
        const is_loopback = host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1';
        if (!is_loopback) return null;
        if (u.port === '' || Number(u.port) !== port) return null;
        if (u.username || u.password) return null;
        if (u.hash) return null;
    } catch {
        return null;
    }
    return `ws://127.0.0.1:${port}/devtools/page/${encodeURIComponent(target.id)}`;
}
