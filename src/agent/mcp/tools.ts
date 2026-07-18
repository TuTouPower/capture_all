import type { BridgeMcpClient } from './client';
import type { AgentCommandType } from '../../shared/protocol';

export interface McpToolCall {
    name: string;
    arguments?: Record<string, unknown>;
}

const TOOL_COMMANDS: Record<string, AgentCommandType> = {
    start_recording: 'capture.start',
    stop_recording: 'capture.stop',
    list_captures: 'captures.list',
    get_capture: 'captures.get',
    list_sessions: 'captures.list',
    get_session: 'captures.get',
    list_data_sources: 'sources.list',
    list_records: 'data.list',
    get_record: 'data.get',
    get_timeline: 'timeline.list',
    get_timeline_item: 'timeline.get',
    get_all_capture_data: 'capture.get_all_data',
    get_all_session_data: 'capture.get_all_data',
    export_capture: 'capture.export',
    export_session: 'capture.export',
};

export const MCP_TOOL_NAMES = [
    'get_status',
    'list_browsers',
    ...Object.keys(TOOL_COMMANDS),
] as const;

export async function execute_mcp_tool(client: BridgeMcpClient, call: McpToolCall): Promise<unknown> {
    if (call.name === 'get_status') {
        return await client.get_status();
    }

    if (call.name === 'list_browsers') {
        const status = await client.get_status();
        return { browsers: status.extensions };
    }

    const command_type = TOOL_COMMANDS[call.name];

    if (!command_type) {
        throw new Error(`Unknown MCP tool: ${call.name}`);
    }

    const { timeout_ms, ...payload } = call.arguments || {};
    const timeout = typeof timeout_ms === 'number' ? timeout_ms : undefined;

    return await client.send_command(command_type, payload, timeout);
}
