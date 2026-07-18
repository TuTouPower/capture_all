import { describe, expect, test } from 'vitest';
import { DEFAULT_USER_CONFIG } from '../../src/shared/constants';
import { normalize_agent_bridge_config } from '../../src/shared/agent_bridge_config';

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
            agent_bridge_poll_interval_ms: 1000,
            browser_no: 0,
            browser_label: '',
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

describe('T0006: browser_no auto-enroll config', () => {
    const base = {
        agent_bridge_enabled: true,
        agent_bridge_url: 'http://127.0.0.1:17831',
        agent_bridge_token: '',
        agent_bridge_poll_interval_ms: 1000,
        browser_no: 0,
        browser_label: '',
    };

    test('AC-1: enables bridge when browser_no > 0 without token', () => {
        const result = normalize_agent_bridge_config({
            ...base,
            browser_no: 2,
        });
        expect(result.agent_bridge_enabled).toBe(true);
        expect(result.browser_no).toBe(2);
        expect(result.browser_label).toBe('');
    });

    test('disables bridge when browser_no is 0 and token is empty', () => {
        const result = normalize_agent_bridge_config({
            ...base,
        });
        expect(result.agent_bridge_enabled).toBe(false);
    });

    test('normalizes non-integer browser_no to 0', () => {
        const result = normalize_agent_bridge_config({
            ...base,
            browser_no: NaN as any,
        });
        expect(result.browser_no).toBe(0);
        expect(result.agent_bridge_enabled).toBe(false);
    });

    test('normalizes negative browser_no to 0', () => {
        const result = normalize_agent_bridge_config({
            ...base,
            browser_no: -1,
        });
        expect(result.browser_no).toBe(0);
    });

    test('normalizes browser_no 0 to 0', () => {
        const result = normalize_agent_bridge_config({
            ...base,
            browser_no: 0,
        });
        expect(result.browser_no).toBe(0);
    });

    test('AC-5: legacy config with token but no browser_no does not crash', () => {
        const result = normalize_agent_bridge_config({
            agent_bridge_enabled: true,
            agent_bridge_url: 'http://127.0.0.1:17831',
            agent_bridge_token: '<LEGACY_TOKEN>',
            agent_bridge_poll_interval_ms: 1000,
            browser_no: undefined as any,
            browser_label: undefined as any,
        });
        expect(result.agent_bridge_enabled).toBe(true);
        expect(result.browser_no).toBe(0);
        expect(result.browser_label).toBe('');
    });

    test('legacy token and browser_no both set still work', () => {
        const result = normalize_agent_bridge_config({
            ...base,
            agent_bridge_token: '<TOKEN>',
            browser_no: 5,
        });
        expect(result.agent_bridge_enabled).toBe(true);
        expect(result.browser_no).toBe(5);
        expect(result.agent_bridge_token).toBe('<TOKEN>');
    });
});
