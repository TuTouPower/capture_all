import { describe, expect, test, vi, beforeEach } from 'vitest';
import { start_bridge_client, stop_bridge_client, is_bridge_client_running } from '../src/background/agent_bridge_client';
import type { AgentBridgeClientDeps } from '../src/background/agent_bridge_client';

const enabled_config = {
    agent_bridge_enabled: true,
    agent_bridge_url: 'http://127.0.0.1:17831',
    agent_bridge_token: 'test-token-abc',
    agent_bridge_poll_interval_ms: 250
};

const disabled_config = {
    agent_bridge_enabled: false,
    agent_bridge_url: 'http://127.0.0.1:17831',
    agent_bridge_token: '',
    agent_bridge_poll_interval_ms: 250
};

const deps: AgentBridgeClientDeps = {
    get_user_config: vi.fn(async () => enabled_config),
    start_recording: vi.fn(async () => ({ success: true })),
    stop_recording: vi.fn(async () => ({ success: true })),
    get_status: vi.fn(() => ({ active_session_id: null }))
};

beforeEach(() => {
    vi.restoreAllMocks();
    stop_bridge_client();
});

describe('agent bridge client', () => {
    test('starts and stops', () => {
        expect(is_bridge_client_running()).toBe(false);
        start_bridge_client(deps);
        expect(is_bridge_client_running()).toBe(true);
        stop_bridge_client();
        expect(is_bridge_client_running()).toBe(false);
    });

    test('double start is no-op', () => {
        start_bridge_client(deps);
        start_bridge_client(deps);
        expect(is_bridge_client_running()).toBe(true);
        stop_bridge_client();
    });

    test('stops when config disables bridge', async () => {
        const custom_deps: AgentBridgeClientDeps = {
            ...deps,
            get_user_config: vi.fn(async () => disabled_config)
        };

        start_bridge_client(custom_deps);

        // Wait for initial 1000ms + poll cycle
        await new Promise(resolve => setTimeout(resolve, 1500));

        expect(is_bridge_client_running()).toBe(false);
    });

    test('polls heartbeat and fetches command', async () => {
        const fetch_spy = vi.spyOn(global, 'fetch').mockImplementation(async (input: string | URL | Request) => {
            const url = typeof input === 'string' ? input : input.toString();

            if (url.endsWith('/extension/heartbeat')) {
                return new Response('{}', { status: 200 });
            }

            if (url.endsWith('/extension/command')) {
                return new Response(null, { status: 204 });
            }

            return new Response('{}', { status: 200 });
        });

        start_bridge_client(deps);

        // Wait for initial 1000ms + poll cycle
        await new Promise(resolve => setTimeout(resolve, 1500));

        stop_bridge_client();

        const heartbeat_calls = fetch_spy.mock.calls.filter(c => c[0].toString().endsWith('/extension/heartbeat'));
        const command_calls = fetch_spy.mock.calls.filter(c => c[0].toString().endsWith('/extension/command'));

        expect(heartbeat_calls.length).toBeGreaterThanOrEqual(1);
        expect(command_calls.length).toBeGreaterThanOrEqual(1);

        fetch_spy.mockRestore();
    });
});
