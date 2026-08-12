// tests/unit/t152_relative_time_clamp.test.ts
// t152 AC-009: get_relative_time 时钟回拨/异常数据时 clamp 到 0，不产出负相对时间。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { get_relative_time } from '../../src/shared/event_utils';

const START = 1700000000000;

afterEach(() => {
    vi.restoreAllMocks();
});

describe('t152 AC-009 get_relative_time 非负', () => {
    it('正常时刻返回 now - start', () => {
        vi.spyOn(Date, 'now').mockReturnValue(START + 5000);
        expect(get_relative_time(START)).toBe(5000);
    });

    it('时钟回拨（now < start）clamp 到 0', () => {
        vi.spyOn(Date, 'now').mockReturnValue(START - 5000);
        expect(get_relative_time(START)).toBe(0);
    });

    it('now === start 返回 0', () => {
        vi.spyOn(Date, 'now').mockReturnValue(START);
        expect(get_relative_time(START)).toBe(0);
    });
});
