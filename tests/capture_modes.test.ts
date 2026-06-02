// tests/capture_modes.test.ts
import { describe, it, expect } from 'vitest';
import { get_basic_config, get_advanced_config } from '../shared/capture_modes';

describe('capture_modes', () => {
    it('basic config has safe defaults', () => {
        const config = get_basic_config();
        expect(config.capture_mode).toBe('basic');
        expect(config.capture_console).toBe(false);
        expect(config.keyboard_capture_mode).toBe('none');
        expect(config.capture_input_values).toBe(false);
        expect(config.redact_sensitive_headers).toBe(true);
    });

    it('advanced config enables all features', () => {
        const config = get_advanced_config();
        expect(config.capture_mode).toBe('advanced');
        expect(config.capture_console).toBe(true);
        expect(config.keyboard_capture_mode).toBe('all');
        expect(config.capture_input_values).toBe(true);
        expect(config.redact_sensitive_headers).toBe(true);
    });
});
