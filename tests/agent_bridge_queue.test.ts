import { describe, expect, it, vi } from 'vitest';
import { AgentCommandQueue } from '../src/agent/bridge/command_queue';

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
});
