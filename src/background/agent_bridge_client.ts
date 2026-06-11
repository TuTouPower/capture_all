import { dispatch_agent_command, type AgentRuntimeHandlers } from './agent_command_dispatcher';
import { normalize_agent_bridge_config, type AgentBridgeUserConfig } from '../shared/agent_bridge_config';
import type { RecordConfig } from '../shared/types';
import { Logger } from '../shared/logger';
import { get_app_log_transport } from './app_log_storage';

const logger = new Logger('background/bridge', get_app_log_transport());

export interface AgentBridgeClientDeps {
    get_user_config: () => Promise<AgentBridgeUserConfig>;
    start_recording: (session_id: string, config: RecordConfig) => Promise<{ success: boolean; error?: string }>;
    stop_recording: () => Promise<{ success: boolean }>;
    get_status: () => { active_session_id: string | null };
    extension_version: string;
}

interface PendingCommand {
    command_id: string;
    type: string;
    payload: unknown;
    created_at: number;
}

let poll_timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

export function is_bridge_client_running(): boolean {
    return running;
}

export function start_bridge_client(deps: AgentBridgeClientDeps): void {
    if (running) return;
    running = true;
    logger.info('Bridge client started');
    schedule_poll(deps);
}

export function stop_bridge_client(): void {
    if (!running) return;
    logger.info('Bridge client stopped');
    running = false;
    if (poll_timer !== null) {
        clearTimeout(poll_timer);
        poll_timer = null;
    }
}

function schedule_poll(deps: AgentBridgeClientDeps): void {
    if (!running) return;

    poll_timer = setTimeout(async () => {
        await poll_cycle(deps);
        schedule_poll(deps);
    }, 1000);
}

async function poll_cycle(deps: AgentBridgeClientDeps): Promise<void> {
    let config: AgentBridgeUserConfig;
    try {
        config = normalize_agent_bridge_config(await deps.get_user_config());
    } catch {
        return;
    }

    if (!config.agent_bridge_enabled) {
        stop_bridge_client();
        return;
    }

    const { agent_bridge_url, agent_bridge_token, agent_bridge_poll_interval_ms } = config;
    const handlers: AgentRuntimeHandlers = {
        start_recording: deps.start_recording,
        stop_recording: deps.stop_recording,
        get_status: deps.get_status
    };

    try {
        await send_heartbeat(agent_bridge_url, agent_bridge_token, deps);

        const command = await fetch_command(agent_bridge_url, agent_bridge_token);
        if (!command) return;

        const result = await dispatch_agent_command(
            { command_id: command.command_id, type: command.type as any, payload: command.payload ?? {}, created_at: command.created_at },
            handlers
        );

        await send_result(agent_bridge_url, agent_bridge_token, result);
    } catch {
        // network error — next poll will retry
    }

    // adjust poll interval for next cycle
    if (poll_timer && running) {
        clearTimeout(poll_timer);
        poll_timer = setTimeout(async () => {
            await poll_cycle(deps);
            schedule_poll(deps);
        }, agent_bridge_poll_interval_ms);
    }
}

async function send_heartbeat(url: string, token: string, deps: AgentBridgeClientDeps): Promise<void> {
    const status = deps.get_status();
    const response = await fetch(`${url}/extension/heartbeat`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            extension_version: deps.extension_version,
            active_session_id: status.active_session_id
        })
    });

    if (!response.ok) throw new Error(`heartbeat ${response.status}`);
}

async function fetch_command(url: string, token: string): Promise<PendingCommand | null> {
    const response = await fetch(`${url}/extension/command`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.status === 204) return null;
    if (!response.ok) throw new Error(`fetch command ${response.status}`);

    return response.json();
}

async function send_result(url: string, token: string, result: unknown): Promise<void> {
    const response = await fetch(`${url}/extension/result`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
    });

    if (!response.ok) throw new Error(`send result ${response.status}`);
}
