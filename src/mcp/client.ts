import type { AgentCommandResult, AgentCommandType, AgentError, AgentStatus } from '../shared/protocol';

interface BridgeErrorResponse {
    error?: AgentError;
}

// B1-M3: bridge 挂起时 fetch 无限阻塞。get_status 固定 10s；send_command 取
// timeout_ms+5s（timeout_ms 缺省时对齐 bridge config command_timeout_ms=120s 缺省）。
// t150-f001: 全量数据命令（export/get_all_data）bridge 缺省 full_data_timeout_ms=300s，
// client 超时必须对齐（否则 125~300s 合法导出被 AbortSignal 过早中断）。
const GET_STATUS_TIMEOUT_MS = 10 * 1000;
const DEFAULT_COMMAND_TIMEOUT_MS = 120 * 1000;
const DEFAULT_FULL_DATA_TIMEOUT_MS = 300 * 1000;
const TIMEOUT_GRACE_MS = 5 * 1000;
const FULL_DATA_COMMANDS = new Set<AgentCommandType>(['capture.export', 'capture.get_all_data']);

export class BridgeMcpClient {
    constructor(private bridge_url: string, private token: string) {}

    async get_status(): Promise<AgentStatus> {
        const response = await fetch_with_timeout(`${this.bridge_url}/mcp/status`, {
            headers: this.headers(),
        }, GET_STATUS_TIMEOUT_MS);

        return await this.parse_response<AgentStatus>(response);
    }

    async send_command(type: AgentCommandType, payload: unknown, timeout_ms?: number): Promise<AgentCommandResult> {
        const default_timeout = FULL_DATA_COMMANDS.has(type) ? DEFAULT_FULL_DATA_TIMEOUT_MS : DEFAULT_COMMAND_TIMEOUT_MS;
        const response = await fetch_with_timeout(`${this.bridge_url}/mcp/command`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({ type, payload, timeout_ms }),
        }, (timeout_ms ?? default_timeout) + TIMEOUT_GRACE_MS);

        return await this.parse_response<AgentCommandResult>(response);
    }

    private async parse_response<TResponse>(response: Response): Promise<TResponse> {
        const body = await response.json() as BridgeErrorResponse | TResponse;

        if (response.ok) {
            return body as TResponse;
        }

        const error = (body as BridgeErrorResponse).error;
        const message = error ? `${error.code}: ${error.message}` : `Bridge request failed with HTTP ${response.status}`;

        throw new Error(message);
    }

    private headers(): Record<string, string> {
        return {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
        };
    }
}

// B1-M3: AbortSignal.timeout 兜底，bridge 挂起时 fetch 在 timeout_ms 后中断，
// 不无限阻塞 agent 会话。超时转成可读错误信息。
async function fetch_with_timeout(url: string, init: RequestInit, timeout_ms: number): Promise<Response> {
    try {
        return await fetch(url, { ...init, signal: AbortSignal.timeout(timeout_ms) });
    } catch (error) {
        if (error instanceof Error && error.name === 'TimeoutError') {
            throw new Error(`Bridge request timed out after ${timeout_ms}ms`);
        }
        throw error;
    }
}
