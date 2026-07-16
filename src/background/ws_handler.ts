// background/ws_handler.ts
// WebSocket connection and frame handling for network capture.
// Handles: webSocketCreated, webSocketWillSendHandshakeRequest, webSocketHandshakeResponseReceived,
//          webSocketFrameSent, webSocketFrameReceived, webSocketFrameError, webSocketClosed

import type { NetworkRequestData, WsFrameData, BodyCaptureStatus } from '../shared/types';
import { create_base_event } from '../shared/event_utils';
import type { WsConnectionMeta, NetworkCaptureConfig, NetworkEventPayload } from './cdp_handler';
import { base64_decoded_size } from './cdp_handler';

export interface WsHandlerState {
    capture_id: string;
    start_time: number;
    current_tab_id: number;
    config: NetworkCaptureConfig;
    dbg_tab_id: number | null;
    ws_connections: Map<string, WsConnectionMeta>;
    send_to_background: (payload: NetworkEventPayload) => void;
}

export function send_ws_connection_event(req_id: string, conn: WsConnectionMeta, ws_status: WsConnectionMeta['ws_status'], state: WsHandlerState): void {
    const event = create_base_event({
        capture_id: state.capture_id,
        category: 'network',
        type: 'network_request',
        relative_time_ms: Date.now() - state.start_time,
        tab_id: state.dbg_tab_id ?? state.current_tab_id,
        url: conn.url,
        source: 'background',
        severity: 'info',
    });
    const data: NetworkRequestData = {
        capture_id: event.capture_id,
        event_id: event.event_id,
        request_id: req_id,
        method: '',
        url: conn.url,
        url_status: 'captured',
        status_code: conn.status_code || null,
        status_text: null,
        protocol: null,
        resource_type: 'websocket',
        initiator: null,
        duration_ms: null,
        start_time_ms: conn.created_ts,
        end_time_ms: ws_status === 'closed' ? Date.now() : null,
        request_headers: conn.request_headers,
        response_headers: conn.response_headers,
        headers_status: 'captured',
        request_body: null,
        request_body_status: 'not_enabled',
        request_body_encoding: null,
        request_body_bytes: null,
        request_body_mime: null,
        response_body: null,
        response_preview: null,
        response_body_status: 'not_enabled',
        response_body_encoding: null,
        response_body_bytes: null,
        mime_type: null,
        request_size_bytes: null,
        response_size_bytes: null,
        transfer_size_bytes: null,
        from_cache: null,
        cache_status: null,
        error_text: null,
        capture_method: 'cdp_websocket',
        body_capture_mode: 'none',
        ws_connection_id: req_id,
        ws_status,
    };
    state.send_to_background({ event, data });
}

export function send_ws_frame(req_id: string, direction: 'sent' | 'received', params: any, state: WsHandlerState): void {
    const resp = params?.response || {};
    // 仅拦截 undefined（CDP 控制帧不携带 payloadData），保留空字符串（合法 payload）
    const raw_payload = resp.payloadData === undefined ? null : resp.payloadData;
    const is_binary = resp.opcode === 2;
    let payload: string | null = null;
    let payload_encoding: 'utf8' | 'base64' | null = null;
    let payload_status: BodyCaptureStatus = 'captured';
    let payload_bytes: number | null = null;

    if (raw_payload !== null) {
        payload_bytes = is_binary
            ? base64_decoded_size(raw_payload)
            : new TextEncoder().encode(raw_payload).length;
        if (payload_bytes > state.config.max_body_capture_bytes) {
            const max_chars = is_binary
                ? Math.floor(state.config.max_body_capture_bytes * 4 / 3)
                : state.config.max_body_capture_bytes;
            payload = raw_payload.slice(0, max_chars);
            payload_status = 'too_large';
        } else {
            payload = raw_payload;
        }
        payload_encoding = is_binary ? 'base64' : 'utf8';
    }

    const conn = state.ws_connections.get(req_id);
    const frame_data: WsFrameData = {
        ws_connection_id: req_id,
        direction,
        opcode: resp.opcode ?? null,
        payload,
        payload_encoding,
        payload_bytes,
        payload_status,
        mask: resp.mask ?? null,
        error_message: null,
        url: conn?.url || '',
        tab_id: state.dbg_tab_id ?? undefined,
    };
    const event = create_base_event({
        capture_id: state.capture_id,
        category: 'network',
        type: 'ws_frame',
        relative_time_ms: (params?.timestamp ? params.timestamp * 1000 : Date.now()) - state.start_time,
        tab_id: state.dbg_tab_id ?? state.current_tab_id,
        url: frame_data.url,
        source: 'background',
        severity: 'info',
    });
    state.send_to_background({ event, data: frame_data });
}

export function handle_ws_created(req_id: string, params: any, state: WsHandlerState): void {
    const ws_url = params?.url || '';
    const conn: WsConnectionMeta = {
        url: ws_url,
        request_headers: {},
        response_headers: {},
        status_code: 0,
        ws_status: 'connecting',
        created_ts: Date.now(),
    };
    state.ws_connections.set(req_id, conn);
    send_ws_connection_event(req_id, conn, 'connecting', state);
}

export function handle_ws_handshake_request(req_id: string, params: any, state: WsHandlerState): void {
    const conn = state.ws_connections.get(req_id);
    if (conn) {
        conn.request_headers = { ...(params?.request?.headers || {}) };
    }
}

export function handle_ws_handshake_response(req_id: string, params: any, state: WsHandlerState): void {
    const conn = state.ws_connections.get(req_id);
    if (conn) {
        conn.response_headers = { ...(params?.response?.headers || {}) };
        conn.status_code = params?.response?.status || 101;
        conn.ws_status = 'open';
        send_ws_connection_event(req_id, conn, 'open', state);
    }
}

export function handle_ws_frame_error(req_id: string, params: any, state: WsHandlerState): void {
    const frame_data: WsFrameData = {
        ws_connection_id: req_id,
        direction: 'error',
        opcode: null,
        payload: null,
        payload_encoding: null,
        payload_bytes: null,
        payload_status: 'captured',
        mask: null,
        error_message: params?.errorMessage || null,
        url: state.ws_connections.get(req_id)?.url || '',
        tab_id: state.dbg_tab_id ?? undefined,
    };
    const event = create_base_event({
        capture_id: state.capture_id,
        category: 'network',
        type: 'ws_frame',
        relative_time_ms: Date.now() - state.start_time,
        tab_id: state.dbg_tab_id ?? state.current_tab_id,
        url: frame_data.url,
        source: 'background',
        severity: 'warning',
    });
    state.send_to_background({ event, data: frame_data });
}

export function handle_ws_closed(req_id: string, state: WsHandlerState): void {
    const conn = state.ws_connections.get(req_id);
    if (conn) {
        conn.ws_status = 'closed';
        send_ws_connection_event(req_id, conn, 'closed', state);
        state.ws_connections.delete(req_id);
    }
}
