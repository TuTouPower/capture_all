import { describe, expect, it } from 'vitest';
import { MCP_TOOL_SCHEMAS } from '../src/mcp/schemas';

describe('MCP tool schemas', () => {
    // Helper: parse should succeed
    const pass = (tool: string, input: unknown) => {
        const schema = MCP_TOOL_SCHEMAS[tool];
        if (!schema) throw new Error(`No schema for tool: ${tool}`);
        return schema.parse(input);
    };

    // Helper: parse should fail
    const fail = (tool: string, input: unknown) => {
        const schema = MCP_TOOL_SCHEMAS[tool];
        if (!schema) throw new Error(`No schema for tool: ${tool}`);
        expect(() => schema.parse(input)).toThrow();
    };

    // --- get_status ---
    it('get_status: accepts empty object', () => {
        expect(pass('get_status', {})).toEqual({});
    });

    it('get_status: accepts timeout_ms', () => {
        expect(pass('get_status', { timeout_ms: 5000 })).toEqual({ timeout_ms: 5000 });
    });

    it('get_status: rejects negative timeout_ms', () => {
        fail('get_status', { timeout_ms: -1 });
    });

    // --- start_recording ---
    it('start_recording: accepts minimal empty object', () => {
        const result = pass('start_recording', {});
        expect(result).toBeDefined();
    });

    it('start_recording: accepts capture_id + config', () => {
        const result = pass('start_recording', {
            capture_id: 'abc-123',
            config: {
                mouse_precision: 'clicks',
                capture_console: true,
                capture_network: true,
                keyboard_capture_mode: 'none',
                capture_input_values: false,
                capture_request_body: false,
                capture_response_body: false,
                max_body_capture_bytes: 1048576,
                inline_text_max_bytes: 1024,
                redact_sensitive_headers: true,
                redact_url_query: false,
                redact_data: false,
                sample_rate_ms: 0,
            },
        });
        expect(result.capture_id).toBe('abc-123');
    });

    it('start_recording: allows unknown config fields (passthrough)', () => {
        const result = pass('start_recording', {
            config: {
                capture_network: true,
                unexpected_field: true,
            },
        });
        expect(result.config).toMatchObject({ capture_network: true, unexpected_field: true });
    });

    it('start_recording: rejects invalid partial config values', () => {
        fail('start_recording', {
            config: {
                redact_data: 'false',
            },
        });
    });

    it('start_recording: rejects empty capture_id', () => {
        fail('start_recording', { capture_id: '' });
    });

    // --- stop_recording ---
    it('stop_recording: accepts empty object', () => {
        expect(pass('stop_recording', {})).toBeDefined();
    });

    // --- list_captures ---
    it('list_captures: accepts empty object', () => {
        expect(pass('list_captures', {})).toBeDefined();
    });

    it('list_captures: accepts offset + limit + order', () => {
        const result = pass('list_captures', { offset: 10, limit: 50, order: 'asc' });
        expect(result.offset).toBe(10);
        expect(result.order).toBe('asc');
    });

    it('list_captures: rejects invalid order', () => {
        fail('list_captures', { order: 'random' });
    });

    it('list_captures: rejects negative offset', () => {
        fail('list_captures', { offset: -1 });
    });

    it('list_captures: rejects zero limit', () => {
        fail('list_captures', { limit: 0 });
    });

    // --- get_capture ---
    it('get_capture: requires capture_id', () => {
        const result = pass('get_capture', { capture_id: 'cap-001' });
        expect(result.capture_id).toBe('cap-001');
    });

    it('get_capture: rejects missing capture_id', () => {
        fail('get_capture', {});
    });

    it('get_capture: rejects empty capture_id', () => {
        fail('get_capture', { capture_id: '' });
    });

    // --- list_data_sources ---
    it('list_data_sources: requires capture_id', () => {
        expect(pass('list_data_sources', { capture_id: 'cap-001' }).capture_id).toBe('cap-001');
    });

    it('list_data_sources: rejects missing capture_id', () => {
        fail('list_data_sources', {});
    });

    // --- list_records ---
    it('list_records: requires capture_id + source', () => {
        const result = pass('list_records', { capture_id: 'cap-001', source: 'network' });
        expect(result.source).toBe('network');
    });

    it('list_records: accepts optional range params', () => {
        const result = pass('list_records', {
            capture_id: 'cap-001',
            source: 'network',
            offset: 5,
            limit: 20,
            start_time: 1000,
            end_time: 5000,
            order: 'desc',
        });
        expect(result.offset).toBe(5);
        expect(result.order).toBe('desc');
    });

    it('list_records: rejects missing source', () => {
        fail('list_records', { capture_id: 'cap-001' });
    });

    it('list_records: rejects missing capture_id', () => {
        fail('list_records', { source: 'network' });
    });

    // --- get_record ---
    it('get_record: requires capture_id + source + record_id', () => {
        const result = pass('get_record', { capture_id: 'cap-001', source: 'network', record_id: 'network:evt-1' });
        expect(result.record_id).toBe('network:evt-1');
    });

    it('get_record: rejects missing record_id', () => {
        fail('get_record', { capture_id: 'cap-001', source: 'network' });
    });

    // --- get_timeline ---
    it('get_timeline: requires capture_id', () => {
        expect(pass('get_timeline', { capture_id: 'cap-001' }).capture_id).toBe('cap-001');
    });

    it('get_timeline: accepts optional sources + range', () => {
        const result = pass('get_timeline', {
            capture_id: 'cap-001',
            sources: ['network', 'console'],
            offset: 0,
            limit: 100,
            order: 'asc',
        });
        expect(result.sources).toEqual(['network', 'console']);
    });

    it('get_timeline: rejects non-string sources', () => {
        fail('get_timeline', { capture_id: 'cap-001', sources: [123] });
    });

    // --- get_timeline_item ---
    it('get_timeline_item: requires capture_id + item_id', () => {
        const result = pass('get_timeline_item', { capture_id: 'cap-001', item_id: 'tl-1' });
        expect(result.item_id).toBe('tl-1');
    });

    it('get_timeline_item: rejects missing item_id', () => {
        fail('get_timeline_item', { capture_id: 'cap-001' });
    });

    // --- get_all_capture_data ---
    it('get_all_capture_data: requires capture_id', () => {
        expect(pass('get_all_capture_data', { capture_id: 'cap-001' }).capture_id).toBe('cap-001');
    });

    it('get_all_capture_data: rejects missing capture_id', () => {
        fail('get_all_capture_data', {});
    });

    // --- export_capture ---
    it('export_capture: requires capture_id + format', () => {
        const result = pass('export_capture', { capture_id: 'cap-001', format: 'json' });
        expect(result.format).toBe('json');
    });

    it('export_capture: accepts all valid formats', () => {
        for (const fmt of ['json', 'jsonl', 'html', 'har']) {
            expect(pass('export_capture', { capture_id: 'cap-001', format: fmt }).format).toBe(fmt);
        }
    });

    it('export_capture: allows any format string (passthrough)', () => {
        expect(pass('export_capture', { capture_id: 'cap-001', format: 'csv' }).format).toBe('csv');
    });

    it('export_capture: rejects missing format', () => {
        fail('export_capture', { capture_id: 'cap-001' });
    });

    // --- alias tools share schemas ---
    it('list_sessions shares list_captures schema', () => {
        const result = pass('list_sessions', { offset: 10, limit: 50 });
        expect(result.offset).toBe(10);
    });

    it('get_session shares get_capture schema', () => {
        expect(pass('get_session', { capture_id: 'cap-001' }).capture_id).toBe('cap-001');
    });

    it('get_all_session_data shares get_all_capture_data schema', () => {
        expect(pass('get_all_session_data', { capture_id: 'cap-001' }).capture_id).toBe('cap-001');
    });

    it('export_session shares export_capture schema', () => {
        expect(pass('export_session', { capture_id: 'cap-001', format: 'har' }).format).toBe('har');
    });

    // --- list_browsers ---
    it('list_browsers: accepts empty object', () => {
        expect(pass('list_browsers', {})).toBeDefined();
    });

    it('list_browsers: accepts timeout_ms', () => {
        expect(pass('list_browsers', { timeout_ms: 5000 }).timeout_ms).toBe(5000);
    });

    // --- browser_no passthrough ---
    it('all tools accept optional browser_no', () => {
        const tools_without_capture_id = ['get_status', 'stop_recording', 'list_browsers', 'list_captures', 'list_sessions', 'start_recording'];
        for (const tool of Object.keys(MCP_TOOL_SCHEMAS)) {
            const base_input = tools_without_capture_id.includes(tool)
                ? {}
                : tool === 'list_records'
                    ? { capture_id: 'cap-001', source: 'network' }
                    : tool === 'get_record'
                        ? { capture_id: 'cap-001', source: 'network', record_id: 'r1' }
                        : tool === 'get_timeline_item'
                            ? { capture_id: 'cap-001', item_id: 'tl1' }
                            : tool === 'export_capture' || tool === 'export_session'
                                ? { capture_id: 'cap-001', format: 'json' }
                                : { capture_id: 'cap-001' };
            const result = MCP_TOOL_SCHEMAS[tool].parse({ ...base_input, browser_no: 2 });
            expect(result.browser_no).toBe(2);
        }
    });

    it('all tools passthrough unknown fields', () => {
        for (const tool of Object.keys(MCP_TOOL_SCHEMAS)) {
            const base_input = tool === 'list_records'
                ? { capture_id: 'cap-001', source: 'network' }
                : tool === 'get_record'
                    ? { capture_id: 'cap-001', source: 'network', record_id: 'r1' }
                    : tool === 'get_timeline_item'
                        ? { capture_id: 'cap-001', item_id: 'tl1' }
                        : tool === 'export_capture' || tool === 'export_session'
                            ? { capture_id: 'cap-001', format: 'json' }
                            : tool === 'get_status' || tool === 'stop_recording' || tool === 'list_browsers' || tool === 'list_captures' || tool === 'list_sessions' || tool === 'start_recording'
                                ? {}
                                : { capture_id: 'cap-001' };
            const result = MCP_TOOL_SCHEMAS[tool].parse({ ...base_input, future_field: 42 });
            expect(result.future_field).toBe(42);
        }
    });

    // --- timeout_ms is allowed on every tool ---
    it('all tools accept optional timeout_ms', () => {
        for (const tool of Object.keys(MCP_TOOL_SCHEMAS)) {
            const base_input = tool === 'get_status' || tool === 'stop_recording' || tool === 'list_browsers'
                ? {}
                : tool === 'list_captures' || tool === 'list_sessions'
                    ? {}
                    : tool === 'get_capture' || tool === 'get_session' || tool === 'list_data_sources' || tool === 'get_all_capture_data' || tool === 'get_all_session_data'
                        ? { capture_id: 'cap-001' }
                        : tool === 'list_records'
                            ? { capture_id: 'cap-001', source: 'network' }
                            : tool === 'get_record'
                                ? { capture_id: 'cap-001', source: 'network', record_id: 'r1' }
                                : tool === 'get_timeline'
                                    ? { capture_id: 'cap-001' }
                                    : tool === 'get_timeline_item'
                                        ? { capture_id: 'cap-001', item_id: 'tl1' }
                                        : tool === 'export_capture' || tool === 'export_session'
                                            ? { capture_id: 'cap-001', format: 'json' }
                                            : tool === 'start_recording'
                                                ? {}
                                                : { capture_id: 'cap-001' };
            const result = MCP_TOOL_SCHEMAS[tool].parse({ ...base_input, timeout_ms: 3000 });
            expect(result.timeout_ms).toBe(3000);
        }
    });
});
