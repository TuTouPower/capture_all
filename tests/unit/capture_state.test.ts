// tests/unit/capture_state.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
    get_state,
    run_exclusive,
    begin_start,
    begin_stop,
    current_generation,
    is_active_generation,
} from '../../src/extension/background/capture_state';
import { DEFAULT_CONFIG } from '../../src/shared/constants';

describe('capture_state', () => {
    beforeEach(() => {
        // reset 到 idle
        const s = get_state() as any;
        s.phase = 'idle';
        s.capture_id = null;
        s.start_time = null;
        s.config = null;
        s.generation = 0;
    });

    it('并发 run_exclusive 串行化执行', async () => {
        const order: string[] = [];
        const p1 = run_exclusive(async () => {
            order.push('p1_start');
            await new Promise((r) => setTimeout(r, 30));
            order.push('p1_end');
        });
        const p2 = run_exclusive(async () => {
            order.push('p2_start');
            await new Promise((r) => setTimeout(r, 10));
            order.push('p2_end');
        });
        await Promise.all([p1, p2]);
        expect(order).toEqual(['p1_start', 'p1_end', 'p2_start', 'p2_end']);
    });

    it('begin_start 递增 generation + commit 进入 capturing', () => {
        const gen_before = current_generation();
        const handle = begin_start('cap1', DEFAULT_CONFIG);
        expect(handle.generation).toBe(gen_before + 1);
        expect(get_state().phase).toBe('starting');
        expect(is_active_generation(handle.generation)).toBe(true);

        handle.commit();
        expect(get_state().phase).toBe('capturing');
    });

    it('begin_stop 进入 stopping，commit 回到 idle', () => {
        const h = begin_start('cap2', DEFAULT_CONFIG);
        h.commit();
        const stop = begin_stop();
        expect(get_state().phase).toBe('stopping');
        stop.commit();
        expect(get_state().phase).toBe('idle');
        expect(get_state().capture_id).toBeNull();
    });

    it('rollback 回到 idle 清空状态', () => {
        const h = begin_start('cap3', DEFAULT_CONFIG);
        h.rollback();
        expect(get_state().phase).toBe('idle');
        expect(get_state().capture_id).toBeNull();
    });

    it('is_active_generation：过期 generation 返回 false', () => {
        const h1 = begin_start('cap4', DEFAULT_CONFIG);
        h1.commit();
        // 第二次 start（模拟重启采集）
        const h2 = begin_start('cap5', DEFAULT_CONFIG);
        h2.commit();
        expect(is_active_generation(h1.generation)).toBe(false);
        expect(is_active_generation(h2.generation)).toBe(true);
    });
});
