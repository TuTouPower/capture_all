import { dispatch_agent_command, type AgentRuntimeHandlers } from './agent_command_dispatcher';
import type { AgentCommandType } from '../../shared/protocol';
import {
    normalize_agent_bridge_config,
    type AgentBridgeUserConfig,
    load_bridge_session,
    save_bridge_session,
    clear_bridge_session,
    generate_instance_id,
} from '../../shared/agent_bridge_config';
import type { CaptureConfig } from '../../shared/types';
import { Logger } from '../../shared/logger';
import { get_app_log_transport } from './app_log_storage';

const logger = new Logger('background/bridge', get_app_log_transport());
const BRIDGE_ERROR_LOG_INTERVAL_MS = 60_000;
const INSTANCE_HEADER = 'X-Capture-All-Instance-Id';

let runtime_instance_id = '';
let session_token: string | null = null;
let enrolled = false;

export function set_bridge_instance_id_for_tests(instance_id: string): void {
    runtime_instance_id = instance_id;
}

export function get_bridge_instance_id(): string {
    return runtime_instance_id;
}

export function set_bridge_session_for_tests(token: string | null): void {
    session_token = token;
    if (token) enrolled = true;
}

export interface AgentBridgeClientDeps {
    get_user_config: () => Promise<AgentBridgeUserConfig>;
    start_capture: (capture_id: string, config: CaptureConfig) => Promise<{ success: boolean; error?: string }>;
    stop_capture: () => Promise<{ success: boolean }>;
    get_status: () => { active_capture_id: string | null };
    extension_version: string;
}

interface PendingCommand {
    command_id: string;
    type: string;
    payload: unknown;
    created_at: number;
}

type BridgeErrorStage =
    | 'config'
    | 'enroll'
    | 'heartbeat'
    | 'command_fetch'
    | 'command_dispatch'
    | 'result_delivery';

type BridgeErrorCategory = 'polling' | 'result_delivery';

interface BridgeErrorDetails {
    stage: BridgeErrorStage;
    failure_kind: 'http' | 'exception';
    http_status?: number;
}

let poll_timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let lifecycle_id = 0;
let last_error_log_at = create_error_log_state();

export function is_bridge_client_running(): boolean {
    return running;
}

export function start_bridge_client(deps: AgentBridgeClientDeps): void {
    if (running) return;
    running = true;
    lifecycle_id += 1;
    last_error_log_at = create_error_log_state();
    logger.info('Bridge client started');
    schedule_poll(deps, lifecycle_id);
}

export function stop_bridge_client(): void {
    if (!running) return;
    logger.info('Bridge client stopped');
    running = false;
    lifecycle_id += 1;
    session_token = null;
    enrolled = false;
    if (poll_timer !== null) {
        clearTimeout(poll_timer);
        poll_timer = null;
    }
}

function schedule_poll(
    deps: AgentBridgeClientDeps,
    active_lifecycle_id: number
): void {
    if (!is_active_lifecycle(active_lifecycle_id)) return;
    poll_timer = setTimeout(
        () => poll_cycle(deps, active_lifecycle_id),
        0
    );
}

