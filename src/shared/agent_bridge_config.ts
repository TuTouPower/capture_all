import type { UserConfig } from './types';

export type AgentBridgeUserConfig = Pick<
    UserConfig,
    'agent_bridge_enabled' | 'agent_bridge_url' | 'agent_bridge_token'
    | 'agent_bridge_poll_interval_ms' | 'browser_label'
>;

export interface BridgeSession {
    instance_id: string;
    instance_token: string;
}

const SESSION_STORAGE_KEY = 'agent_bridge_session';
const MIN_POLL_INTERVAL_MS = 250;
const MAX_POLL_INTERVAL_MS = 300000;

export function normalize_agent_bridge_config(config: AgentBridgeUserConfig): AgentBridgeUserConfig {
    const url = parse_local_bridge_url(config.agent_bridge_url);
    const token = config.agent_bridge_token.trim();
    const poll_interval_ms = Number.isFinite(config.agent_bridge_poll_interval_ms)
        ? Math.min(MAX_POLL_INTERVAL_MS, Math.max(MIN_POLL_INTERVAL_MS, Math.floor(config.agent_bridge_poll_interval_ms)))
        : MIN_POLL_INTERVAL_MS;

    return {
        // T091: 零配置 —— token 空时不再强制禁用 agent_bridge_enabled。
        // 扩展可凭 chrome-extension origin 在 loopback 内直通 enroll，无需手填 token。
        agent_bridge_enabled: config.agent_bridge_enabled,
        agent_bridge_url: url.toString().replace(/\/$/, ''),
        agent_bridge_token: token,
        agent_bridge_poll_interval_ms: poll_interval_ms,
        browser_label: (config.browser_label || '').trim(),
    };
}

export async function load_bridge_session(): Promise<BridgeSession | null> {
    try {
        const result = await chrome.storage.local.get(SESSION_STORAGE_KEY);
        const session = result[SESSION_STORAGE_KEY] as BridgeSession | undefined;
        if (session && session.instance_id && session.instance_token) {
            return session;
        }
        return null;
    } catch {
        return null;
    }
}

export async function save_bridge_session(session: BridgeSession): Promise<void> {
    await chrome.storage.local.set({ [SESSION_STORAGE_KEY]: session });
}

export async function clear_bridge_session(): Promise<void> {
    await chrome.storage.local.remove(SESSION_STORAGE_KEY);
}

export async function generate_instance_id(): Promise<string> {
    const existing = await load_bridge_session();
    if (existing) return existing.instance_id;
    const instance_id = crypto.randomUUID();
    return instance_id;
}

function parse_local_bridge_url(raw_url: string): URL {
    let url: URL;

    try {
        url = new URL(raw_url);
    } catch {
        throw new Error('Invalid bridge URL');
    }

    if (url.protocol !== 'http:') {
        throw new Error('Bridge URL must use http');
    }

    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
        throw new Error('Bridge URL must use localhost or 127.0.0.1');
    }

    if (!url.port) {
        throw new Error('Bridge URL must include a port');
    }

    return url;
}
