// tests/unit/t136_ws_frame_relative_time.test.ts
// t136: ws_frame 相对时间统一用 Date.now() - start_time，避免 CDP MonotonicTime 减 epoch 起点得巨型负数。
import { describe, it, expect } from 'vitest';
import { _ws_frame_relative_time_for_test } from '../../src/extension/background/network_capture';
import { get_timeline_from_capture_data } from '../../src/extension/background/agent_data_queries';

describe('ws_frame relative time (t136)', () => {
    it('AC-001: 相对时间基于 now-start（epoch 同基准，非 CDP monotonic）', () => {
        const start = 1700000000000;
        const now = start + 5000;
        expect(_ws_frame_relative_time_for_test(now, start)).toBe(5000);
    });

    it('AC-001b: 相对时间为合理非负值（不产出巨型负数）', () => {
        const start = 1700000000000;
        const now = start + 12345;
        const rel = _ws_frame_relative_time_for_test(now, start);
        expect(rel).toBeGreaterThanOrEqual(0);
        // 不在 -1.7e12 级（旧 bug 的 CDP monotonic×1000 - epoch 特征）
        expect(Math.abs(rel)).toBeLessThan(1e9);
    });

    it('AC-002: 生产 send_ws_frame 调用 helper（真实符号复用，非平行副本）', () => {
        const src = require('node:fs').readFileSync(
            require('node:path').resolve(__dirname, '../../src/extension/background/network_capture.ts'),
            'utf8',
        );
        const ws_frame_block = src.slice(src.indexOf('function send_ws_frame'), src.indexOf('function handle_cdp_event'));
        // 生产路径调用 ws_frame_relative_time helper
        expect(ws_frame_block).toContain('ws_frame_relative_time(Date.now(), start_time)');
        // 不再用 params.timestamp（可选链 params?.timestamp 与直接访问 params.timestamp 两种拼写）计算相对时间
        expect(ws_frame_block).not.toMatch(/params\??\.timestamp/);
    });

    it('AC-003: timeline 查询对负 relative_time_ms 记录不崩溃', () => {
        const data = {
            sources: {
                user_action_events: [],
                navigation_events: [],
                network_requests: [
                    { event_id: 'n1', type: 'ws_frame', relative_time_ms: -1.7e12, url: 'wss://x', method: '' },
                    { event_id: 'n2', type: 'network_request', relative_time_ms: 5000, url: 'https://y', method: 'GET' },
                ],
                console_events: [],
                error_events: [],
                storage_changes: [],
                cookie_changes: [],
                capture_lifecycle_events: [], // t180: Agent 数据源 8 源
            },
        };
        const result = get_timeline_from_capture_data(data as never);
        // 负值记录不导致崩溃：total 计入两条，排序正常（负值在前）
        expect(result.total).toBe(2);
        expect(result.records).toHaveLength(2);
        expect(result.records[0].time).toBeLessThan(0);
        expect(result.records[1].time).toBeGreaterThanOrEqual(0);
    });
});