async function poll_cycle(
    deps: AgentBridgeClientDeps,
    active_lifecycle_id: number
): Promise<void> {
    let interval_ms = 1000;
    let stage: BridgeErrorStage = 'config';

    try {
        const config = normalize_agent_bridge_config(await deps.get_user_config());
        if (!is_active_lifecycle(active_lifecycle_id)) return;
        interval_ms = config.agent_bridge_poll_interval_ms;

        if (!config.agent_bridge_enabled) {
            stop_bridge_client();
            return;
        }

        const { agent_bridge_url } = config;

        const token = await resolve_token(config, deps);
        if (!is_active_lifecycle(active_lifecycle_id)) return;

        if (!token) {
            schedule_poll(deps, active_lifecycle_id);
            return;
        }

        const handlers: AgentRuntimeHandlers = {
            start_capture: deps.start_capture,
            stop_capture: deps.stop_capture,
            get_status: deps.get_status
        };

        stage = 'heartbeat';
        await send_heartbeat(agent_bridge_url, token, deps);
        if (!is_active_lifecycle(active_lifecycle_id)) return;

        stage = 'command_fetch';
        const command = await fetch_command(agent_bridge_url, token);
        if (!is_active_lifecycle(active_lifecycle_id)) return;

        if (command) {
            stage = 'command_dispatch';
            const result = await dispatch_agent_command(
                { command_id: command.command_id, type: command.type as AgentCommandType, payload: command.payload ?? {}, created_at: command.created_at },
                handlers
            );
            if (!is_active_lifecycle(active_lifecycle_id)) return;

            try {
                await send_result_with_retry(agent_bridge_url, token, result);
            } catch (error) {
                if (!is_active_lifecycle(active_lifecycle_id)) return;
                log_bridge_error(
                    'result_delivery',
                    'Bridge result delivery failed',
                    to_error_details('result_delivery', error)
                );
            }
        }
    } catch (error) {
        if (!is_active_lifecycle(active_lifecycle_id)) return;

        if (error instanceof BridgeHttpError && error.status === 401) {
            const config = normalize_agent_bridge_config(await deps.get_user_config());
            if (!is_active_lifecycle(active_lifecycle_id)) return;
            await handle_401(config, deps);
            if (!is_active_lifecycle(active_lifecycle_id)) return;
            schedule_poll(deps, active_lifecycle_id);
            return;
        }

        log_bridge_error(
            'polling',
            'Bridge polling failed',
            to_error_details(stage, error)
        );
    }

    if (is_active_lifecycle(active_lifecycle_id)) {
        poll_timer = setTimeout(
            () => poll_cycle(deps, active_lifecycle_id),
            interval_ms
        );
    }
}

async function resolve_token(config: AgentBridgeUserConfig, deps: AgentBridgeClientDeps): Promise<string | null> {
    if (session_token) return session_token;

    const session = await load_bridge_session();
    if (session) {
        runtime_instance_id = session.instance_id;
        session_token = session.instance_token;
        enrolled = true;
        return session_token;
    }

    if (config.agent_bridge_token.length > 0) {
        try {
            const instance_id = await generate_instance_id();
            const result = await enroll(config.agent_bridge_url, config.browser_label, deps.extension_version, instance_id, config.agent_bridge_token);
            runtime_instance_id = result.instance_id;
            session_token = result.instance_token;
            enrolled = true;
            await save_bridge_session({ instance_id: result.instance_id, instance_token: result.instance_token });
            logger.info('Bridge enrolled', { instance_id: result.instance_id, browser_label: config.browser_label || null });
            return session_token;
        } catch (error) {
            log_bridge_error(
                'polling',
                'Bridge polling failed',
                { stage: 'enroll', failure_kind: error instanceof BridgeHttpError ? 'http' : 'exception', http_status: error instanceof BridgeHttpError ? error.status : undefined }
            );
            return null;
        }
    }

    return null;
}

async function handle_401(config: AgentBridgeUserConfig, deps: AgentBridgeClientDeps): Promise<void> {
    if (!enrolled) return;

    await clear_bridge_session();
    session_token = null;
    enrolled = false;

    if (config.agent_bridge_token.length < 1) return;

    try {
        const instance_id = runtime_instance_id || await generate_instance_id();
        const result = await enroll(config.agent_bridge_url, config.browser_label, deps.extension_version, instance_id, config.agent_bridge_token);
        runtime_instance_id = result.instance_id;
        session_token = result.instance_token;
        enrolled = true;
        await save_bridge_session({ instance_id: result.instance_id, instance_token: result.instance_token });
        logger.info('Bridge re-enrolled after 401', { instance_id: result.instance_id });
    } catch (error) {
        log_bridge_error(
            'polling',
            'Bridge polling failed',
            { stage: 'enroll', failure_kind: error instanceof BridgeHttpError ? 'http' : 'exception', http_status: error instanceof BridgeHttpError ? error.status : undefined }
        );
    }
}

