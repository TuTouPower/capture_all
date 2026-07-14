import { describe, expect, it } from 'vitest';
import {
    parse_bridge_cli_args,
    parse_bridge_config,
} from '../src/agent/bridge/config';

describe('parse_bridge_config', () => {
    it('parses valid user config', () => {
        expect(parse_bridge_config({
            port: 17831,
            token: '<TEST_BRIDGE_TOKEN>',
        })).toEqual({
            host: '127.0.0.1',
            port: 17831,
            token: '<TEST_BRIDGE_TOKEN>',
            command_timeout_ms: 120000,
            full_data_timeout_ms: 120000,
        });
    });

    it('rejects non-local host', () => {
        expect(() => parse_bridge_config({
            host: '0.0.0.0',
            port: 17831,
            token: '<TEST_BRIDGE_TOKEN>',
        })).toThrow('Bridge host must be 127.0.0.1');
    });

    it('rejects invalid port', () => {
        expect(() => parse_bridge_config({
            port: 0,
            token: '<TEST_BRIDGE_TOKEN>',
        })).toThrow('Invalid bridge port');
        expect(() => parse_bridge_config({
            port: 70000,
            token: '<TEST_BRIDGE_TOKEN>',
        })).toThrow('Invalid bridge port');
    });

    it('rejects empty token', () => {
        expect(() => parse_bridge_config({ port: 17831, token: '' })).toThrow('Bridge token is required');
    });

    it('rejects whitespace-only token', () => {
        expect(() => parse_bridge_config({
            port: 17831,
            token: '   ',
        })).toThrow('Bridge token is required');
    });

    it('reads token from environment when CLI token is absent', () => {
        expect(parse_bridge_cli_args(
            ['--port', '17831'],
            { CAPTURE_ALL_BRIDGE_TOKEN: '<TEST_ENV_BRIDGE_TOKEN>' },
        )).toEqual({
            port: 17831,
            token: '<TEST_ENV_BRIDGE_TOKEN>',
        });
    });

    it('prefers CLI token over environment token', () => {
        expect(parse_bridge_cli_args(
            ['--port', '17831', '--token', '<TEST_CLI_BRIDGE_TOKEN>'],
            { CAPTURE_ALL_BRIDGE_TOKEN: '<TEST_ENV_BRIDGE_TOKEN>' },
        )).toEqual({
            port: 17831,
            token: '<TEST_CLI_BRIDGE_TOKEN>',
        });
    });

    it('does not use an empty environment token', () => {
        const raw_config = parse_bridge_cli_args(
            ['--port', '17831'],
            { CAPTURE_ALL_BRIDGE_TOKEN: '' },
        );

        expect(() => parse_bridge_config(raw_config)).toThrow(
            'Bridge token is required',
        );
    });
});
