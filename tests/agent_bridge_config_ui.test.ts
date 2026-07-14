import { describe, expect, test } from 'vitest';
import { DEFAULT_USER_CONFIG } from '../src/shared/constants';
import { normalize_agent_bridge_config } from '../src/shared/agent_bridge_config';

const base_config = {
    ...DEFAULT_USER_CONFIG,
    agent_bridge_enabled: true,
    agent_bridge_url: 'http://127.0.0.1:17831',
    agent_bridge_token: '<TEST_BRIDGE_TOKEN>',
    agent_bridge_poll_interval_ms: 1000
};

describe('agent bridge user config', () => {
    test('keeps a valid local bridge config', () => {
        expect(normalize_agent_bridge_config(base_config)).toEqual({
            agent_bridge_enabled: true,
            agent_bridge_url: 'http://127.0.0.1:17831',
            agent_bridge_token: '<TEST_BRIDGE_TOKEN>',
            agent_bridge_poll_interval_ms: 1000
        });
    });

    test('disables bridge when token is empty', () => {
        expect(normalize_agent_bridge_config({
            ...base_config,
            agent_bridge_token: ''
        }).agent_bridge_enabled).toBe(false);
    });

    test('rejects non-local bridge URLs', () => {
        expect(() => normalize_agent_bridge_config({
            ...base_config,
            agent_bridge_url: 'http://192.168.1.10:17831'
        })).toThrow('Bridge URL must use localhost or 127.0.0.1');
    });

    test('clamps poll interval to a safe minimum', () => {
        expect(normalize_agent_bridge_config({
            ...base_config,
            agent_bridge_poll_interval_ms: 20
        }).agent_bridge_poll_interval_ms).toBe(250);
    });

    test('clamps invalid and very large poll intervals', () => {
        expect(normalize_agent_bridge_config({
            ...base_config,
            agent_bridge_poll_interval_ms: Number.NaN
        }).agent_bridge_poll_interval_ms).toBe(250);

        expect(normalize_agent_bridge_config({
            ...base_config,
            agent_bridge_poll_interval_ms: 999999999
        }).agent_bridge_poll_interval_ms).toBe(300000);
    });

    test('rejects https and URLs without ports', () => {
        expect(() => normalize_agent_bridge_config({
            ...base_config,
            agent_bridge_url: 'https://127.0.0.1:17831'
        })).toThrow('Bridge URL must use http');

        expect(() => normalize_agent_bridge_config({
            ...base_config,
            agent_bridge_url: 'http://localhost'
        })).toThrow('Bridge URL must include a port');
    });
});
