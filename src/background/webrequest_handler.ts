// background/webrequest_handler.ts
// webRequest API event handling for network capture.
// Handles: onBeforeRequest, onBeforeSendHeaders, onHeadersReceived, onCompleted, onErrorOccurred

import type { NetworkRequestData, BodyCaptureStatus } from '../shared/types';
import { create_base_event } from '../shared/event_utils';
import { redact_headers, redact_url } from '../shared/redaction';
import { Logger } from '../shared/logger';
import { get_app_log_transport } from './app_log_storage';
import { headers_array_to_map, resolve_resource_type, extract_mime_type, extract_request_body } from './network_webrequest';
import type { PendingRequest, CdpRequestMeta, CdpBodyResult, NetworkCaptureConfig, NetworkEventPayload } from './cdp_handler';

const logger = new Logger('background/webrequest', get_app_log_transport());

export interface WebRequestHandlerState {
    is_capturing: boolean;
    capture_id: string;
    start_time: number;
    current_tab_id: number;
    config: NetworkCaptureConfig;
    dbg_tab_id: number | null;
    pending_requests: Map<string, PendingRequest>;
    cdp_request_meta: Map<string, CdpRequestMeta>;
    cdp_body_results: Map<string, CdpBodyResult>;
    cdp_primary_emitted: Set<string>;
    deferred_web_requests: Map<string, { pending: PendingRequest; details: any; timer: ReturnType<typeof setTimeout>; pending_cdp_ids: Set<string> }>;
    _deferred_cdp_index: Map<string, Set<string>>;
    send_to_background: (payload: NetworkEventPayload) => void;
}

export function handle_before_request(details: any, state: WebRequestHandlerState): void {
    if (!state.is_capturing) return;
    // CDP-first: skip requests on the attached tab — CDP handles them directly
    if (state.dbg_tab_id !== null && details.tabId === state.dbg_tab_id) return;

    // BUG-005: 排除扩展自身 origin 与本地 Bridge URL（含 /log 日志上报端点），
    // 避免 Bridge 响应在 CDP 拿到 body 前结束而污染 cdp_failed 计数。
    if (is_self_origin_url(details.url)) return;

    const { body, status } = extract_request_body(details, state.config.capture_request_body, state.config.max_body_capture_bytes);

    const pending: PendingRequest = {
        cdp_request_id: details.requestId,
        tab_id: details.tabId,
        method: details.method,
        url: redact_url(details.url, Boolean(state.config.redact_data) && state.config.redact_url_query).url,
        timestamp: details.timeStamp,
        request_headers: {},
        response_headers: {},
        request_body: body,
        request_body_status: status,
        resource_type: details.type || 'other',
        mime_type: null,
    };

    state.pending_requests.set(details.requestId, pending);
}

export function handle_before_send_headers(details: any, state: WebRequestHandlerState): void {
    if (!state.is_capturing) return;
    if (state.dbg_tab_id !== null && details.tabId === state.dbg_tab_id) return;
    const pending = state.pending_requests.get(details.requestId);
    if (!pending) return;

    const headers = headers_array_to_map(details.requestHeaders);
    pending.request_headers = (state.config.redact_data && state.config.redact_sensitive_headers)
        ? redact_headers(headers, true).headers : headers;
}

export function handle_headers_received(details: any, state: WebRequestHandlerState): void {
    if (!state.is_capturing) return;
    if (state.dbg_tab_id !== null && details.tabId === state.dbg_tab_id) return;
    const pending = state.pending_requests.get(details.requestId);
    if (!pending) return;

    const headers = headers_array_to_map(details.responseHeaders);
    pending.response_headers = (state.config.redact_data && state.config.redact_sensitive_headers)
        ? redact_headers(headers, true).headers : headers;
    pending.mime_type = extract_mime_type(pending.response_headers);
}

