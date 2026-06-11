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
import { MAX_REQUEST_BODY_BYTES, MAX_RESPONSE_BODY_BYTES } from '../src/shared/constants';

describe('redact_headers', () => {
    it('redacts authorization header', () => {
        const headers = { 'Authorization': 'Bearer token123', 'Content-Type': 'application/json' };
        const result = redact_headers(headers);
        expect(result.headers['Authorization']).toBe('[REDACTED]');
        expect(result.headers['Content-Type']).toBe('application/json');
    });

    it('redacts cookie header', () => {
        const headers = { 'Cookie': 'session=abc123' };
        expect(redact_headers(headers).headers['Cookie']).toBe('[REDACTED]');
    });

    it('redacts headers containing sensitive words', () => {
        const headers = { 'x-auth-token': 'value', 'custom-key-header': 'value' };
        const result = redact_headers(headers);
        expect(result.headers['x-auth-token']).toBe('[REDACTED]');
        expect(result.headers['custom-key-header']).toBe('[REDACTED]');
    });

    it('keeps safe headers', () => {
        const headers = { 'Accept': 'application/json', 'User-Agent': 'test' };
        expect(redact_headers(headers).headers).toEqual(headers);
    });

    it('redacts header names case-insensitively', () => {
        const headers = {
            'authorization': 'Bearer lowercase',
            'AUTHORIZATION': 'Bearer uppercase',
            'Cookie': 'session=abc',
            'COOKIE': 'session=xyz',
            'Content-Type': 'application/json'
        };
        const result = redact_headers(headers);
        expect(result.headers['authorization']).toBe('[REDACTED]');
        expect(result.headers['AUTHORIZATION']).toBe('[REDACTED]');
        expect(result.headers['Cookie']).toBe('[REDACTED]');
        expect(result.headers['COOKIE']).toBe('[REDACTED]');
        expect(result.headers['Content-Type']).toBe('application/json');
    });

    it('redacts sensitive patterns in header values', () => {
        const headers = {
            'X-Custom-Data': 'token=abc123',
            'X-Forwarded-For': '192.168.1.1',
            'X-Api-Gateway': 'Bearer xyz789',
            'X-Request-ID': 'req-12345'
        };
        const result = redact_headers(headers);
        expect(result.headers['X-Custom-Data']).toBe('[REDACTED]');
        expect(result.headers['X-Api-Gateway']).toBe('[REDACTED]');
        expect(result.headers['X-Forwarded-For']).toBe('192.168.1.1');
        expect(result.headers['X-Request-ID']).toBe('req-12345');
    });
});

describe('redact_url', () => {
    it('redacts sensitive query params when enabled', () => {
        const url = 'https://example.com?token=abc123&name=test';
        const result = redact_url(url, true);
        expect(result.url).toContain('token=%5BREDACTED%5D');
        expect(result.url).toContain('name=test');
    });

    it('returns original url when disabled', () => {
        const url = 'https://example.com?token=abc123';
        expect(redact_url(url, false).url).toBe(url);
    });

    it('handles invalid url gracefully', () => {
        const url = 'not-a-url';
        expect(redact_url(url, true).url).toBe(url);
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

    it('truncates body even when redact_data would be false', () => {
        const big_body = 'x'.repeat(MAX_REQUEST_BODY_BYTES + 1000);
        const result = truncate_request_body(big_body);
        expect(result).not.toBeNull();
        expect(result!.length).toBeLessThan(big_body.length);
        expect(result).toContain('[TRUNCATED]');
    });
});

describe('truncate_response_body', () => {
    it('returns null for null input', () => {
        expect(truncate_response_body(null).body).toBeNull();
    });

    it('truncates large body unconditionally', () => {
        const big_body = 'y'.repeat(MAX_RESPONSE_BODY_BYTES + 500);
        const result = truncate_response_body(big_body);
        expect(result.body).not.toBeNull();
        expect(result.body!.length).toBeLessThan(big_body.length);
        expect(result.body).toContain('[TRUNCATED]');
    });
});

describe('truncate_console_args', () => {
    it('truncates each arg regardless of redact_data', () => {
        const args = ['short', 'a'.repeat(2000)];
        const result = truncate_console_args(args);
        expect(result[0]).toBe('short');
        expect(result[1]).toContain('[TRUNCATED]');
    });
});

// redaction split: redact_data=false means no redaction but truncation still applies
describe('redaction_and_truncation_split', () => {
    it('redact_headers skips redaction when disabled', () => {
        const headers = { 'Authorization': 'Bearer token123', 'Cookie': 'session=abc' };
        const result = redact_headers(headers, false).headers;
        expect(result['Authorization']).toBe('Bearer token123');
        expect(result['Cookie']).toBe('session=abc');
    });

    it('truncate_request_body always truncates by size', () => {
        const big_body = 'a'.repeat(MAX_REQUEST_BODY_BYTES + 100);
        const result = truncate_request_body(big_body);
        expect(result).not.toBeNull();
        expect(result!.length).toBeLessThanOrEqual(MAX_REQUEST_BODY_BYTES + 20); // +20 for truncation marker
    });

    it('redact_password keeps value when disabled', () => {
        expect(redact_password('secret', 'password', false)).toBe('secret');
    });

    it('redact_password hides value when enabled', () => {
        expect(redact_password('secret', 'password', true)).toBe('[REDACTED]');
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
