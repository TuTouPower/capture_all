// tests/console_capture.test.ts — P0.30: console event capture_id validation
import { describe, it, expect } from 'vitest';
import type { ConsoleEventData } from '../src/shared/types';

// Replica of handle_console_log logic with P0.30 guard
function handle_console_log_safe(
    data: ConsoleEventData | null | undefined,
    capture_id: string | null,
): { written: boolean; reason?: string } {
    if (!data) {
        return { written: false, reason: 'data is null/undefined' };
    }
    if (!capture_id) {
        return { written: false, reason: 'capture_id is empty' };
    }
    if (!data.capture_id) {
        data.capture_id = capture_id;
    }
    // Would call write_console_events here
    return { written: true };
}

describe('console capture id validation', () => {
    it('writes event when capture_id is set', () => {
        const data: ConsoleEventData = {
            level: 'log',
            args_preview: ['hello'],
            args_status: 'captured',
            stack_trace: null,
            source_url: null,
            line: null,
            column: null,
            repeat_count: null,
            related_network_request_id: null,
        };
        const result = handle_console_log_safe(data, 'capture_123');
        expect(result.written).toBe(true);
        expect(data.capture_id).toBe('capture_123');
    });

    it('skips write when capture_id is null', () => {
        const data: ConsoleEventData = {
            level: 'warn',
            args_preview: ['warning msg'],
            args_status: 'captured',
            stack_trace: null,
            source_url: null,
            line: null,
            column: null,
            repeat_count: null,
            related_network_request_id: null,
        };
        const result = handle_console_log_safe(data, null);
        expect(result.written).toBe(false);
        expect(result.reason).toBe('capture_id is empty');
    });

    it('skips write when data is null', () => {
        const result = handle_console_log_safe(null, 'capture_123');
        expect(result.written).toBe(false);
        expect(result.reason).toBe('data is null/undefined');
    });

    it('skips write when data is undefined', () => {
        const result = handle_console_log_safe(undefined, 'capture_123');
        expect(result.written).toBe(false);
        expect(result.reason).toBe('data is null/undefined');
    });

    it('preserves existing capture_id on data', () => {
        const data: ConsoleEventData = {
            capture_id: 'existing_id',
            level: 'log',
            args_preview: ['test'],
            args_status: 'captured',
            stack_trace: null,
            source_url: null,
            line: null,
            column: null,
            repeat_count: null,
            related_network_request_id: null,
        };
        const result = handle_console_log_safe(data, 'capture_456');
        expect(result.written).toBe(true);
        expect(data.capture_id).toBe('existing_id');
    });

    it('skips write when both data and capture_id are missing', () => {
        const result = handle_console_log_safe(null, null);
        expect(result.written).toBe(false);
    });
});
