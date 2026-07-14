import { dispatch_agent_command, type AgentRuntimeHandlers } from './agent_command_dispatcher';
import { normalize_agent_bridge_config, type AgentBridgeUserConfig } from '../shared/agent_bridge_config';
import type { CaptureConfig } from '../shared/types';
import { Logger } from '../shared/logger';
import { get_app_log_transport } from './app_log_storage';

const logger = new Logger('background/bridge', get_app_log_transport());
const BRIDGE_ERROR_LOG_INTERVAL_MS = 60_000;

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

        const { agent_bridge_url, agent_bridge_token } = config;
        const handlers: AgentRuntimeHandlers = {
            start_capture: deps.start_capture,
            stop_capture: deps.stop_capture,
            get_status: deps.get_status
        };

        stage = 'heartbeat';
        await send_heartbeat(agent_bridge_url, agent_bridge_token, deps);
        if (!is_active_lifecycle(active_lifecycle_id)) return;

        stage = 'command_fetch';
        const command = await fetch_command(agent_bridge_url, agent_bridge_token);
        if (!is_active_lifecycle(active_lifecycle_id)) return;

        if (command) {
            stage = 'command_dispatch';
            const result = await dispatch_agent_command(
                { command_id: command.command_id, type: command.type as any, payload: command.payload ?? {}, created_at: command.created_at },
                handlers
            );
            if (!is_active_lifecycle(active_lifecycle_id)) return;

            try {
                await send_result(agent_bridge_url, agent_bridge_token, result);
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

async function send_heartbeat(url: string, token: string, deps: AgentBridgeClientDeps): Promise<void> {
    const status = deps.get_status();
    const response = await fetch(`${url}/extension/heartbeat`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            extension_version: deps.extension_version,
            active_capture_id: status.active_capture_id
        })
    });

    if (!response.ok) throw new BridgeHttpError(response.status);
}

async function fetch_command(url: string, token: string): Promise<PendingCommand | null> {
    const response = await fetch(`${url}/extension/command`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.status === 204) return null;
    if (!response.ok) throw new BridgeHttpError(response.status);

    return response.json();
}

async function send_result(url: string, token: string, result: unknown): Promise<void> {
    const response = await fetch(`${url}/extension/result`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
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
