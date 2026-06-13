// background/body_capture_coordinator.ts
// Orchestrates response body capture across three tiers:
//   1. Extension CDP (chrome.debugger)
//   2. External CDP bridge
//   3. Fallback fetch/XHR hook

import type {
    BodyCaptureMode,
    BodyCaptureRuntimeStatus,
    BodyCaptureFailureReason,
    BodyCaptureStartResult,
    NetworkRequestData,
    RecordConfig
} from '../shared/types';
import {
    enable_response_body_capture
} from './network_capture';
import {
    detect_external_cdp,
    start_external_cdp,
    poll_external_cdp_events,
    stop_external_cdp,
    type ExternalCdpBridgeConfig,
    type BridgeBodyEvent
} from './external_cdp_bridge_client';

export interface CoordinatorDeps {
    get_active_tab_url: () => Promise<string | null>;
    get_bridge_config: () => Promise<ExternalCdpBridgeConfig>;
    on_network_request: (request: NetworkRequestData) => void;
}

let coordinator_state: {
    mode: BodyCaptureMode;
    status: BodyCaptureRuntimeStatus;
    failure_reason?: BodyCaptureFailureReason;
    message?: string;
    external_session_key?: string;
    poll_timer?: ReturnType<typeof setInterval>;
} | null = null;

export function get_body_capture_result(): BodyCaptureStartResult | null {
    if (!coordinator_state) return null;
    return {
        mode: coordinator_state.mode,
        status: coordinator_state.status,
        failure_reason: coordinator_state.failure_reason,
        message: coordinator_state.message
    };
}

export async function start_body_capture(
    session_id: string,
    _start_time: number,
    config: RecordConfig,
    active_tab_id: number | null,
    deps: CoordinatorDeps,
    already_attached_tab_id?: number | null
): Promise<BodyCaptureStartResult> {
    if (!config.capture_response_body) {
        coordinator_state = {
            mode: 'none',
            status: 'not_enabled',
            message: 'Response body capture not enabled'
        };
        return build_result();
    }

    const already_attached = (already_attached_tab_id != null && already_attached_tab_id === active_tab_id);

    // Tier 1: Extension CDP
    if (active_tab_id !== null) {
        const cdp_result = await enable_response_body_capture(active_tab_id, already_attached);
        if (cdp_result.success) {
            coordinator_state = {
                mode: 'extension_cdp',
                status: 'active',
                message: 'Extension CDP response body capture active'
            };
            return build_result();
        }

        const error_msg = cdp_result.error || '';

        if (error_msg.includes('Another debugger is already attached')) {
            // Tier 2: External CDP bridge
            const bridge_result = await try_external_cdp_bridge(session_id, config, deps);
            if (bridge_result) {
                coordinator_state = bridge_result;
                return build_result();
            }

            // Tier 3: Fallback hook
            coordinator_state = {
                mode: 'fallback_hook',
                status: 'partial',
                failure_reason: 'bridge_unavailable',
                message: 'Extension CDP blocked (another debugger), bridge unavailable, using fallback hook'
            };
            return build_result();
        }

        // CDP failed for other reasons
        if (error_msg.includes('Cannot attach to this target')) {
            coordinator_state = {
                mode: 'fallback_hook',
                status: 'partial',
                failure_reason: 'restricted_url',
                message: 'Cannot attach CDP to restricted URL, using fallback hook'
            };
            return build_result();
        }

        if (error_msg.includes('not allowed')
            || error_msg.includes('does not have permission')
            || error_msg.includes('debugger is not')) {
            // Permission-related CDP failure — try bridge, then fallback
            const bridge_result = await try_external_cdp_bridge(session_id, config, deps);
            if (bridge_result) {
                coordinator_state = bridge_result;
                return build_result();
            }
            coordinator_state = {
                mode: 'fallback_hook',
                status: 'partial',
                failure_reason: 'permission_denied',
                message: `CDP permission denied: ${error_msg}, using fallback hook`
            };
            return build_result();
        }

        // Permission or other error — try bridge, then fallback
        const bridge_result = await try_external_cdp_bridge(session_id, config, deps);
        if (bridge_result) {
            coordinator_state = bridge_result;
            return build_result();
        }

        coordinator_state = {
            mode: 'fallback_hook',
            status: 'partial',
            failure_reason: 'cdp_attach_failed',
            message: `CDP attach failed: ${error_msg}, using fallback hook`
        };
        return build_result();
    }

    // No active tab — try bridge then fallback
    const bridge_result = await try_external_cdp_bridge(session_id, config, deps);
    if (bridge_result) {
        coordinator_state = bridge_result;
        return build_result();
    }

    coordinator_state = {
        mode: 'fallback_hook',
        status: 'partial',
        failure_reason: 'cdp_target_not_found',
        message: 'No active tab and no CDP bridge, using fallback hook'
    };
    return build_result();
}

