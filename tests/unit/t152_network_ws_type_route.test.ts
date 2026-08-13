// tests/unit/t152_network_ws_type_route.test.ts
// t152 AC-003: network store 混存 ws_frame/ws_message（CaptureEvent）与 NetworkRequestData。
// 查询按 type 路由——ws_frame 记录的 type 取其事件 type，NetworkRequestData 取 resource_type，不再误导。
import { describe, expect, it } from 'vitest';
import {
    get_timeline_from_capture_data,
    list_entries_from_capture_data,
} from '../../src/extension/background/agent_data_queries';

const BASE_SOURCES = {
    user_action_events: [],
    navigation_events: [],
    console_events: [],
    error_events: [],
    storage_changes: [],
    cookie_changes: [],
    capture_lifecycle_events: [], // t180: Agent 数据源 8 源
};

function make_data(network_requests: unknown[]) {
    return { sources: { ...BASE_SOURCES, network_requests } } as never;
}

describe('t152 AC-003 network store ws_frame 查询按 type 路由', () => {
    it('timeline 中 ws_frame 记录 type 取事件 type（非 undefined）', () => {
        const data = make_data([
            { event_id: 'w1', type: 'ws_frame', relative_time_ms: 1000, url: 'wss://x' },
            { event_id: 'r1', relative_time_ms: 2000, url: 'https://y', method: 'GET', resource_type: 'fetch' },
        ]);
        const result = get_timeline_from_capture_data(data);
        const by_type = result.records.map((r) => r.type);
        expect(by_type).toEqual(['ws_frame', 'fetch']);
    });

    it('ws_message 记录同样按事件 type 路由', () => {
        const data = make_data([
            { event_id: 'm1', type: 'ws_message', relative_time_ms: 100, url: 'wss://x' },
        ]);
        const result = get_timeline_from_capture_data(data);
        expect(result.records[0].type).toBe('ws_message');
    });

    it('ws_message 真实落库形（data 内 ws_url，base url=""）summary/preview 读 data.ws_url（f002）', () => {
        const data = make_data([
            { event_id: 'm2', type: 'ws_message', relative_time_ms: 200, url: '', data: { ws_url: 'wss://real.example/ws', direction: 'sent' } },
        ]);
        const result = get_timeline_from_capture_data(data);
        const rec = result.records[0];
        expect(rec.summary).toContain('wss://real.example/ws');
        expect(rec.summary).not.toContain('undefined');
        expect(rec.preview.url).toBe('wss://real.example/ws');
    });

    it('ws_frame 记录 summary/preview 不产生 undefined 字段', () => {
        const data = make_data([
            { event_id: 'w1', type: 'ws_frame', relative_time_ms: 1000, url: 'wss://x' },
        ]);
        const result = get_timeline_from_capture_data(data);
        const rec = result.records[0];
        expect(rec.summary).toContain('ws_frame');
        expect(rec.preview.url).toBe('wss://x');
        expect(rec.summary).not.toContain('undefined');
    });

    it('list_records 同样按 type 路由', () => {
        const data = make_data([
            { event_id: 'r1', relative_time_ms: 2000, url: 'https://y', method: 'GET', resource_type: 'xhr' },
        ]);
        const result = list_entries_from_capture_data(data, { source: 'network_requests' });
        expect(result.records[0].type).toBe('xhr');
    });
});
