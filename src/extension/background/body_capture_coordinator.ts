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
    CaptureConfig
} from '../../shared/types';
import { build_network_data } from '../../shared/network_builder';
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
    poll_timer?: ReturnType<typeof setTimeout>;
    // T095: 闭包 stop 回调，置 poll_stopped 并清当前 timer；stop_body_capture* 与重入 start 必须调用。
    stop_poll?: () => void;
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
    capture_id: string,
    _start_time: number,
    config: CaptureConfig,
    active_tab_id: number | null,
    deps: CoordinatorDeps,
    already_attached_tab_id?: number | null
): Promise<BodyCaptureStartResult> {
    // T095: 重入 start 前先停旧 external poll，避免双闭包双 timer 双写。
    coordinator_state?.stop_poll?.();
    coordinator_state = null;

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

        // CDP 附加失败：handle_cdp_failure 恒返回终态（bridge 或 fallback）
        coordinator_state = await handle_cdp_failure(cdp_result.error || '', capture_id, config, deps);
        return build_result();
    }

    // No active tab — try bridge then fallback
    const bridge_result = await try_external_cdp_bridge(capture_id, config, deps);
    if (bridge_result) {
        coordinator_state = bridge_result;
        return build_result();
    }

    coordinator_state = {
        mode: 'fallback_hook',
        status: 'partial',
        failure_reason: 'cdp_target_not_found',
        message: 'No active tab and no CDP bridge, using fallback hook',
    };
    return build_result();
}

/** CDP 附加失败分类：先按错误类型分派，再尝试 bridge → fallback。恒返回终态。 */
async function handle_cdp_failure(
    error_msg: string,
    capture_id: string,
    config: CaptureConfig,
    deps: CoordinatorDeps,
): Promise<BodyCaptureStartResult> {
    if (error_msg.includes('Another debugger is already attached')) {
        return await escalate_to_bridge_or_fallback(capture_id, config, deps, {
            failure_reason: 'bridge_unavailable',
            message: 'Extension CDP blocked (another debugger), bridge unavailable, using fallback hook',
        });
    }

    if (error_msg.includes('Cannot attach to this target')) {
        return {
            mode: 'fallback_hook',
            status: 'partial',
            failure_reason: 'restricted_url',
            message: 'Cannot attach CDP to restricted URL, using fallback hook',
        };
    }

    if (error_msg.includes('not allowed')
        || error_msg.includes('does not have permission')
        || error_msg.includes('debugger is not')) {
        return await escalate_to_bridge_or_fallback(capture_id, config, deps, {
            failure_reason: 'permission_denied',
            message: `CDP permission denied: ${error_msg}, using fallback hook`,
        });
    }

    // 其它 CDP 失败
    const bridge_result = await try_external_cdp_bridge(capture_id, config, deps);
    if (bridge_result) return bridge_result;
    return {
        mode: 'fallback_hook',
        status: 'partial',
        failure_reason: 'cdp_attach_failed',
        message: `CDP attach failed: ${error_msg}, using fallback hook`,
    };
}

/** 尝试 bridge；bridge 不可用时返回 fallback_hook 状态。 */
async function escalate_to_bridge_or_fallback(
    capture_id: string,
    config: CaptureConfig,
    deps: CoordinatorDeps,
    fallback: { failure_reason: BodyCaptureFailureReason; message: string },
): Promise<BodyCaptureStartResult> {
    const bridge_result = await try_external_cdp_bridge(capture_id, config, deps);
    if (bridge_result) return bridge_result;
    return {
        mode: 'fallback_hook',
        status: 'partial',
        failure_reason: fallback.failure_reason,
        message: fallback.message,
    };
}

export async function stop_body_capture(): Promise<void> {
    if (!coordinator_state) return;

    // T095: 必须调闭包 stop_poll 置 poll_stopped，否则递归 setTimeout 继续调度、in-flight 继续写。
    coordinator_state.stop_poll?.();
    coordinator_state.poll_timer = undefined;

    coordinator_state = null;
}

export async function stop_body_capture_with_cleanup(
    deps: Pick<CoordinatorDeps, 'get_bridge_config'>
): Promise<void> {
    if (!coordinator_state) return;

    if (coordinator_state.external_session_key && coordinator_state.mode === 'external_cdp_bridge') {
        coordinator_state.stop_poll?.();
        coordinator_state.poll_timer = undefined;
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
    capture_id: string,
    config: CaptureConfig,
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
            capture_id,
            tab_url,
            config.redact_data,
            config.max_body_capture_bytes,
            config.redact_sensitive_headers,
            config.redact_url_query,
        );
        if (!start_result.success || !start_result.session_key) {
            return null;
        }

        // Start polling for body events
        const session_key = start_result.session_key;
        // T050: 单飞轮询（完成后递归 setTimeout 而非 setInterval，避免重叠）
        let poll_in_flight = false;
        let poll_stopped = false;
        const poll_once = async () => {
            if (poll_stopped || poll_in_flight) return;
            poll_in_flight = true;
            try {
                const events = await poll_external_cdp_events(bridge_config, session_key);
                // T095: stop 后 in-flight poll 返回不得再写网络事件
                if (poll_stopped) return;
                for (const evt of events) {
                    const req = convert_bridge_event_to_request(evt, capture_id);
                    deps.on_network_request(req);
                }
            } catch {
                // best-effort：单次失败不终止轮询，下次重试
            } finally {
                poll_in_flight = false;
                if (!poll_stopped) {
                    poll_timer = setTimeout(poll_once, 500);
                }
            }
        };
        let poll_timer: ReturnType<typeof setTimeout> = setTimeout(poll_once, 500);

        return {
            mode: 'external_cdp_bridge',
            status: 'active',
            message: `External CDP bridge active on port ${detect_result.cdp_port}`,
            external_session_key: session_key,
            poll_timer,
            // T095: stop_poll 供 stop_body_capture* 与重入 start 调用，置 poll_stopped + 清 timer
            stop_poll: () => {
                poll_stopped = true;
                clearTimeout(poll_timer);
            }
        };
    } catch {
        return null;
    }
}

function convert_bridge_event_to_request(
    evt: BridgeBodyEvent,
    capture_id: string
): NetworkRequestData {
    return build_network_data({
        capture_id,
        request_id: evt.request_id || `bridge_${Date.now().toString(36)}`,
        method: evt.method || 'GET',
        url: evt.url || '',
        url_status: 'captured',
        status_code: evt.status_code || 0,
        resource_type: (evt.resource_type || 'other') as NetworkRequestData['resource_type'],
        duration_ms: 0,
        relative_time: evt.timestamp,
        absolute_time: evt.timestamp,
        tab_id: evt.tab_id || 0,
        request_headers: evt.request_headers || {},
        response_headers: evt.response_headers || {},
        headers_status: 'captured',
        request_body: evt.request_body ?? null,
        request_body_status: evt.request_body_status || 'not_enabled',
        response_body: evt.response_body ?? null,
        response_body_status: evt.response_body_status || 'failed',
        capture_method: 'external_cdp_bridge',
        body_capture_mode: 'external_cdp_bridge',
        correlation_status: 'cdp_only',
        cdp_request_id: evt.request_id,
    });
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
