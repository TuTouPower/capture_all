// tests/network_capture.test.ts
import { describe, it, expect } from 'vitest';
import {
    redact_headers,
    truncate_request_body,
    truncate,
    redact_url
} from '../src/shared/redaction';
import { MAX_REQUEST_BODY_BYTES } from '../src/shared/constants';

// ─── helpers ported from background/network_capture.ts ───
// These are pure logic functions that live inside the module.
// We replicate them here so we can unit-test the logic in isolation.

function headers_array_to_map(
    arr: Array<{ name: string; value?: string }> | undefined
): Record<string, string> {
    const out: Record<string, string> = {};
    if (!arr) return out;
    for (const h of arr) {
        out[h.name] = h.value || '';
    }
    return out;
}

function encode_form_data(form: Record<string, string | string[]>): string {
    const parts: string[] = [];
    for (const [key, values] of Object.entries(form)) {
        const vals = Array.isArray(values) ? values : [values];
        for (const v of vals) {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
        }
    }
    return parts.join('&');
}

function decode_raw_body(raw: Array<{ bytes?: ArrayBuffer }>): string {
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const parts: string[] = [];
    for (const part of raw) {
        if (part.bytes) {
            parts.push(decoder.decode(part.bytes));
        }
    }
    return parts.join('');
}

type BodyCaptureStatus = 'not_enabled' | 'captured' | 'failed' | 'too_large' | 'unsupported';

interface ExtractResult {
    body: string | null;
    status: BodyCaptureStatus;
}

function extract_request_body(
    details: any,
    capture_enabled: boolean
): ExtractResult {
    if (!capture_enabled) {
        return { body: null, status: 'not_enabled' };
    }
    const rb = details.requestBody;
    if (!rb) {
        return { body: null, status: 'unsupported' };
    }
    if (rb.error) {
        return { body: null, status: 'failed' };
    }

    let body: string | null = null;
    if (rb.formData) {
        body = encode_form_data(rb.formData);
    } else if (rb.raw && Array.isArray(rb.raw) && rb.raw.length > 0) {
        try {
            body = decode_raw_body(rb.raw);
        } catch {
            return { body: null, status: 'failed' };
        }
    } else {
        return { body: null, status: 'unsupported' };
    }

    if (body === null || body.length === 0) {
        return { body, status: 'captured' };
    }

    const byte_len = new TextEncoder().encode(body).length;
    if (byte_len > MAX_REQUEST_BODY_BYTES) {
        return { body: truncate_request_body(body), status: 'too_large' };
    }
    return { body, status: 'captured' };
}

// ─── request header redaction ───

describe('request_header_redaction', () => {
    it('redacts authorization header when redact_data=true', () => {
        const headers = {
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.token',
            'Content-Type': 'application/json',
            'Accept': 'text/html'
        };
        const result = redact_headers(headers, true).headers;
        expect(result['Authorization']).toBe('[REDACTED]');
        expect(result['Content-Type']).toBe('application/json');
        expect(result['Accept']).toBe('text/html');
    });

    it('redacts cookie header when redact_data=true', () => {
        const headers = {
            'Cookie': 'session_id=abc123; user=john',
            'Host': 'example.com'
        };
        const result = redact_headers(headers, true).headers;
        expect(result['Cookie']).toBe('[REDACTED]');
        expect(result['Host']).toBe('example.com');
    });

    it('redacts x-api-key header when redact_data=true', () => {
        const headers = {
            'X-Api-Key': 'sk-1234567890abcdef',
            'Accept': 'application/json'
        };
        const result = redact_headers(headers, true).headers;
        expect(result['X-Api-Key']).toBe('[REDACTED]');
        expect(result['Accept']).toBe('application/json');
    });

    it('redacts headers containing sensitive patterns (token, key, secret)', () => {
        const headers = {
            'X-CSRF-Token': 'csrf-value',
            'Custom-Key-Header': 'custom-value',
            'X-Bearer-Token': 'bearer-val',
            'Normal-Header': 'safe'
        };
        const result = redact_headers(headers, true).headers;
        expect(result['X-CSRF-Token']).toBe('[REDACTED]');
        expect(result['Custom-Key-Header']).toBe('[REDACTED]');
        expect(result['X-Bearer-Token']).toBe('[REDACTED]');
        expect(result['Normal-Header']).toBe('safe');
    });

    it('passes all headers unchanged when redact_data=false', () => {
        const headers = {
            'Authorization': 'Bearer secret-token',
            'Cookie': 'session=abc',
            'X-Api-Key': 'key123',
            'Content-Type': 'application/json'
        };
        const result = redact_headers(headers, false).headers;
        expect(result).toEqual(headers);
    });

    it('redacts proxy-authorization header', () => {
        const headers = { 'Proxy-Authorization': 'Basic dXNlcjpwYXNz' };
        const result = redact_headers(headers, true).headers;
        expect(result['Proxy-Authorization']).toBe('[REDACTED]');
    });
});

