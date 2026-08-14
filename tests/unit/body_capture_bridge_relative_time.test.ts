// tests/unit/body_capture_bridge_relative_time.test.ts
// @vitest-environment jsdom
// t198 AC-003: bridge 相对时间修正（relative_time = timestamp - start_time，clamp 非负）直接单测。
import { describe, expect, it, vi } from 'vitest';

const enable_response_body_capture = vi.hoisted(() => vi.fn());
const detect_external_cdp = vi.hoisted(() => vi.fn());
const start_external_cdp = vi.hoisted(() => vi.fn());
const poll_external_cdp_events = vi.hoisted(() => vi.fn());
const stop_external_cdp = vi.hoisted(() => vi.fn());

vi.mock('../../src/extension/background/external_cdp_bridge_client', () => ({
    detect_external_cdp,
    start_external_cdp,
    poll_external_cdp_events,
    stop_external_cdp,
}));
vi.mock('../../src/extension/background/network_capture', () => ({
    enable_response_body_capture,
}));

import { convert_bridge_event_to_request } from '../../src/extension/background/body_capture_coordinator';
import type { BridgeBodyEvent } from '../../src/extension/background/external_cdp_bridge_client';

function bridge_event(overrides: Partial<BridgeBodyEvent>): BridgeBodyEvent {
    return {
        request_id: 'bridge_1',
        tab_id: 1,
        url: 'https://example.com/data',
        method: 'POST',
        status_code: 200,
        timestamp: 2000,
        resource_type: 'xhr',
        response_body: null,
        response_body_status: 'captured',
        request_body: null,
        request_body_status: 'captured',
        request_headers: {},
        response_headers: {},
        ...overrides,
    };
}

describe('t198 AC-003: convert_bridge_event_to_request 相对时间修正', () => {
    it('正常路径：relative_time = timestamp - start_time（相对采集起点）', () => {
        const req = convert_bridge_event_to_request(bridge_event({ timestamp: 2500 }), 'cap1', 1000);
        expect(req.relative_time).toBe(1500);
        expect(req.absolute_time).toBe(2500); // 绝对时间保留
        expect(req.capture_id).toBe('cap1');
        expect(req.capture_method).toBe('external_cdp_bridge');
    });

    it('时钟回拨：timestamp < start_time 时 clamp 到 0（不产生负相对时间）', () => {
        const req = convert_bridge_event_to_request(bridge_event({ timestamp: 500 }), 'cap1', 1000);
        expect(req.relative_time).toBe(0);
        expect(req.absolute_time).toBe(500);
    });

    it('相等边界：timestamp === start_time 时 relative_time = 0', () => {
        const req = convert_bridge_event_to_request(bridge_event({ timestamp: 1000 }), 'cap1', 1000);
        expect(req.relative_time).toBe(0);
    });
});
