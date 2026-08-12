// @vitest-environment jsdom
// tests/unit/network_hook_body_cap.test.ts
// t153 AC-005: fallback hook 对超大响应体不全量缓冲——流式读超 cap 短路 too_large 并 cancel reader。
// 行为等价：cap 内完整捕获，cap 外截断 + too_large（与原整读后截断语义一致）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { build_page_script } from '../../src/extension/content/network_hook';
import { TEST_SECRET } from '../support/helpers/signed_message';

const CAP = 16;
const SIGNAL = '__capture_all_network_hook__';

function make_stream_reader(chunks: Uint8Array[]): { read: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> } {
    let i = 0;
    const cancel = vi.fn(async () => undefined);
    const read = vi.fn(async () => {
        if (i < chunks.length) return { done: false, value: chunks[i++] };
        return { done: true, value: undefined };
    });
    return { read, cancel };
}

function make_response(reader: { getReader: () => unknown }): object {
    return {
        status: 200,
        headers: { get: (k: string) => (k === 'content-type' ? 'text/plain' : null) },
        clone: vi.fn(() => ({ body: reader, text: () => Promise.resolve('') })),
    };
}

describe('fallback hook 响应体上限（t153 AC-005）', () => {
    let posted: Array<Record<string, unknown>>;
    const original_fetch = (globalThis as any).fetch;

    beforeEach(() => {
        posted = [];
        (window as any).__capture_all_network_hook_installed__ = false;
        (window as any).__capture_all_network_nonce__ = 'test-nonce';
        vi.spyOn(window, 'postMessage').mockImplementation((data: unknown) => {
            if (data && (data as { source: string }).source === SIGNAL) posted.push(data as Record<string, unknown>);
        });
    });

    afterEach(() => {
        (globalThis as any).fetch = original_fetch;
        vi.restoreAllMocks();
    });

    it('超大流式响应体超 cap 短路 too_large，cancel reader 且不读完所有 chunk', async () => {
        const reader = make_stream_reader([
            new Uint8Array(8).fill(65), // 8 × 'A'
            new Uint8Array(8).fill(65),
            new Uint8Array(8).fill(65),
            new Uint8Array(8).fill(65),
        ]);
        (globalThis as any).fetch = vi.fn(async () => make_response({ getReader: () => reader }));
        // eslint-disable-next-line no-eval
        eval(build_page_script(true, TEST_SECRET, CAP));

        await (globalThis as any).fetch('https://example.com/x');
        await new Promise((r) => setTimeout(r, 20));

        const msg = posted[0];
        expect(msg).toBeDefined();
        expect(msg.response_body_status).toBe('too_large');
        // 只取 cap 前缀 + 截断标记，而非全量
        expect(msg.response_body).toBe('A'.repeat(CAP) + '...[TRUNCATED]');
        // 短路：未读完全部 chunk，且 reader 被 cancel（非全量缓冲）
        expect(reader.cancel).toHaveBeenCalledTimes(1);
        expect(reader.read.mock.calls.length).toBeLessThan(4);
    });

    it('cap 内响应体完整捕获（行为不变）', async () => {
        const reader = make_stream_reader([new TextEncoder().encode('hello')]);
        (globalThis as any).fetch = vi.fn(async () => make_response({ getReader: () => reader }));
        // eslint-disable-next-line no-eval
        eval(build_page_script(true, TEST_SECRET, CAP));

        await (globalThis as any).fetch('https://example.com/ok');
        await new Promise((r) => setTimeout(r, 20));

        const msg = posted[0];
        expect(msg).toBeDefined();
        expect(msg.response_body_status).toBe('captured');
        expect(msg.response_body).toBe('hello');
        expect(reader.cancel).not.toHaveBeenCalled();
    });

    it('非流式响应（无 body.getReader）回退整读后截断（原路径保留）', async () => {
        // read_body_capped 的 response 参数是 process_response 里已 clone 的副本；
        // 回退路径再 clone 一次读取（与真实 Response 语义一致，clone 可再 clone）。
        const fallback_clone = {
            body: null,
            text: () => Promise.resolve('x'.repeat(CAP * 2)),
            clone: () => ({ body: null, text: () => Promise.resolve('x'.repeat(CAP * 2)) }),
        };
        (globalThis as any).fetch = vi.fn(async () => ({
            status: 200,
            headers: { get: (k: string) => (k === 'content-type' ? 'text/plain' : null) },
            clone: vi.fn(() => fallback_clone),
        }));
        // eslint-disable-next-line no-eval
        eval(build_page_script(true, TEST_SECRET, CAP));

        await (globalThis as any).fetch('https://example.com/fallback');
        await new Promise((r) => setTimeout(r, 20));

        const msg = posted[0];
        expect(msg).toBeDefined();
        expect(msg.response_body_status).toBe('too_large');
        expect(msg.response_body).toBe('x'.repeat(CAP) + '...[TRUNCATED]');
    });
});
