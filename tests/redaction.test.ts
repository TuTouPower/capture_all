// tests/redaction.test.ts
import { describe, it, expect } from 'vitest';
import {
    redact_headers,
    redact_url,
    truncate,
    redact_password,
    truncate_request_body,
    truncate_response_body,
    truncate_console_args,
    truncate_target_text
} from '../src/shared/redaction';

describe('redact_headers', () => {
    it('redacts authorization header', () => {
        const headers = { 'Authorization': 'Bearer token123', 'Content-Type': 'application/json' };
        const result = redact_headers(headers);
        expect(result['Authorization']).toBe('[REDACTED]');
        expect(result['Content-Type']).toBe('application/json');
    });

    it('redacts cookie header', () => {
        const headers = { 'Cookie': 'session=abc123' };
        expect(redact_headers(headers)['Cookie']).toBe('[REDACTED]');
    });

    it('redacts headers containing sensitive words', () => {
        const headers = { 'x-auth-token': 'value', 'custom-key-header': 'value' };
        const result = redact_headers(headers);
        expect(result['x-auth-token']).toBe('[REDACTED]');
        expect(result['custom-key-header']).toBe('[REDACTED]');
    });

    it('keeps safe headers', () => {
        const headers = { 'Accept': 'application/json', 'User-Agent': 'test' };
        expect(redact_headers(headers)).toEqual(headers);
    });
});

describe('redact_url', () => {
    it('redacts sensitive query params when enabled', () => {
        const url = 'https://example.com?token=abc123&name=test';
        const result = redact_url(url, true);
        expect(result).toContain('token=%5BREDACTED%5D');
        expect(result).toContain('name=test');
    });

    it('returns original url when disabled', () => {
        const url = 'https://example.com?token=abc123';
        expect(redact_url(url, false)).toBe(url);
    });

    it('handles invalid url gracefully', () => {
        const url = 'not-a-url';
        expect(redact_url(url, true)).toBe(url);
    });
});

describe('truncate', () => {
    it('returns original string if under limit', () => {
        expect(truncate('hello', 10)).toBe('hello');
    });

    it('truncates string exceeding limit', () => {
        const result = truncate('hello world', 5);
        expect(result).toContain('...');
        expect(result).toContain('[TRUNCATED]');
    });
});

describe('redact_password', () => {
    it('redacts password fields', () => {
        expect(redact_password('secret', 'password')).toBe('[REDACTED]');
    });

    it('keeps non-password values', () => {
        expect(redact_password('test', 'text')).toBe('test');
    });
});

describe('truncate_request_body', () => {
    it('returns null for null input', () => {
        expect(truncate_request_body(null)).toBeNull();
    });

    it('returns original if under limit', () => {
        expect(truncate_request_body('small body')).toBe('small body');
    });
});

describe('truncate_response_body', () => {
    it('returns null for null input', () => {
        expect(truncate_response_body(null)).toBeNull();
    });
});

describe('truncate_console_args', () => {
    it('truncates each arg', () => {
        const args = ['short', 'a'.repeat(2000)];
        const result = truncate_console_args(args);
        expect(result[0]).toBe('short');
        expect(result[1]).toContain('[TRUNCATED]');
    });
});

describe('truncate_target_text', () => {
    it('keeps short text', () => {
        expect(truncate_target_text('test')).toBe('test');
    });

    it('truncates long text', () => {
        const result = truncate_target_text('a'.repeat(150));
        expect(result).toContain('[TRUNCATED]');
    });
});
