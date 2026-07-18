import { describe, expect, it } from 'vitest';
import {
    AGENT_COMMAND_TYPES,
    build_record_id,
    parse_record_id,
    type AgentCommandType,
} from '../../src/shared/protocol';

describe('agent protocol', () => {
    it('lists every MVP command type', () => {
        const expected: AgentCommandType[] = [
            'capture.start',
            'capture.stop',
            'captures.list',
            'captures.get',
            'sources.list',
            'data.list',
            'data.get',
            'timeline.list',
            'timeline.get',
            'capture.get_all_data',
            'capture.export',
        ];

        expect(AGENT_COMMAND_TYPES).toEqual(expected);
    });

    it('builds and parses stable record ids', () => {
        const record_id = build_record_id('network_requests', 'abc123');

        expect(record_id).toBe('network_requests:abc123');
        expect(parse_record_id(record_id)).toEqual({
            source: 'network_requests',
            native_id: 'abc123',
        });
    });

    it('preserves colons inside native ids', () => {
        expect(parse_record_id('record_events:session:10')).toEqual({
            source: 'record_events',
            native_id: 'session:10',
        });
    });

    it('rejects invalid record ids', () => {
        expect(() => parse_record_id('missing_separator')).toThrow('Invalid record_id');
        expect(() => parse_record_id(':missing_source')).toThrow('Invalid record_id');
        expect(() => parse_record_id('missing_native:')).toThrow('Invalid record_id');
    });
});