// ─── response header redaction ───

describe('response_header_redaction', () => {
    it('redacts set-cookie in response headers', () => {
        const headers = {
            'Set-Cookie': 'id=abc123; HttpOnly; Secure',
            'Content-Type': 'text/html'
        };
        const result = redact_headers(headers, true).headers;
        expect(result['Set-Cookie']).toBe('[REDACTED]');
        expect(result['Content-Type']).toBe('text/html');
    });

    it('redacts www-authenticate in response headers', () => {
        const headers = {
            'WWW-Authenticate': 'Bearer realm="example"',
            'Cache-Control': 'no-cache'
        };
        const result = redact_headers(headers, true).headers;
        expect(result['WWW-Authenticate']).toBe('[REDACTED]');
        expect(result['Cache-Control']).toBe('no-cache');
    });

    it('keeps safe response headers unchanged', () => {
        const headers = {
            'Content-Type': 'application/json',
            'Cache-Control': 'max-age=3600',
            'X-Request-Id': 'req-123'
        };
        const result = redact_headers(headers, true).headers;
        expect(result).toEqual(headers);
    });
});

// ─── headers_array_to_map ───

describe('headers_array_to_map', () => {
    it('converts chrome HttpHeaders array to name-value map', () => {
        const chrome_headers = [
            { name: 'Content-Type', value: 'application/json' },
            { name: 'Authorization', value: 'Bearer token' },
            { name: 'Accept', value: 'text/html' }
        ];
        const result = headers_array_to_map(chrome_headers);
        expect(result).toEqual({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer token',
            'Accept': 'text/html'
        });
    });

    it('handles undefined input', () => {
        expect(headers_array_to_map(undefined)).toEqual({});
    });

    it('handles empty array', () => {
        expect(headers_array_to_map([])).toEqual({});
    });

    it('defaults to empty string when value is undefined', () => {
        const chrome_headers = [
            { name: 'X-Empty' }
        ];
        const result = headers_array_to_map(chrome_headers);
        expect(result['X-Empty']).toBe('');
    });
});

// ─── request body truncation ───

describe('request_body_truncation', () => {
    it('returns null for null body', () => {
        expect(truncate_request_body(null)).toBeNull();
    });

    it('returns original body when under 10KB limit', () => {
        const body = 'small body content';
        expect(truncate_request_body(body)).toBe(body);
    });

    it('truncates body exceeding MAX_REQUEST_BODY_BYTES', () => {
        const big_body = 'x'.repeat(MAX_REQUEST_BODY_BYTES + 1000);
        const result = truncate_request_body(big_body);
        expect(result).not.toBeNull();
        expect(result!.length).toBeLessThan(big_body.length);
        expect(result).toContain('[TRUNCATED]');
    });

    it('extract_request_body marks large body as too_large', () => {
        const big_body = 'y'.repeat(MAX_REQUEST_BODY_BYTES + 100);
        const details = {
            requestBody: {
                raw: [{ bytes: new TextEncoder().encode(big_body).buffer }]
            }
        };
        const result = extract_request_body(details, true);
        expect(result.status).toBe('too_large');
        expect(result.body).toContain('[TRUNCATED]');
    });

    it('extract_request_body marks small body as captured', () => {
        const details = {
            requestBody: {
                raw: [{ bytes: new TextEncoder().encode('hello').buffer }]
            }
        };
        const result = extract_request_body(details, true);
        expect(result.status).toBe('captured');
        expect(result.body).toBe('hello');
    });

    it('extract_request_body returns not_enabled when capture disabled', () => {
        const details = { requestBody: { raw: [{ bytes: new ArrayBuffer(0) }] } };
        const result = extract_request_body(details, false);
        expect(result.status).toBe('not_enabled');
        expect(result.body).toBeNull();
    });
});

