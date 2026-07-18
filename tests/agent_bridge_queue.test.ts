import { describe, expect, it, vi } from 'vitest';
import { AgentCommandQueue } from '../src/bridge/command_queue';

describe('AgentCommandQueue', () => {
    it('queues commands and lets extension take them FIFO', () => {
        const queue = new AgentCommandQueue();

        const first = queue.enqueue('sessions.list', { limit: 1 });
        const second = queue.enqueue('sessions.get', { session_id: 's1' });

        expect(queue.pending_count()).toBe(2);
        expect(queue.take_next()).toEqual(first.command);
        expect(queue.take_next()).toEqual(second.command);
        expect(queue.take_next()).toBeNull();
    });

    it('resolves command result', async () => {
        const queue = new AgentCommandQueue();
        const pending = queue.enqueue('sessions.list', {});

        queue.resolve({ command_id: pending.command.command_id, ok: true, data: { sessions: [] } });

        await expect(pending.result).resolves.toEqual({
            command_id: pending.command.command_id,
            ok: true,
            data: { sessions: [] },
        });
    });

    it('rejects unknown command result', () => {
        const queue = new AgentCommandQueue();

        expect(() => queue.resolve({ command_id: 'missing', ok: true })).toThrow('Unknown command_id');
    });

    it('times out unresolved command', async () => {
        vi.useFakeTimers();
        const queue = new AgentCommandQueue();
        const pending = queue.enqueue('sessions.list', {}, 1000);

        vi.advanceTimersByTime(1000);

        expect(queue.pending_count()).toBe(0);
        expect(queue.take_next()).toBeNull();

        await expect(pending.result).resolves.toEqual({
            command_id: pending.command.command_id,
            ok: false,
            error: {
                code: 'COMMAND_TIMEOUT',
                message: 'Command timed out',
            },
        });
        vi.useRealTimers();
    });

    it('handles concurrent enqueue from multiple callers preserving FIFO order', async () => {
        const queue = new AgentCommandQueue();

        const p1 = queue.enqueue('sessions.list', { index: 0 });
        const p2 = queue.enqueue('sessions.get', { index: 1 });
        const p3 = queue.enqueue('console.list', { index: 2 });

        expect(queue.pending_count()).toBe(3);

        const first = queue.take_next();
        const second = queue.take_next();
        const third = queue.take_next();

        expect(first).not.toBeNull();
        expect(second).not.toBeNull();
        expect(third).not.toBeNull();
        expect(queue.take_next()).toBeNull();

        expect(first!.command_id).toBe(p1.command.command_id);
        expect(second!.command_id).toBe(p2.command.command_id);
        expect(third!.command_id).toBe(p3.command.command_id);
    });

    it('handles concurrent enqueue from 3 simultaneous callers with FIFO and no data loss', async () => {
        const queue = new AgentCommandQueue();

        const results = await Promise.all([
            Promise.resolve(queue.enqueue('sessions.list', { from: 'a' })),
            Promise.resolve(queue.enqueue('sessions.get', { from: 'b' })),
            Promise.resolve(queue.enqueue('console.list', { from: 'c' })),
        ]);

        expect(queue.pending_count()).toBe(3);

        for (let index = 0; index < 3; index += 1) {
            const taken = queue.take_next();
            expect(taken).not.toBeNull();
            expect(taken!.command_id).toBe(results[index].command.command_id);
        }

        expect(queue.take_next()).toBeNull();
    });

    it('stress test: rapid enqueue/dequeue cycle preserves integrity', async () => {
        const queue = new AgentCommandQueue();
        const rounds = 100;

        for (let round = 0; round < rounds; round += 1) {
            const pending = queue.enqueue('sessions.list', { round });
            const taken = queue.take_next();
            expect(taken).not.toBeNull();
            expect(taken!.command_id).toBe(pending.command.command_id);
            expect(taken!.payload).toEqual({ round });

            queue.resolve({
                command_id: pending.command.command_id,
                ok: true,
                data: { round },
            });

            const result = await pending.result;
            expect(result).toEqual({
                command_id: pending.command.command_id,
                ok: true,
                data: { round },
            });
        }

        expect(queue.pending_count()).toBe(0);
    });
});
