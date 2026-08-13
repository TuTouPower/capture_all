// tests/unit/paged_reader.test.ts
// t156 AC-002 契约: 统一全量分页 helper（ADR-012 PAGE_SIZE=5000）
import { describe, expect, it, vi } from 'vitest';
import { PAGE_SIZE, fetch_all_records } from '../../src/extension/shared/paged_reader';

describe('fetch_all_records', () => {
    it('PAGE_SIZE 契约固定为 5000', () => {
        expect(PAGE_SIZE).toBe(5000);
    });

    it('多页数据全部追加，顺序不丢不重', async () => {
        const total = 12345;
        const source = Array.from({ length: total }, (_, i) => `item_${i}`);
        const fetcher = vi.fn(async (offset: number, limit: number) => source.slice(offset, offset + limit));
        const all = await fetch_all_records(fetcher);
        expect(all).toEqual(source);
        expect(all.length).toBe(total);
    });

    it('fetcher 按 offset 单调递增调用，limit 恒为 PAGE_SIZE', async () => {
        const total = 12000;
        const source = Array.from({ length: total }, (_, i) => i);
        const calls: Array<[number, number]> = [];
        const fetcher = vi.fn(async (offset: number, limit: number) => {
            calls.push([offset, limit]);
            return source.slice(offset, offset + limit);
        });
        await fetch_all_records(fetcher);
        expect(calls.map(c => c[0])).toEqual([0, 5000, 10000]);
        for (const [, limit] of calls) expect(limit).toBe(PAGE_SIZE);
    });

    it('末批不足 PAGE_SIZE 即停止，不发起多余请求', async () => {
        const source = Array.from({ length: 7500 }, (_, i) => i);
        const fetcher = vi.fn(async (offset: number, limit: number) => source.slice(offset, offset + limit));
        const all = await fetch_all_records(fetcher);
        expect(all.length).toBe(7500);
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('首批为空直接返回空数组', async () => {
        const fetcher = vi.fn(async () => []);
        expect(await fetch_all_records(fetcher)).toEqual([]);
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('批量恰为 PAGE_SIZE 整数倍时继续取下一页直到空批', async () => {
        const source = Array.from({ length: 10000 }, (_, i) => i);
        const fetcher = vi.fn(async (offset: number, limit: number) => source.slice(offset, offset + limit));
        const all = await fetch_all_records(fetcher);
        expect(all.length).toBe(10000);
        expect(fetcher).toHaveBeenCalledTimes(3); // offset 0、5000、10000（空批终止）
    });

    it('fetcher 异常原样传播，不吞错', async () => {
        const fetcher = vi.fn(async () => { throw new Error('storage boom'); });
        await expect(fetch_all_records(fetcher)).rejects.toThrow('storage boom');
    });

    it('后续批次失败时已收集数据不回滚且异常向上传播', async () => {
        const source = Array.from({ length: 5000 }, (_, i) => i);
        const fetcher = vi.fn(async (offset: number, limit: number) => {
            if (offset > 0) throw new Error('page 2 boom');
            return source.slice(offset, offset + limit);
        });
        await expect(fetch_all_records(fetcher)).rejects.toThrow('page 2 boom');
    });
});
