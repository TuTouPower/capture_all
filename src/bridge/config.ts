import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { MAX_COMMAND_TIMEOUT_MS } from '../shared/constants';
import type { AgentBridgeConfig } from '../shared/protocol';
// t187: token 文件契约（类型/路径/读写）移入 node_shared 中立模块；re-export 保持既有导出面
import {
    default_token_file_path,
    load_bridge_token_file,
    persist_bridge_token,
} from '../node_shared/bridge_token_file';
export {
    default_token_file_path,
    load_bridge_token_file,
    persist_bridge_token,
    type TokenFileFailureReason,
    type TokenFileLoadResult,
} from '../node_shared/bridge_token_file';

// t201: 实例 registry 默认落盘路径——与 token 文件同目录,四条启动路径共享单一位置。
export function default_instances_file_path(): string {
    return join(dirname(default_token_file_path()), 'instances.json');
}

interface RawBridgeConfig {
    host?: string;
    port?: number;
    token?: string;
    pairing_auto_open?: boolean;
    instances_file?: string;
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

    if (!raw.token?.trim()) {
        throw new Error('Bridge token is required');
    }

    // t178: timeout 配置运行时 parse 校验（正整数且 ≤ MAX_COMMAND_TIMEOUT_MS）
    const command_timeout_ms = raw.command_timeout_ms ?? 120000;
    const full_data_timeout_ms = raw.full_data_timeout_ms ?? 300000;
    if (!Number.isInteger(command_timeout_ms) || command_timeout_ms <= 0 || command_timeout_ms > MAX_COMMAND_TIMEOUT_MS) {
        throw new Error('Invalid command_timeout_ms');
    }
    if (!Number.isInteger(full_data_timeout_ms) || full_data_timeout_ms <= 0 || full_data_timeout_ms > MAX_COMMAND_TIMEOUT_MS) {
        throw new Error('Invalid full_data_timeout_ms');
    }

    return {
        host,
        port,
        token: raw.token,
        command_timeout_ms,
        full_data_timeout_ms,
        pairing_auto_open: raw.pairing_auto_open ?? true,
        instances_file: raw.instances_file,
    };
}

export function parse_bridge_cli_args(
    argv: string[],
    env: { CAPTURE_ALL_BRIDGE_TOKEN?: string; CAPTURE_ALL_INSTANCES_FILE?: string; CAPTURE_ALL_PAIRING_AUTO_OPEN?: string } = process.env,
): RawBridgeConfig {
    const raw: RawBridgeConfig = {
        token: env.CAPTURE_ALL_BRIDGE_TOKEN || undefined,
        instances_file: env.CAPTURE_ALL_INSTANCES_FILE || default_instances_file_path(),
        pairing_auto_open: env.CAPTURE_ALL_PAIRING_AUTO_OPEN === '0' || env.CAPTURE_ALL_PAIRING_AUTO_OPEN === 'false' ? false : undefined,
    };

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

export function generate_bridge_token(): string {
    return `mcp_${randomBytes(24).toString('base64url')}`;
}

interface BridgeTokenResolution {
    token: string;
    source: 'cli' | 'env' | 'file' | 'generated';
    file_path?: string;
}

export async function resolve_bridge_token(
    cli_token?: string,
    env_token?: string,
    token_file_path?: string,
): Promise<BridgeTokenResolution> {
    if (cli_token?.trim()) {
        return { token: cli_token.trim(), source: 'cli' };
    }
    if (env_token?.trim()) {
        return { token: env_token.trim(), source: 'env' };
    }

    const file_path = token_file_path ?? default_token_file_path();
    const loaded = await load_bridge_token_file(file_path);
    if (loaded.token) {
        return { token: loaded.token, source: 'file', file_path };
    }

    const generated = generate_bridge_token();
    await persist_bridge_token(generated, file_path);
    return { token: generated, source: 'generated', file_path };
}

// B1-L7: 健康检查带超时，bridge 挂起时不无限阻塞
const BRIDGE_HEALTH_TIMEOUT_MS = 3000;
// t183: 产品标识单一事实来源（server /health 与 probe 识别共用；测试防漂移）
export const BRIDGE_SERVICE_ID = 'capture-all-bridge';
// t184: Bridge 产品版本单一来源（server /health 与 registry build_status 共用，防双份漂移）
export const BRIDGE_VERSION = '0.1.0';

// t183: 健康探测三态——main 启动判定与 SessionStart hook（--probe）共用同一逻辑
export type BridgeHealthStatus = 'healthy' | 'occupied' | 'unreachable';

/**
 * t183 AC-002: 校验 status + Content-Type + 完整产品标识（service + ok + version 字段）。
 * 任意 2xx 服务（非本产品）→ occupied（端口冲突，不视为已运行）；解析失败同样视为 occupied；
 * 非 2xx / 连接失败 / 超时 → unreachable。
 */
export async function probe_bridge_health(bridge_url: string): Promise<BridgeHealthStatus> {
    try {
        const response = await fetch(`${bridge_url}/health`, {
            signal: AbortSignal.timeout(BRIDGE_HEALTH_TIMEOUT_MS),
        });
        if (!response.ok) return 'unreachable';
        const content_type = response.headers.get('content-type') ?? '';
        if (!content_type.includes('application/json')) return 'occupied';
        let body: unknown;
        try {
            body = await response.json();
        } catch {
            return 'occupied'; // 2xx 但非 JSON → 非本服务
        }
        const record = body as { ok?: unknown; service?: unknown; bridge_version?: unknown } | null;
        const is_self = record !== null
            && record.ok === true
            && record.service === BRIDGE_SERVICE_ID
            && typeof record.bridge_version === 'string'
            && record.bridge_version.length > 0;
        return is_self ? 'healthy' : 'occupied';
    } catch {
        return 'unreachable';
    }
}

export async function is_bridge_healthy(bridge_url: string): Promise<boolean> {
    return (await probe_bridge_health(bridge_url)) === 'healthy';
}
