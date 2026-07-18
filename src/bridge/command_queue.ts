import type { AgentCommand, AgentCommandResult, AgentCommandType } from '../shared/protocol';

interface PendingCommand {
    command: AgentCommand;
    resolve: (result: AgentCommandResult) => void;
    timeout_id: ReturnType<typeof setTimeout> | null;
}

export class AgentCommandQueue {
    private next_id = 1;
    private commands: AgentCommand[] = [];
    private pending = new Map<string, PendingCommand>();

    enqueue<TPayload>(type: AgentCommandType, payload: TPayload, timeout_ms = 30000): { command: AgentCommand<TPayload>; result: Promise<AgentCommandResult> } {
        const command: AgentCommand<TPayload> = {
            command_id: `cmd_${this.next_id++}`,
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

    pending_count(): number {
        return this.commands.length;
    }
}
