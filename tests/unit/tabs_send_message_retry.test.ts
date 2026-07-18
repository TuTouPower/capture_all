// tabs_send_message_retry 行为：通过 service_worker 内逻辑的可测副本验证重试
// （service_worker 模块过重，此处测同等算法）
import { describe, it, expect, vi, beforeEach } from 'vitest';

async function tabs_send_message_retry(
    send: (tab_id: number, msg: unknown) => Promise<void>,
    tab_id: number,
    message: unknown,
    opts: { retries?: number; delay_ms?: number } = {}
): Promise<boolean> {
    const retries = opts.retries ?? 3;
    const delay_ms = opts.delay_ms ?? 1;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await send(tab_id, message);
            return true;
        } catch {
            if (attempt < retries) {
                await new Promise((r) => setTimeout(r, delay_ms));
            }
        }
    }
    return false;
}

describe('tabs_send_message_retry', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    it('succeeds on first try', async () => {
        const send = vi.fn().mockResolvedValue(undefined);
        const p = tabs_send_message_retry(send, 1, { action: 'start' });
        await expect(p).resolves.toBe(true);
        expect(send).toHaveBeenCalledTimes(1);
    });

    it('retries after Receiving end does not exist then succeeds', async () => {
        const send = vi.fn()
            .mockRejectedValueOnce(new Error('Receiving end does not exist'))
            .mockRejectedValueOnce(new Error('Receiving end does not exist'))
            .mockResolvedValueOnce(undefined);

        const p = tabs_send_message_retry(send, 9, { action: 'start' }, { retries: 3, delay_ms: 5 });
        await vi.runAllTimersAsync();
        await expect(p).resolves.toBe(true);
        expect(send).toHaveBeenCalledTimes(3);
    });

    it('returns false after all retries fail', async () => {
        const send = vi.fn().mockRejectedValue(new Error('Receiving end does not exist'));
        const p = tabs_send_message_retry(send, 2, { action: 'stop' }, { retries: 2, delay_ms: 1 });
        await vi.runAllTimersAsync();
        await expect(p).resolves.toBe(false);
        expect(send).toHaveBeenCalledTimes(2);
    });
});
