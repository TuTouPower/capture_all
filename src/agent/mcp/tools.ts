import type { BridgeMcpClient } from './client';
import type { AgentCommandType } from '../shared/protocol';

export interface McpToolCall {
    name: string;
    arguments?: Record<string, unknown>;
}

const TOOL_COMMANDS: Record<string, AgentCommandType> = {
    start_recording: 'recording.start',
    stop_recording: 'recording.stop',
    list_captures: 'sessions.list',
    get_capture: 'sessions.get',
    list_sessions: 'sessions.list',
    get_session: 'sessions.get',
    list_data_sources: 'sources.list',
    list_records: 'records.list',
    get_record: 'records.get',
    get_timeline: 'timeline.list',
    get_timeline_item: 'timeline.get',
    get_all_capture_data: 'session.get_all_data',
    get_all_session_data: 'session.get_all_data',
    export_capture: 'session.export',
    export_session: 'session.export',
};

export const MCP_TOOL_NAMES = [
    'get_status',
    ...Object.keys(TOOL_COMMANDS),
] as const;

export async function execute_mcp_tool(client: BridgeMcpClient, call: McpToolCall): Promise<unknown> {
    if (call.name === 'get_status') {
        return await client.get_status();
    }

    const command_type = TOOL_COMMANDS[call.name];

    if (!command_type) {
        throw new Error(`Unknown MCP tool: ${call.name}`);
    }

    const { timeout_ms, ...payload } = call.arguments || {};
    const timeout = typeof timeout_ms === 'number' ? timeout_ms : undefined;

    return await client.send_command(command_type, payload, timeout);
}
