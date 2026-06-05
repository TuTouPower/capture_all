import type { AgentBridgeConfig } from '../shared/protocol';

interface RawBridgeConfig {
    host?: string;
    port?: number;
    token?: string;
    command_timeout_ms?: number;
    full_data_timeout_ms?: number;
}

export function parse_bridge_config(raw: RawBridgeConfig): AgentBridgeConfig {
    const host = raw.host || '127.0.0.1';

    if (host !== '127.0.0.1') {
        throw new Error('Bridge host must be 127.0.0.1');
    }

    const port = raw.port;

    if (port === undefined || !Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('Invalid bridge port');
    }

    if (!raw.token) {
        throw new Error('Bridge token is required');
    }

    return {
        host,
        port,
        token: raw.token,
        command_timeout_ms: raw.command_timeout_ms ?? 30000,
        full_data_timeout_ms: raw.full_data_timeout_ms ?? 120000,
    };
}

export function parse_bridge_cli_args(argv: string[]): RawBridgeConfig {
    const raw: RawBridgeConfig = {};

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const value = argv[index + 1];

        if (arg === '--port') {
            raw.port = Number(value);
            index += 1;
        }

        if (arg === '--token') {
            raw.token = value;
            index += 1;
        }
    }

    return raw;
}