// ─── body parsing ───

describe('body_parsing_formdata', () => {
    it('encodes simple key-value formData', () => {
        const form = { username: 'john', password: 'secret' };
        const result = encode_form_data(form);
        expect(result).toContain('username=john');
        expect(result).toContain('password=secret');
        expect(result).toContain('&');
    });

    it('encodes array values in formData', () => {
        const form = { colors: ['red', 'blue', 'green'] };
        const result = encode_form_data(form);
        expect(result).toContain('colors=red');
        expect(result).toContain('colors=blue');
        expect(result).toContain('colors=green');
    });

    it('encodes special characters in formData', () => {
        const form = { query: 'hello world&more' };
        const result = encode_form_data(form);
        expect(result).toContain(encodeURIComponent('hello world&more'));
    });

    it('extract_request_body parses formData correctly', () => {
        const details = {
            requestBody: {
                formData: { name: 'test', value: '123' }
            }
        };
        const result = extract_request_body(details, true);
        expect(result.status).toBe('captured');
        expect(result.body).toContain('name=test');
        expect(result.body).toContain('value=123');
    });
});

describe('body_parsing_raw', () => {
    it('decodes raw body from ArrayBuffer parts', () => {
        const text = '{"action":"click","x":100}';
        const raw = [{ bytes: new TextEncoder().encode(text).buffer }];
        const result = decode_raw_body(raw);
        expect(result).toBe(text);
    });

    it('concatenates multiple raw parts', () => {
        const part1 = 'hello ';
        const part2 = 'world';
        const raw = [
            { bytes: new TextEncoder().encode(part1).buffer },
            { bytes: new TextEncoder().encode(part2).buffer }
        ];
        expect(decode_raw_body(raw)).toBe('hello world');
    });

    it('handles raw parts without bytes', () => {
        const raw = [{}];
        expect(decode_raw_body(raw)).toBe('');
    });

    it('extract_request_body parses raw body correctly', () => {
        const text = '{"key":"value"}';
        const details = {
            requestBody: {
                raw: [{ bytes: new TextEncoder().encode(text).buffer }]
            }
        };
        const result = extract_request_body(details, true);
        expect(result.status).toBe('captured');
        expect(result.body).toBe(text);
    });

    it('extract_request_body returns unsupported when no body present', () => {
        const result = extract_request_body({ requestBody: {} }, true);
        expect(result.status).toBe('unsupported');
        expect(result.body).toBeNull();
    });

    it('extract_request_body returns unsupported when requestBody is missing', () => {
        const result = extract_request_body({}, true);
        expect(result.status).toBe('unsupported');
    });

    it('extract_request_body returns failed when requestBody has error', () => {
        const details = { requestBody: { error: 'net::ERR_BLOCKED_BY_CLIENT' } };
        const result = extract_request_body(details, true);
        expect(result.status).toBe('failed');
        expect(result.body).toBeNull();
    });
});

// ─── URL redaction in network context ───

describe('url_redaction_in_network', () => {
    it('redacts sensitive query params in request URL', () => {
        const url = 'https://api.example.com/data?token=secret123&name=test';
        const result = redact_url(url, true).url;
        expect(result).toContain('token=%5BREDACTED%5D');
        expect(result).toContain('name=test');
    });

    it('redacts auth and password params', () => {
        const url = 'https://example.com/login?auth=abc&password=xyz&user=john';
        const result = redact_url(url, true).url;
        expect(result).toContain('auth=%5BREDACTED%5D');
        expect(result).toContain('password=%5BREDACTED%5D');
        expect(result).toContain('user=john');
    });

    it('returns URL unchanged when redact is disabled', () => {
        const url = 'https://example.com?token=secret';
        expect(redact_url(url, false).url).toBe(url);
    });
});
