import { describe, it, expect } from 'vitest';
import {
    MAX_BODY_CAPTURE_BYTES,
    INLINE_TEXT_MAX_BYTES,
    DEFAULT_CONFIG,
    DEFAULT_USER_CONFIG,
} from '../src/shared/constants';

describe('body size config migration', () => {
    it('exposes 100MB capture ceiling and 32KB inline threshold', () => {
        expect(MAX_BODY_CAPTURE_BYTES).toBe(104857600);
        expect(INLINE_TEXT_MAX_BYTES).toBe(32768);
    });

    it('DEFAULT_CONFIG carries new fields and drops old ones', () => {
        expect(DEFAULT_CONFIG.max_body_capture_bytes).toBe(104857600);
        expect(DEFAULT_CONFIG.inline_text_max_bytes).toBe(32768);
        expect('max_request_body_bytes' in DEFAULT_CONFIG).toBe(false);
        expect('max_response_body_bytes' in DEFAULT_CONFIG).toBe(false);
    });

    it('DEFAULT_USER_CONFIG carries new fields and drops old ones', () => {
        expect(DEFAULT_USER_CONFIG.max_body_capture_bytes).toBe(104857600);
        expect(DEFAULT_USER_CONFIG.inline_text_max_bytes).toBe(32768);
        expect('max_request_body_bytes' in DEFAULT_USER_CONFIG).toBe(false);
        expect('max_response_body_bytes' in DEFAULT_USER_CONFIG).toBe(false);
    });
});
