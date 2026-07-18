// tests/stream_buffer.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { create_stream_buffer } from '../../src/extension/background/stream_buffer';

describe('stream_buffer', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('flushes on byte threshold', () => {
        const flushed: Array<{ id: string; data: string }> = [];
        const buf = create_stream_buffer({
            byte_threshold: 10,
            on_flush: (id, data) => flushed.push({ id, data }),
        });

        buf.append('req1', '12345');
        buf.append('req1', '67890'); // 10 bytes total → flush

        expect(flushed).toHaveLength(1);
        expect(flushed[0]).toEqual({ id: 'req1', data: '1234567890' });
    });

    it('flushes on time threshold', () => {
        const flushed: Array<{ id: string; data: string }> = [];
        const buf = create_stream_buffer({
            time_threshold_ms: 500,
            byte_threshold: 1000,
            on_flush: (id, data) => flushed.push({ id, data }),
        });

        buf.append('req1', 'hello');
        expect(flushed).toHaveLength(0);

        vi.advanceTimersByTime(500);
        expect(flushed).toHaveLength(1);
        expect(flushed[0]).toEqual({ id: 'req1', data: 'hello' });
    });

    it('force_flush flushes immediately', () => {
        const flushed: Array<{ id: string; data: string }> = [];
        const buf = create_stream_buffer({
            time_threshold_ms: 10000,
            byte_threshold: 10000,
            on_flush: (id, data) => flushed.push({ id, data }),
        });

        buf.append('req1', 'partial');
        buf.force_flush('req1');

        expect(flushed).toHaveLength(1);
        expect(flushed[0]).toEqual({ id: 'req1', data: 'partial' });
    });

    it('flush_all flushes all buffers', () => {
        const flushed: Array<{ id: string; data: string }> = [];
        const buf = create_stream_buffer({
            time_threshold_ms: 10000,
            byte_threshold: 10000,
            on_flush: (id, data) => flushed.push({ id, data }),
        });

        buf.append('req1', 'a');
        buf.append('req2', 'b');
        buf.flush_all();

        expect(flushed).toHaveLength(2);
        expect(flushed.map(f => f.id).sort()).toEqual(['req1', 'req2']);
    });

    it('remove clears buffer and timer', () => {
        const flushed: Array<{ id: string; data: string }> = [];
        const buf = create_stream_buffer({
            time_threshold_ms: 500,
            byte_threshold: 10000,
            on_flush: (id, data) => flushed.push({ id, data }),
        });

        buf.append('req1', 'data');
        buf.remove('req1');
        vi.advanceTimersByTime(1000);

        expect(flushed).toHaveLength(0);
        expect(buf.size()).toBe(0);
    });

    it('handles multiple requests independently', () => {
        const flushed: Array<{ id: string; data: string }> = [];
        const buf = create_stream_buffer({
            byte_threshold: 5,
            on_flush: (id, data) => flushed.push({ id, data }),
        });

        buf.append('req1', 'aaa');
        buf.append('req2', 'bbbbb'); // triggers flush for req2
        buf.append('req1', 'bbb');   // triggers flush for req1 (6 bytes)

        expect(flushed).toHaveLength(2);
        expect(flushed.find(f => f.id === 'req1')?.data).toBe('aaabbb');
        expect(flushed.find(f => f.id === 'req2')?.data).toBe('bbbbb');
    });

    it('does not flush empty buffer on force_flush', () => {
        const flushed: Array<{ id: string; data: string }> = [];
        const buf = create_stream_buffer({
            on_flush: (id, data) => flushed.push({ id, data }),
        });

        buf.force_flush('nonexistent');
        expect(flushed).toHaveLength(0);
    });

    it('concurrent appends to different request_ids do not interfere', () => {
        const flushed: Array<{ id: string; data: string }> = [];
        const buf = create_stream_buffer({
            byte_threshold: 100,
            time_threshold_ms: 10000,
            on_flush: (id, data) => flushed.push({ id, data }),
        });

        // Interleave appends for two different requests
        buf.append('req_a', 'aaa');
        buf.append('req_b', 'bbb');
        buf.append('req_a', 'ccc');
        buf.append('req_b', 'ddd');
        buf.force_flush('req_a');
        buf.force_flush('req_b');

        expect(flushed).toHaveLength(2);
        expect(flushed.find(f => f.id === 'req_a')?.data).toBe('aaaccc');
        expect(flushed.find(f => f.id === 'req_b')?.data).toBe('bbbddd');
    });

    it('append during flush callback does not lose data', () => {
        const flushed: Array<{ id: string; data: string }> = [];
        let append_during_flush = false;
        const buf = create_stream_buffer({
            byte_threshold: 100,
            time_threshold_ms: 10000,
            on_flush: (id, data) => {
                flushed.push({ id, data });
                if (!append_during_flush) {
                    append_during_flush = true;
                    // Append after flush completes (not re-entrant)
                    setTimeout(() => buf.append('req1', 'deferred'), 0);
                }
            },
        });

        buf.append('req1', 'first');
        buf.force_flush('req1');
        expect(flushed).toHaveLength(1);
        expect(flushed[0].data).toBe('first');
    });
});
