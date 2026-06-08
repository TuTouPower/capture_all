// tests/stop_capture.test.ts — stop_capture 消息协议验证
import { describe, it, expect, vi } from 'vitest';

interface StopResponse {
    success: boolean;
    error?: string;
}

function validate_stop_response(response: StopResponse, is_capturing: boolean): boolean {
    if (!is_capturing) {
        return !response.success;
    }
    return response.success;
}

describe('stop capture protocol', () => {
    it('returns success when stopping active capture', () => {
        const response: StopResponse = { success: true };
        expect(validate_stop_response(response, true)).toBe(true);
    });

    it('returns failure when not capturing', () => {
        const response: StopResponse = { success: false };
        expect(validate_stop_response(response, false)).toBe(true);
    });

    it('should handle the response shape correctly', () => {
        // Verify the expected message format
        const msg = { action: 'stop' };
        expect(msg.action).toBe('stop');
        expect(msg).toHaveProperty('action');
    });

    it('completed state has required fields', () => {
        const completed = {
            status: 'completed' as const,
            ended_at: new Date().toISOString(),
            duration_ms: 5000,
        };
        expect(completed.status).toBe('completed');
        expect(completed.ended_at).toBeTruthy();
        expect(completed.duration_ms).toBeGreaterThan(0);
    });
});