export async function stop_body_capture(): Promise<void> {
    if (!coordinator_state) return;

    // Stop external CDP bridge polling
    if (coordinator_state.external_session_key) {
        // We need deps here but stop is best-effort
        if (coordinator_state.poll_timer) {
            clearInterval(coordinator_state.poll_timer);
            coordinator_state.poll_timer = undefined;
        }
    }

    coordinator_state = null;
}

export async function stop_body_capture_with_cleanup(
    deps: Pick<CoordinatorDeps, 'get_bridge_config'>
): Promise<void> {
    if (!coordinator_state) return;

    if (coordinator_state.external_session_key && coordinator_state.mode === 'external_cdp_bridge') {
        if (coordinator_state.poll_timer) {
            clearInterval(coordinator_state.poll_timer);
        }
        try {
            const bridge_config = await deps.get_bridge_config();
            await stop_external_cdp(bridge_config, coordinator_state.external_session_key!);
        } catch {
            // best-effort
        }
    }

    coordinator_state = null;
}

async function try_external_cdp_bridge(
    session_id: string,
    config: RecordConfig,
    deps: CoordinatorDeps
): Promise<typeof coordinator_state> {
    try {
        const bridge_config = await deps.get_bridge_config();
        if (!bridge_config.bridge_url || !bridge_config.bridge_token) {
            return null;
        }

        // Detect CDP port
        const detect_result = await detect_external_cdp(bridge_config);
        if (!detect_result.success) {
            return null;
        }

        // Start external CDP
        const tab_url = (await deps.get_active_tab_url()) || '';
        const start_result = await start_external_cdp(
            bridge_config,
            detect_result.cdp_port!,
            session_id,
            tab_url,
            config.redact_data,
            config.max_body_capture_bytes
        );
        if (!start_result.success || !start_result.session_key) {
            return null;
        }

        // Start polling for body events
        const session_key = start_result.session_key;
        const poll_timer = setInterval(async () => {
            const events = await poll_external_cdp_events(bridge_config, session_key);
            for (const evt of events) {
                const req = convert_bridge_event_to_request(evt, session_id);
                deps.on_network_request(req);
            }
        }, 500);

        return {
            mode: 'external_cdp_bridge',
            status: 'active',
            message: `External CDP bridge active on port ${detect_result.cdp_port}`,
            external_session_key: session_key,
            poll_timer
        };
    } catch {
        return null;
    }
}

function convert_bridge_event_to_request(
    evt: BridgeBodyEvent,
    session_id: string
): NetworkRequestData {
    return {
        session_id,
        capture_id: undefined,
        event_id: undefined,
        request_id: evt.request_id || `bridge_${Date.now().toString(36)}`,
        method: evt.method || 'GET',
        url: evt.url || '',
        url_status: 'captured',
        status_code: evt.status_code || 0,
        status_text: null,
        protocol: null,
        resource_type: (evt.resource_type || 'other') as NetworkRequestData['resource_type'],
        initiator: null,
        duration_ms: 0,
        start_time_ms: null,
        end_time_ms: null,
        relative_time: evt.timestamp,
        absolute_time: evt.timestamp,
        tab_id: evt.tab_id || 0,
        request_headers: evt.request_headers || {},
        response_headers: evt.response_headers || {},
        headers_status: 'captured',
        request_body: evt.request_body ?? null,
        request_body_status: evt.request_body_status || 'not_enabled',
        request_body_encoding: evt.request_body ? 'utf8' : null,
        request_body_bytes: evt.request_body ? new TextEncoder().encode(evt.request_body).length : null,
        request_body_mime: null,
        response_body: evt.response_body ?? null,
        response_preview: null,
        response_body_status: evt.response_body_status || 'failed',
        response_body_encoding: evt.response_body ? 'utf8' : null,
        response_body_bytes: evt.response_body ? new TextEncoder().encode(evt.response_body).length : null,
        mime_type: null,
        request_size_bytes: null,
        response_size_bytes: null,
        transfer_size_bytes: null,
        from_cache: null,
        cache_status: null,
        error_text: null,
        capture_method: 'external_cdp_bridge',
        body_capture_mode: 'external_cdp_bridge',
        correlation_status: 'cdp_only',
        cdp_request_id: evt.request_id,
    };
}

function build_result(): BodyCaptureStartResult {
    if (!coordinator_state) {
        return { mode: 'none', status: 'not_enabled' };
    }
    return {
        mode: coordinator_state.mode,
        status: coordinator_state.status,
        failure_reason: coordinator_state.failure_reason,
        message: coordinator_state.message
    };
}
