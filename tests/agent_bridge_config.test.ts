import { describe, expect, it } from 'vitest';
import { parse_bridge_config } from '../src/agent/bridge/config';

describe('parse_bridge_config', () => {
    it('parses valid user config', () => {
        expect(parse_bridge_config({
            port: 17831,
            token: 'abc123abc123',
        })).toEqual({
            host: '127.0.0.1',
            port: 17831,
            token: 'abc123abc123',
            command_timeout_ms: 30000,
            full_data_timeout_ms: 120000,
        });
    });

    it('rejects non-local host', () => {
        expect(() => parse_bridge_config({
            host: '0.0.0.0',
            port: 17831,
            token: 'abc123abc123',
        })).toThrow('Bridge host must be 127.0.0.1');
    });

    it('rejects invalid port', () => {
        expect(() => parse_bridge_config({ port: 0, token: 'abc123abc123' })).toThrow('Invalid bridge port');
        expect(() => parse_bridge_config({ port: 70000, token: 'abc123abc123' })).toThrow('Invalid bridge port');
    });

    it('rejects empty token', () => {
        expect(() => parse_bridge_config({ port: 17831, token: '' })).toThrow('Bridge token is required');
    });
});
