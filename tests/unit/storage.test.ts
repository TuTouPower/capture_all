// tests/storage.test.ts
import { describe, it, expect } from 'vitest';
import { get_capture_size, check_storage_limit } from '../../src/extension/background/storage';

describe('storage utilities', () => {
    it('get_capture_size returns 0 for unknown capture', () => {
        expect(get_capture_size('unknown')).toBe(0);
    });

    it('check_storage_limit returns false when under limit', async () => {
        const result = await check_storage_limit('test');
        expect(result).toBe(false);
    });
});
