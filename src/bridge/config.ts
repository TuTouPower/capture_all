import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { MAX_COMMAND_TIMEOUT_MS } from '../shared/constants';
import type { AgentBridgeConfig } from '../shared/protocol';

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
        instances_file: env.CAPTURE_ALL_INSTANCES_FILE || undefined,
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

export function default_token_file_path(): string {
    if (process.env.CAPTURE_ALL_BRIDGE_TOKEN_FILE) {
        return process.env.CAPTURE_ALL_BRIDGE_TOKEN_FILE;
    }
    const xdg = process.env.XDG_RUNTIME_DIR;
    if (xdg) {
        return join(xdg, 'capture-all', 'bridge_token');
    }
    return join(process.env.CAPTURE_ALL_PROJECT_DIR || process.cwd(), '.local', 'bridge_token');
}

export function generate_bridge_token(): string {
    return `mcp_${randomBytes(24).toString('base64url')}`;
}

export type TokenFileFailureReason = 'stat_failed' | 'chmod_failed' | 'read_failed' | 'empty';

export interface TokenFileLoadResult {
    token: string | null;
    reason: TokenFileFailureReason | null;
}

export async function load_bridge_token_file(file_path: string): Promise<TokenFileLoadResult> {
    try {
        // T064: 检查文件权限；非 0600 拒绝读取并记录
        const stat_result = await stat(file_path);
        const mode = stat_result.mode & 0o777;
        if (mode !== 0o600) {
            // 尝试收紧权限
            try {
                await chmod(file_path, 0o600);
            } catch {
                // 无法收紧权限，拒绝读取避免泄露
                return { token: null, reason: 'chmod_failed' };
            }
        }
        let content: string;
        try {
            content = await readFile(file_path, 'utf-8');
        } catch {
            return { token: null, reason: 'read_failed' };
        }
        const trimmed = content.trim();
        if (!trimmed) {
            return { token: null, reason: 'empty' };
        }
        return { token: trimmed, reason: null };
    } catch {
        // 主要覆盖 stat 失败（文件不存在）
        return { token: null, reason: 'stat_failed' };
    }
}

export async function persist_bridge_token(token: string, file_path: string): Promise<string> {
    await mkdir(dirname(file_path), { recursive: true });
    await writeFile(file_path, token, { mode: 0o600 });
    // T064: 显式 chmod 确保（writeFile mode 对已存在文件可能不收紧）
    try {
        await chmod(file_path, 0o600);
    } catch {
        // best-effort
    }
    return file_path;
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