async function enroll(url: string, browser_label: string, extension_version: string, instance_id: string, bridge_token: string): Promise<{ instance_id: string; instance_token: string }> {
    const response = await fetch(`${url}/extension/enroll`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${bridge_token}`,
        },
        body: JSON.stringify({ browser_label: browser_label || null, extension_version, instance_id }),
    });

    if (!response.ok) throw new BridgeHttpError(response.status);

    const body = await response.json();
    if (!body.ok) throw new Error(body.error?.message || 'Enroll failed');
    return body.data;
}

async function send_heartbeat(url: string, token: string, deps: AgentBridgeClientDeps): Promise<void> {
    const status = deps.get_status();
    const response = await fetch(`${url}/extension/heartbeat`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            instance_id: runtime_instance_id,
            extension_version: deps.extension_version,
            active_capture_id: status.active_capture_id
        })
    });

    if (!response.ok) throw new BridgeHttpError(response.status);
}

async function fetch_command(url: string, token: string): Promise<PendingCommand | null> {
    const response = await fetch(`${url}/extension/command`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            [INSTANCE_HEADER]: runtime_instance_id,
        }
    });

    if (response.status === 204) return null;
    if (!response.ok) throw new BridgeHttpError(response.status);

    return response.json();
}

// T046: 结果投递失败重试。Bridge 已从队列移除命令，结果丢失会让 MCP 调用方收到 COMMAND_TIMEOUT。
// 重试 3 次，每次退避 500ms / 1s / 2s；最终失败记日志（命令已执行但调用方收不到结果）。
async function send_result_with_retry(url: string, token: string, result: unknown): Promise<void> {
    const max_attempts = 3;
    const delays = [0, 500, 1000];
    let last_error: unknown = null;
    for (let attempt = 0; attempt < max_attempts; attempt++) {
        if (delays[attempt] > 0) {
            await new Promise((r) => setTimeout(r, delays[attempt]));
        }
        try {
            await send_result(url, token, result);
            return; // 2xx 成功
        } catch (error) {
            last_error = error;
            // 4xx（非 429）不重试：result 被拒绝（如 401/400）
            if (error instanceof BridgeHttpError && error.status >= 400 && error.status < 500 && error.status !== 429) {
                throw error;
            }
        }
    }
    throw last_error ?? new Error('send_result exhausted retries');
}

async function send_result(url: string, token: string, result: unknown): Promise<void> {
    const response = await fetch(`${url}/extension/result`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            [INSTANCE_HEADER]: runtime_instance_id,
        },
        body: JSON.stringify(result)
    });

    if (!response.ok) throw new BridgeHttpError(response.status);
}

function is_active_lifecycle(active_lifecycle_id: number): boolean {
    return running && lifecycle_id === active_lifecycle_id;
}

function create_error_log_state(): Record<BridgeErrorCategory, number> {
    return {
        polling: Number.NEGATIVE_INFINITY,
        result_delivery: Number.NEGATIVE_INFINITY,
    };
}

function log_bridge_error(
    category: BridgeErrorCategory,
    message: string,
    details: BridgeErrorDetails
): void {
    const now = Date.now();
    if (now - last_error_log_at[category] < BRIDGE_ERROR_LOG_INTERVAL_MS) {
        return;
    }

    last_error_log_at = {
        ...last_error_log_at,
        [category]: now,
    };
    logger.error(message, details);
}

function to_error_details(
    stage: BridgeErrorStage,
    error: unknown
): BridgeErrorDetails {
    if (error instanceof BridgeHttpError) {
        return {
            stage,
            failure_kind: 'http',
            http_status: error.status,
        };
    }

    return {
        stage,
        failure_kind: 'exception',
    };
}

class BridgeHttpError extends Error {
    constructor(readonly status: number) {
        super('Bridge HTTP request failed');
    }
}
