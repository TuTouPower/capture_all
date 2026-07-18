import type { AgentCommandResult, AgentCommandType, AgentError, AgentStatus } from '../../shared/protocol';

interface BridgeErrorResponse {
    error?: AgentError;
}

export class BridgeMcpClient {
    constructor(private bridge_url: string, private token: string) {}

    async get_status(): Promise<AgentStatus> {
        const response = await fetch(`${this.bridge_url}/mcp/status`, {
            headers: this.headers(),
        });

        return await this.parse_response<AgentStatus>(response);
    }

    async send_command(type: AgentCommandType, payload: unknown, timeout_ms?: number): Promise<AgentCommandResult> {
        const response = await fetch(`${this.bridge_url}/mcp/command`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({ type, payload, timeout_ms }),
        });

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