export function handle_completed(details: any, state: WebRequestHandlerState): void {
    if (!state.is_capturing) return;
    // CDP-first: skip requests on the attached tab — CDP already emitted them
    if (state.dbg_tab_id !== null && details.tabId === state.dbg_tab_id) return;

    const pending = state.pending_requests.get(details.requestId);
    if (!pending) return;
    state.pending_requests.delete(details.requestId);

    // If CDP body capture is not active, emit webRequest-only
    if (!state.config.capture_response_body || state.dbg_tab_id === null) {
        logger.debug('body_not_enabled_immediate', {
            reason: !state.config.capture_response_body ? 'config_disabled' : 'no_dbg_tab',
            url: pending.url?.slice(0, 120),
            method: pending.method,
            capture_response_body: state.config.capture_response_body,
            dbg_tab_id: state.dbg_tab_id,
        });
        state.send_to_background(build_network_event(pending, details, null, 'not_enabled', state));
        return;
    }

    // Try to find a matching CDP body result by correlating URL + method + status + timestamp
    const matched_cdp_id = find_matching_cdp_request(
        pending.url || '',
        pending.method || 'GET',
        details.statusCode,
        details.timeStamp,
        state
    );

    if (matched_cdp_id) {
        const body_result = state.cdp_body_results.get(matched_cdp_id);
        state.cdp_body_results.delete(matched_cdp_id);
        state.cdp_request_meta.delete(matched_cdp_id);
        if (body_result) {
            logger.debug('body_captured', {
                url: pending.url?.slice(0, 120),
                method: pending.method,
                body_status: body_result.status,
                body_len: body_result.body?.length ?? 0,
            });
            state.send_to_background(build_network_event(
                pending, details, body_result.body, body_result.status, state, body_result.preview
            ));
            return;
        }
        logger.debug('cdp_match_found_but_no_result', {
            url: pending.url?.slice(0, 120),
            cdp_id: matched_cdp_id,
        });
    }

    // No CDP match found — defer write, wait for CDP body to arrive
    // This avoids the race where webRequest completes before CDP body is resolved
    const deferred_key = `deferred_${details.requestId}`;
    const candidates = find_cdp_candidates(
        pending.url || '',
        pending.method || 'GET',
        details.statusCode,
        state
    );
    const pending_cdp_ids = new Set(candidates);
    logger.debug('body_deferred', {
        url: pending.url?.slice(0, 120),
        method: pending.method,
        status: details.statusCode,
        candidate_count: candidates.length,
        cdp_meta_count: state.cdp_request_meta.size,
        dbg_tab_id: state.dbg_tab_id,
    });
    const timer = setTimeout(() => {
        state.deferred_web_requests.delete(deferred_key);
        // Clean up reverse index for all pending CDP candidates
        for (const cdp_id of pending_cdp_ids) {
            const keys = state._deferred_cdp_index.get(cdp_id);
            if (keys) {
                keys.delete(deferred_key);
                if (keys.size === 0) state._deferred_cdp_index.delete(cdp_id);
            }
        }
        logger.debug('body_not_enabled_deferred_timeout', {
            url: pending.url?.slice(0, 120),
            method: pending.method,
            status: details.statusCode,
            candidate_count: pending_cdp_ids.size,
            deferred_timeout_ms: 1500,
            cdp_meta_at_timeout: state.cdp_request_meta.size,
            dbg_tab_id: state.dbg_tab_id,
        });
        state.send_to_background(build_network_event(pending, details, null, 'not_enabled', state));
    }, 1500); // DEFERRED_TIMEOUT_MS
    state.deferred_web_requests.set(deferred_key, { pending, details, timer, pending_cdp_ids });

    // Store a reverse-lookup from CDP request candidates to deferred entries
    // for fast resolution when CDP body arrives
    for (const cdp_id of candidates) {
        let keys = state._deferred_cdp_index.get(cdp_id);
        if (!keys) {
            keys = new Set();
            state._deferred_cdp_index.set(cdp_id, keys);
        }
        keys.add(deferred_key);
    }
}

export function handle_error(details: any, state: WebRequestHandlerState): void {
    if (!state.is_capturing) return;
    if (state.dbg_tab_id !== null && details.tabId === state.dbg_tab_id) return;
    state.pending_requests.delete(details.requestId);
}

