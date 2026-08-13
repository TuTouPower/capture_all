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
import { Logger } from '../../shared/logger';
import { get_app_log_transport } from './app_log_storage';

const logger = new Logger('background/body_capture', get_app_log_transport());

// t158: 非 terminal 轮询失败 warn 节流（500ms 轮询 → 每 10s 一条，防刷屏，与 client 侧同口径）
let last_poll_fail_warn_ts = 0;

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
    start_time: number,
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
        coordinator_state = await handle_cdp_failure(cdp_result.error || '', capture_id, config, deps, start_time);
        return build_result();
    }

    // No active tab — try bridge then fallback
    const bridge_result = await try_external_cdp_bridge(capture_id, config, deps, start_time);
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
    start_time: number,
): Promise<BodyCaptureStartResult> {
    if (error_msg.includes('Another debugger is already attached')) {
        return await escalate_to_bridge_or_fallback(capture_id, config, deps, {
            failure_reason: 'bridge_unavailable',
            message: 'Extension CDP blocked (another debugger), bridge unavailable, using fallback hook',
        }, start_time);
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
        // B2-M15: message 不含内部 CDP 错误串（error_msg 仅用于上方分类）
        return await escalate_to_bridge_or_fallback(capture_id, config, deps, {
            failure_reason: 'permission_denied',
            message: 'CDP permission denied, using fallback hook',
        }, start_time);
    }

    // 其它 CDP 失败
    const bridge_result = await try_external_cdp_bridge(capture_id, config, deps, start_time);
    if (bridge_result) return bridge_result;
    return {
        mode: 'fallback_hook',
        status: 'partial',
        failure_reason: 'cdp_attach_failed',
        // B2-M15: message 不含内部 CDP 错误串（error_msg 仅用于上方分类）
        message: 'CDP attach failed, using fallback hook',
    };
}

/** 尝试 bridge；bridge 不可用时返回 fallback_hook 状态。 */
async function escalate_to_bridge_or_fallback(
    capture_id: string,
    config: CaptureConfig,
    deps: CoordinatorDeps,
    fallback: { failure_reason: BodyCaptureFailureReason; message: string },
    start_time: number,
): Promise<BodyCaptureStartResult> {
    const bridge_result = await try_external_cdp_bridge(capture_id, config, deps, start_time);
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
    deps: CoordinatorDeps,
    start_time: number,
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
                    const req = convert_bridge_event_to_request(evt, capture_id, start_time);
                    deps.on_network_request(req);
                }
            } catch (err) {
                // t158 AC-004: terminal failure 停止 poll + 更新失败状态 + 主动 stop bridge session
                // （释放内存，防 terminal session 驻留）；最后一批终态事件先写入。
                // 其他错误 best-effort：单次失败不终止轮询，下次重试（warn 10s 节流）。
                if (err && (err as { code?: string }).code === 'cdp_session_terminal') {
                    const term = err as { events?: Array<unknown> };
                    if (!poll_stopped) {
                        for (const evt of term.events ?? []) {
                            const req = convert_bridge_event_to_request(evt as BridgeBodyEvent, capture_id, start_time);
                            deps.on_network_request(req);
                        }
                    }
                    poll_stopped = true;
                    if (coordinator_state) {
                        coordinator_state = {
                            ...coordinator_state,
                            status: 'failed',
                            message: 'External CDP bridge session terminated, body capture failed',
                            poll_timer: undefined,
                        };
                    }
                    logger.warn('External CDP session terminal', { session_key, error: String(err) });
                    // t158 f001: 主动通知 bridge 销毁 terminal session（best-effort；TTL 兜底）
                    try {
                        const bridge_config = await deps.get_bridge_config();
                        await stop_external_cdp(bridge_config, session_key);
                    } catch {
                        // best-effort，bridge 侧 terminal TTL 会兜底回收
                    }
                } else {
                    const now = Date.now();
                    if (now - last_poll_fail_warn_ts > 10_000) {
                        logger.warn('External CDP poll failed', { session_key, error: String(err) });
                        last_poll_fail_warn_ts = now;
                    }
                }
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
    } catch (err) {
        // B2-M14: bridge 探测/启动失败补 warn（静默降级有诊断依据）
        logger.warn('External CDP bridge setup failed', { error: String(err) });
        return null;
    }
}

function convert_bridge_event_to_request(
    evt: BridgeBodyEvent,
    capture_id: string,
    start_time: number,
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
        // B2-L5: evt.timestamp 是绝对 epoch；relative 应为相对采集起点，absolute 保留绝对时间。
        // 修前两者同值（epoch），与其它路径 relative 语义不一致，污染 timeline 排序。
        relative_time: Math.max(0, evt.timestamp - start_time),
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
