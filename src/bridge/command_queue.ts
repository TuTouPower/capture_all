import type { AgentCommand, AgentCommandResult, AgentCommandType } from '../shared/protocol';
import { randomUUID } from 'node:crypto';

interface PendingCommand {
    command: AgentCommand;
    resolve: (result: AgentCommandResult) => void;
    timeout_id: ReturnType<typeof setTimeout> | null;
}

// 进程级全局单调计数器，保证跨实例命令 ID 唯一
let global_command_counter = 0;

function generate_command_id(): string {
    global_command_counter += 1;
    // UUID 后缀防止跨进程/跨重启碰撞
    return `cmd_${global_command_counter}_${randomUUID()}`;
}

export class AgentCommandQueue {
    private commands: AgentCommand[] = [];
    private pending = new Map<string, PendingCommand>();

    enqueue<TPayload>(type: AgentCommandType, payload: TPayload, timeout_ms = 30000): { command: AgentCommand<TPayload>; result: Promise<AgentCommandResult> } {
        const command: AgentCommand<TPayload> = {
            command_id: generate_command_id(),
            type,
            payload,
            created_at: Date.now(),
        };

        const result = new Promise<AgentCommandResult>((resolve) => {
            const timeout_id = setTimeout(() => {
                this.pending.delete(command.command_id);
                this.commands = this.commands.filter((queued_command) => queued_command.command_id !== command.command_id);
                resolve({
                    command_id: command.command_id,
                    ok: false,
                    error: {
                        code: 'COMMAND_TIMEOUT',
                        message: 'Command timed out',
                    },
                });
            }, timeout_ms);

            this.pending.set(command.command_id, { command, resolve, timeout_id });
            this.commands.push(command);
        });

        return { command, result };
    }

    take_next(): AgentCommand | null {
        return this.commands.shift() || null;
    }

    resolve(result: AgentCommandResult): void {
        const pending = this.pending.get(result.command_id);

        if (!pending) {
            throw new Error(`Unknown command_id: ${result.command_id}`);
        }

        if (pending.timeout_id) {
            clearTimeout(pending.timeout_id);
        }

        this.pending.delete(result.command_id);
        pending.resolve(result);
    }

    // 取消所有 pending 命令：清理 timer、命令数组、pending map，
    // 每个命令以 COMMAND_CANCELLED resolve。实例顶替或 server close 时调用。
    cancel_all(): void {
        const entries = [...this.pending.values()];
        this.commands = [];
        this.pending.clear();
        for (const entry of entries) {
            if (entry.timeout_id) {
                clearTimeout(entry.timeout_id);
            }
            entry.resolve({
                command_id: entry.command.command_id,
                ok: false,
                error: { code: 'COMMAND_CANCELLED', message: 'Command cancelled' },
            });
        }
    }

    pending_count(): number {
        return this.commands.length;
    }
}
