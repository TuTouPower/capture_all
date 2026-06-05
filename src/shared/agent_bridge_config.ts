import type { UserConfig } from './types';

export type AgentBridgeUserConfig = Pick<
    UserConfig,
    'agent_bridge_enabled' | 'agent_bridge_url' | 'agent_bridge_token' | 'agent_bridge_poll_interval_ms'
>;

const MIN_POLL_INTERVAL_MS = 250;
const MAX_POLL_INTERVAL_MS = 300000;

export function normalize_agent_bridge_config(config: AgentBridgeUserConfig): AgentBridgeUserConfig {
    const url = parse_local_bridge_url(config.agent_bridge_url);
    const token = config.agent_bridge_token.trim();
    const poll_interval_ms = Number.isFinite(config.agent_bridge_poll_interval_ms)
        ? Math.min(MAX_POLL_INTERVAL_MS, Math.max(MIN_POLL_INTERVAL_MS, Math.floor(config.agent_bridge_poll_interval_ms)))
        : MIN_POLL_INTERVAL_MS;

    return {
        agent_bridge_enabled: config.agent_bridge_enabled && token.length > 0,
        agent_bridge_url: url.toString().replace(/\/$/, ''),
        agent_bridge_token: token,
        agent_bridge_poll_interval_ms: poll_interval_ms
    };
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
