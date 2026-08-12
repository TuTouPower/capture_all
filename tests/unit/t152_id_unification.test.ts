// tests/unit/t152_id_unification.test.ts
// t152 AC-007: id 生成统一为 crypto.randomUUID（非 secure context fallback）。
// - generate_unique_suffix 唯一且定长
// - get_native_record_id fallback 无碰撞且确定性（同一记录两次调用一致）
import { describe, expect, it } from 'vitest';
import { generate_unique_suffix, generate_capture_id } from '../../src/shared/id';
import { generate_event_id } from '../../src/shared/event_utils';
import { get_timeline_from_capture_data } from '../../src/extension/background/agent_data_queries';

const BASE_SOURCES = {
    user_action_events: [],
    navigation_events: [],
    console_events: [],
    error_events: [],
    storage_changes: [],
    cookie_changes: [],
};

function make_data(network_requests: unknown[]) {
    return { sources: { ...BASE_SOURCES, network_requests } } as never;
}

describe('t152 AC-007 id 生成统一', () => {
    it('generate_unique_suffix 两次调用不重复', () => {
        expect(generate_unique_suffix(8)).not.toBe(generate_unique_suffix(8));
    });

    it('generate_unique_suffix 定长且仅小写字母数字', () => {
        for (const len of [6, 7, 10]) {
            const s = generate_unique_suffix(len);
            expect(s).toHaveLength(len);
            expect(s).toMatch(/^[a-z0-9]+$/);
        }
    });

    it('generate_capture_id 保持 <timestamp>_<random> 两段结构', () => {
        const id = generate_capture_id();
        const parts = id.split('_');
        expect(parts).toHaveLength(2);
        expect(parts[0]).toMatch(/^\d+$/);
        expect(parts[1]).toMatch(/^[a-z0-9]+$/);
    });

    it('generate_event_id 保持 evt_ 前缀且唯一', () => {
        expect(generate_event_id()).toMatch(/^evt_/);
        expect(generate_event_id()).not.toBe(generate_event_id());
    });

    it('get_native_record_id fallback：同 (relative_time, absolute_time) 不同记录不碰撞', () => {
        const data = make_data([
            { relative_time_ms: 1000, absolute_time: '2026-01-01T00:00:00.000Z', url: 'https://a.com' },
            { relative_time_ms: 1000, absolute_time: '2026-01-01T00:00:00.000Z', url: 'https://b.com' },
        ]);
        const result = get_timeline_from_capture_data(data);
        const ids = result.records.map((r) => r.record_id);
        expect(ids[0]).not.toBe(ids[1]);
    });

    it('get_native_record_id fallback 确定性：同一记录两次调用 record_id 一致', () => {
        const data = make_data([
            { relative_time_ms: 1000, absolute_time: '2026-01-01T00:00:00.000Z', url: 'https://a.com' },
        ]);
        const r1 = get_timeline_from_capture_data(data);
        const r2 = get_timeline_from_capture_data(data);
        expect(r2.records[0].record_id).toBe(r1.records[0].record_id);
    });
});