export function build_network_event(
    pending: PendingRequest,
    details: any,
    response_body: string | null,
    response_body_status: BodyCaptureStatus,
    state: WebRequestHandlerState,
    response_preview: string | null = null
): NetworkEventPayload {
    const relative_time_ms = pending.timestamp - state.start_time;

    const event = create_base_event({
        capture_id: state.capture_id,
        category: 'network',
        type: 'network_request',
        relative_time_ms,
        tab_id: pending.tab_id || state.current_tab_id,
        url: pending.url,
        source: 'background',
        severity: 'info',
    });

    const redacted_headers = state.config.redact_data && state.config.redact_sensitive_headers;

    const data: NetworkRequestData = {
        capture_id: event.capture_id,
        event_id: event.event_id,
        request_id: pending.cdp_request_id || crypto.randomUUID(),
        method: pending.method || 'GET',
        url: pending.url || '',
        url_status: state.config.redact_data && state.config.redact_url_query ? 'redacted' : 'captured',
        status_code: details.statusCode ?? null,
        status_text: null,
        protocol: null,
        resource_type: resolve_resource_type(pending.resource_type),
        initiator: null,
        duration_ms: details.timeStamp != null && pending.timestamp != null
            ? details.timeStamp - pending.timestamp
            : null,
        start_time_ms: null,
        end_time_ms: null,
        request_headers: pending.request_headers || {},
        response_headers: pending.response_headers || {},
        headers_status: redacted_headers ? 'redacted' : 'captured',
        request_body: pending.request_body ?? null,
        request_body_status: pending.request_body_status || 'not_enabled',
        request_body_encoding: pending.request_body ? 'utf8' : null,
        request_body_bytes: pending.request_body ? new TextEncoder().encode(pending.request_body).length : null,
        request_body_mime: null,
        response_body,
        response_preview,
        response_body_status,
        response_body_encoding: null,
        response_body_bytes: null,
        mime_type: pending.mime_type,
        request_size_bytes: null,
        response_size_bytes: null,
        transfer_size_bytes: null,
        from_cache: null,
        cache_status: null,
        error_text: null,
        capture_method: 'web_request',
        body_capture_mode: state.config.capture_response_body ? 'extension_cdp' : 'none',
    };

    return { event, data };
}

export function find_cdp_candidates(
    url: string,
    method: string,
    status_code: number,
    state: WebRequestHandlerState
): string[] {
    const candidates: string[] = [];
    const base_url = url.split('?')[0];

    for (const [cdp_id, meta] of state.cdp_request_meta) {
        if (meta.method !== method) continue;
        // Relaxed status match: allow status_code=0 (CDP response not yet received)
        if (meta.status_code !== 0 && meta.status_code !== status_code) continue;

        const cdp_base = meta.url.split('?')[0];
        if (base_url !== cdp_base) continue;

        candidates.push(cdp_id);
    }

    return candidates;
}

export function find_matching_cdp_request(
    url: string,
    method: string,
    status_code: number,
    timestamp: number,
    state: WebRequestHandlerState
): string | null {
    const MATCH_WINDOW_MS = 2000;
    let best_candidate: string | null = null;
    let best_time_diff = Infinity;
    let reject_reasons = { method_miss: 0, status_miss: 0, time_miss: 0, url_miss: 0 };

    for (const [cdp_id, meta] of state.cdp_request_meta) {
        if (meta.method !== method) { reject_reasons.method_miss++; continue; }
        if (meta.status_code !== 0 && meta.status_code !== status_code) { reject_reasons.status_miss++; continue; }
        const time_diff = Math.abs(meta.timestamp - timestamp);
        if (time_diff > MATCH_WINDOW_MS) { reject_reasons.time_miss++; continue; }

        const cdp_base = meta.url.split('?')[0];
        const web_base = url.split('?')[0];
        if (cdp_base !== web_base) { reject_reasons.url_miss++; continue; }

        if (time_diff < best_time_diff) {
            best_time_diff = time_diff;
            best_candidate = cdp_id;
        }
    }

    if (!best_candidate && state.cdp_request_meta.size > 0) {
        logger.debug('cdp_match_miss', {
            url: url.slice(0, 120),
            method,
            status_code,
            cdp_meta_count: state.cdp_request_meta.size,
            ...reject_reasons,
        });
    }

    return best_candidate;
}

export function is_self_origin_url(raw_url: string): boolean {
    if (!raw_url || typeof raw_url !== 'string') return false;
    // 扩展自身 origin（MV3 content/background 内部跳转）
    if (raw_url.startsWith('chrome-extension://')) return true;
    // 本地 Bridge / 开发服务器：覆盖所有端口，不硬编码
    try {
        const parsed = new URL(raw_url);
        return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
    } catch {
        return false;
    }
}
