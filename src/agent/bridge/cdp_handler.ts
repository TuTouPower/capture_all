// agent/bridge/cdp_handler.ts
// CDP bridge handler — connects to external Chrome DevTools Protocol,
// captures Network events, and serves body events to the extension.

import http from 'node:http';
import { MAX_RESPONSE_BODY_BYTES } from '../../shared/constants';

interface CdpSession {
    session_key: string;
    cdp_ws: WebSocket | null;
    port: number;
    tab_url: string;
    target_id: string | null;
    events: CdpStoredEvent[];
    created_at: number;
    max_body_bytes: number;
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
        const list_res = await fetch(list_url);
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
    const max_body_bytes = typeof body.max_response_body_bytes === 'number'
        ? body.max_response_body_bytes
        : MAX_RESPONSE_BODY_BYTES;

    if (!port || port < 1 || port > 65535) {
        return { status: 400, body: { ok: false, error: { code: 'INVALID_QUERY', message: 'Invalid port' } } };
    }

    try {
        // Get available targets
        const list_url = `http://127.0.0.1:${port}/json/list`;
        const list_res = await fetch(list_url);
        const targets = await list_res.json() as Array<{ id: string; url: string; title: string; webSocketDebuggerUrl: string; type?: string }>;

        if (!targets || targets.length === 0) {
            return { status: 200, body: { ok: false, error: { code: 'cdp_target_not_found', message: 'No CDP targets available' } } };
        }

        // Find matching target or use first page target
        let target = targets.find(t => t.url === tab_url) || targets.find(t => t.type === 'page') || targets[0];
        if (!target.webSocketDebuggerUrl) {
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
            max_body_bytes
        };

        // Connect to CDP WebSocket
        const ws = new WebSocket(target.webSocketDebuggerUrl);
        let seq = 0;

        ws.onopen = () => {
            session.cdp_ws = ws;
            // Enable Network domain
            ws.send(JSON.stringify({ id: ++seq, method: 'Network.enable' }));
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data as string);
                if (msg.method === 'Network.responseReceived') {
                    const params = msg.params;
                    const response = params?.response;
                    const req_id = params?.requestId;
                    if (req_id && response) {
                        // Wait for loadingFinished before storing
                        const existing = session.events.find(e => e.request_id === req_id);
                        if (!existing) {
                            session.events.push({
                                request_id: req_id,
                                tab_id: 0,
                                url: response.url || '',
                                method: '',
                                status_code: response.status || 0,
                                timestamp: Date.now(),
                                resource_type: params?.type || 'other',
                                response_body: null,
                                response_body_status: 'pending',
                                request_body: null,
                                request_body_status: 'not_enabled',
                                request_headers: {},
                                response_headers: headers_from_cdp(response.headers || {}),
                                seq: ++seq
                            });
                        } else {
                            existing.status_code = response.status || 0;
                            existing.response_headers = headers_from_cdp(response.headers || {});
                        }
                    }
                } else if (msg.method === 'Network.requestWillBeSent') {
                    const params = msg.params;
                    const request = params?.request;
                    const req_id = params?.requestId;
                    if (req_id && request) {
                        const existing = session.events.find(e => e.request_id === req_id);
                        if (!existing) {
                            session.events.push({
                                request_id: req_id,
                                tab_id: 0,
                                url: request.url || '',
                                method: request.method || 'GET',
                                status_code: 0,
                                timestamp: Date.now(),
                                resource_type: params?.type || 'other',
                                response_body: null,
                                response_body_status: 'pending',
                                request_body: null,
                                request_body_status: 'not_enabled',
                                request_headers: headers_from_cdp(request.headers || {}),
                                response_headers: {},
                                seq: ++seq
                            });
                        } else {
                            existing.method = request.method || 'GET';
                            existing.request_headers = headers_from_cdp(request.headers || {});
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
                        const event = session.events.find(e => e.request_id === req_id);
                        if (event) {
                            (event as any)._body_seq = seq;
                        }
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
                    const waiting_event = session.events.find(
                        e => (e as any)._body_seq === msg.id && e.response_body_status === 'pending'
                    );
                    if (waiting_event && msg.result) {
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
                            }
                        } else {
                            waiting_event.response_body_status = 'cdp_failed';
                        }
                        delete (waiting_event as any)._body_seq;
                    }
                }
            } catch {
                // ignore malformed CDP messages
            }
        };

        ws.onerror = () => {
            session.cdp_ws = null;
        };

        ws.onclose = () => {
            session.cdp_ws = null;
        };

        sessions.set(session_key, session);

        // Auto-cleanup after 5 minutes of inactivity
        setTimeout(() => {
            const s = sessions.get(session_key);
            if (s && s.cdp_ws) {
                try { s.cdp_ws.close(); } catch {}
            }
            sessions.delete(session_key);
        }, 5 * 60 * 1000);

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

    // Return completed events and remove them from the session
    const completed: CdpStoredEvent[] = [];
    const pending: CdpStoredEvent[] = [];

    for (const evt of session.events) {
        if (evt.response_body_status !== 'pending') {
            completed.push(evt);
        } else {
            pending.push(evt);
        }
    }

    session.events = pending;
    const to_return = completed.slice(0, MAX_EVENTS_PER_POLL);

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
    const session = sessions.get(session_key);

    if (session && session.cdp_ws) {
        try { session.cdp_ws.close(); } catch {}
    }
    sessions.delete(session_key);

    return { status: 200, body: { ok: true } };
}

function headers_from_cdp(headers: Record<string, string>): Record<string, string> {
    return { ...headers };
}
