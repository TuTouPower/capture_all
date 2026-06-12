// tests/network_capture.test.ts
import { describe, it, expect } from 'vitest';
import {
    redact_headers,
    truncate_request_body,
    truncate,
    redact_url
} from '../src/shared/redaction';
import { MAX_REQUEST_BODY_BYTES } from '../src/shared/constants';
import {
    decode_raw_body,
    encode_form_data,
    extract_request_body,
    build_cdp_body_result,
    headers_array_to_map,
    find_matching_cdp_request,
    find_cdp_candidates,
    resolve_resource_type,
    _cdp_request_meta_for_test,
    _cdp_body_results_for_test,
    _deferred_web_requests_for_test,
    _deferred_cdp_index_for_test,
    _try_resolve_deferred_for_test,
} from '../src/background/network_capture';

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

    it('extract_request_body uses configured byte limit', () => {
        const body = 'z'.repeat(20);
        const details = {
            requestBody: {
                raw: [{ bytes: new TextEncoder().encode(body).buffer }]
            }
        };

        const result = extract_request_body(details, true, 10);

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

describe('response_body_truncation', () => {
    it('build_cdp_body_result uses configured byte limit', () => {
        const body = 'r'.repeat(20);

        const result = build_cdp_body_result(body, 10);

        expect(result.status).toBe('too_large');
        expect(result.body).toContain('[TRUNCATED]');
        expect(result.preview).toBe(body);
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

// ─── CDP request matching ───

describe('find_matching_cdp_request', () => {
    function add_meta(id: string, overrides: Partial<{ url: string; method: string; status_code: number; timestamp: number }> = {}) {
        _cdp_request_meta_for_test.set(id, {
            url: overrides.url || 'https://example.com/api',
            method: overrides.method || 'GET',
            status_code: overrides.status_code ?? 200,
            resource_type: 'xhr',
            response_headers: {},
            request_headers: {},
            timestamp: overrides.timestamp || 1700000000000,
            request_body: null,
            request_body_status: 'not_enabled',
        });
    }

    beforeEach(() => {
        _cdp_request_meta_for_test.clear();
    });

    it('matches by URL + method + status + timestamp window', () => {
        add_meta('cdp_1', { url: 'https://example.com/api', method: 'GET', status_code: 200, timestamp: 1700000000000 });
        const result = find_matching_cdp_request('https://example.com/api', 'GET', 200, 1700000000000);
        expect(result).toBe('cdp_1');
    });

    it('matches URLs differing only by query string', () => {
        add_meta('cdp_1', { url: 'https://example.com/api?t=1', method: 'GET', status_code: 200, timestamp: 1700000000000 });
        const result = find_matching_cdp_request('https://example.com/api?t=2', 'GET', 200, 1700000000000);
        expect(result).toBe('cdp_1');
    });

    it('matches when CDP status_code is 0 (response not yet received)', () => {
        add_meta('cdp_1', { url: 'https://example.com/api', method: 'GET', status_code: 0, timestamp: 1700000000000 });
        const result = find_matching_cdp_request('https://example.com/api', 'GET', 200, 1700000000000);
        expect(result).toBe('cdp_1');
    });

    it('returns null when method differs', () => {
        add_meta('cdp_1', { url: 'https://example.com/api', method: 'POST', status_code: 200, timestamp: 1700000000000 });
        const result = find_matching_cdp_request('https://example.com/api', 'GET', 200, 1700000000000);
        expect(result).toBeNull();
    });

    it('returns null when URL base differs', () => {
        add_meta('cdp_1', { url: 'https://other.com/api', method: 'GET', status_code: 200, timestamp: 1700000000000 });
        const result = find_matching_cdp_request('https://example.com/api', 'GET', 200, 1700000000000);
        expect(result).toBeNull();
    });

    it('returns null when timestamp outside 2s window', () => {
        add_meta('cdp_1', { url: 'https://example.com/api', method: 'GET', status_code: 200, timestamp: 1700000005000 });
        const result = find_matching_cdp_request('https://example.com/api', 'GET', 200, 1700000000000);
        expect(result).toBeNull();
    });

    it('returns best match by timestamp when multiple candidates', () => {
        add_meta('cdp_1', { url: 'https://example.com/api', method: 'GET', status_code: 200, timestamp: 1700000001000 });
        add_meta('cdp_2', { url: 'https://example.com/api', method: 'GET', status_code: 200, timestamp: 1700000000500 });
        const result = find_matching_cdp_request('https://example.com/api', 'GET', 200, 1700000000000);
        expect(result).toBe('cdp_2'); // closer timestamp
    });

    it('returns null when no CDP meta exists', () => {
        const result = find_matching_cdp_request('https://example.com/api', 'GET', 200, 1700000000000);
        expect(result).toBeNull();
    });
});

describe('find_cdp_candidates', () => {
    function add_meta(id: string, overrides: Partial<{ url: string; method: string; status_code: number }> = {}) {
        _cdp_request_meta_for_test.set(id, {
            url: overrides.url || 'https://example.com/api',
            method: overrides.method || 'GET',
            status_code: overrides.status_code ?? 200,
            resource_type: 'xhr',
            response_headers: {},
            request_headers: {},
            timestamp: 1700000000000,
            request_body: null,
            request_body_status: 'not_enabled',
        });
    }

    beforeEach(() => {
        _cdp_request_meta_for_test.clear();
    });

    it('returns matching candidates by URL base + method', () => {
        add_meta('cdp_1', { url: 'https://example.com/api', method: 'GET', status_code: 200 });
        add_meta('cdp_2', { url: 'https://example.com/api', method: 'GET', status_code: 200 });
        const result = find_cdp_candidates('https://example.com/api', 'GET', 200);
        expect(result).toEqual(['cdp_1', 'cdp_2']);
    });

    it('includes status_code=0 candidates', () => {
        add_meta('cdp_1', { url: 'https://example.com/api', method: 'GET', status_code: 0 });
        const result = find_cdp_candidates('https://example.com/api', 'GET', 200);
        expect(result).toEqual(['cdp_1']);
    });

    it('excludes candidates with different method', () => {
        add_meta('cdp_1', { url: 'https://example.com/api', method: 'POST', status_code: 200 });
        const result = find_cdp_candidates('https://example.com/api', 'GET', 200);
        expect(result).toEqual([]);
    });
});

// ─── P0.15-R1: multi-candidate deferred queue race condition ───

describe('deferred queue multi-candidate resolution', () => {
    beforeEach(() => {
        _cdp_request_meta_for_test.clear();
        _cdp_body_results_for_test.clear();
        _deferred_web_requests_for_test.clear();
        _deferred_cdp_index_for_test.clear();
    });

    it('_deferred_cdp_index stores Set values (not single strings)', () => {
        const key_set = new Set(['dk_1', 'dk_2']);
        _deferred_cdp_index_for_test.set('cdp_shared', key_set);

        const retrieved = _deferred_cdp_index_for_test.get('cdp_shared');
        expect(retrieved).toBeInstanceOf(Set);
        expect(retrieved!.size).toBe(2);
        expect(retrieved!.has('dk_1')).toBe(true);
        expect(retrieved!.has('dk_2')).toBe(true);
    });

    it('DeferredEntry includes pending_cdp_ids Set', () => {
        _deferred_web_requests_for_test.set('dk_1', {
            pending: {
                cdp_request_id: 'req_a', tab_id: 1, method: 'GET', url: '/a',
                timestamp: 1700000000000, request_headers: {}, response_headers: {},
                request_body: null, request_body_status: 'not_enabled', resource_type: 'xhr',
            },
            details: { statusCode: 200, timeStamp: 1700000000000, requestId: 'req_a' },
            timer: null as any,
            pending_cdp_ids: new Set(['cdp_1', 'cdp_2']),
        });

        const entry = _deferred_web_requests_for_test.get('dk_1')!;
        expect(entry.pending_cdp_ids.size).toBe(2);
        expect(entry.pending_cdp_ids.has('cdp_1')).toBe(true);
        entry.pending_cdp_ids.delete('cdp_1');
        expect(entry.pending_cdp_ids.size).toBe(1);
    });

    it('try_resolve_deferred is a no-op when reverse index has no entry for cdp_id', () => {
        // cdp_id not in reverse index → should not throw
        expect(() => _try_resolve_deferred_for_test('unknown_cdp')).not.toThrow();
    });

    it('try_resolve_deferred cleans up when body result is missing', () => {
        const reverse_set = new Set(['dk_1']);
        _deferred_cdp_index_for_test.set('cdp_no_body', reverse_set);

        _deferred_web_requests_for_test.set('dk_1', {
            pending: {
                cdp_request_id: 'req_x', tab_id: 1, method: 'GET', url: '/x',
                timestamp: 1, request_headers: {}, response_headers: {},
                request_body: null, request_body_status: 'not_enabled', resource_type: 'xhr',
            },
            details: { statusCode: 200, timeStamp: 1, requestId: 'req_x' },
            timer: null as any,
            pending_cdp_ids: new Set(['cdp_no_body']),
        });

        // No body result set → should clean up reverse index and body map
        _try_resolve_deferred_for_test('cdp_no_body');

        expect(_deferred_cdp_index_for_test.has('cdp_no_body')).toBe(false);
        // Entry still exists (pending not empty)
        expect(_deferred_web_requests_for_test.has('dk_1')).toBe(true);
    });

    it('multiple deferred entries can share one CDP candidate via Set', () => {
        // Two different webRequest deferred entries both list cdp_shared as candidate
        _deferred_web_requests_for_test.set('dk_a', {
            pending: {
                cdp_request_id: 'a', tab_id: 1, method: 'GET', url: '/a',
                timestamp: 1, request_headers: {}, response_headers: {},
                request_body: null, request_body_status: 'not_enabled', resource_type: 'xhr',
            },
            details: { statusCode: 200, timeStamp: 1, requestId: 'a' },
            timer: null as any,
            pending_cdp_ids: new Set(['cdp_shared']),
        });
        _deferred_web_requests_for_test.set('dk_b', {
            pending: {
                cdp_request_id: 'b', tab_id: 1, method: 'GET', url: '/b',
                timestamp: 1, request_headers: {}, response_headers: {},
                request_body: null, request_body_status: 'not_enabled', resource_type: 'xhr',
            },
            details: { statusCode: 200, timeStamp: 1, requestId: 'b' },
            timer: null as any,
            pending_cdp_ids: new Set(['cdp_shared']),
        });

        // Reverse index set has both deferred keys
        const key_set = new Set(['dk_a', 'dk_b']);
        _deferred_cdp_index_for_test.set('cdp_shared', key_set);

        const retrieved = _deferred_cdp_index_for_test.get('cdp_shared')!;
        expect(retrieved.size).toBe(2);
        expect(retrieved.has('dk_a')).toBe(true);
        expect(retrieved.has('dk_b')).toBe(true);
    });
});

// ─── P0.31: resolve_resource_type type mapping ───

describe('resolve_resource_type mapping', () => {
    it('maps xmlhttprequest to xhr', () => {
        expect(resolve_resource_type('xmlhttprequest')).toBe('xhr');
    });

    it('maps main_frame to document', () => {
        expect(resolve_resource_type('main_frame')).toBe('document');
    });

    it('maps sub_frame to document', () => {
        expect(resolve_resource_type('sub_frame')).toBe('document');
    });

    it('maps script to script', () => {
        expect(resolve_resource_type('script')).toBe('script');
    });

    it('maps stylesheet to stylesheet', () => {
        expect(resolve_resource_type('stylesheet')).toBe('stylesheet');
    });

    it('maps image to image', () => {
        expect(resolve_resource_type('image')).toBe('image');
    });

    it('maps font to font', () => {
        expect(resolve_resource_type('font')).toBe('font');
    });

    it('maps media to media', () => {
        expect(resolve_resource_type('media')).toBe('media');
    });

    it('maps ping to ping', () => {
        expect(resolve_resource_type('ping')).toBe('ping');
    });

    it('maps websocket to websocket', () => {
        expect(resolve_resource_type('websocket')).toBe('websocket');
    });

    it('maps already-standard xhr to xhr', () => {
        expect(resolve_resource_type('xhr')).toBe('xhr');
    });

    it('maps already-standard fetch to fetch', () => {
        expect(resolve_resource_type('fetch')).toBe('fetch');
    });

    it('maps unknown types to other', () => {
        expect(resolve_resource_type('csp_report')).toBe('other');
        expect(resolve_resource_type('')).toBe('other');
    });

    it('maps object to other (not in standard set)', () => {
        expect(resolve_resource_type('object')).toBe('other');
    });
});

// ─── P0.31-R1: CDP PascalCase resource_type normalization ───

describe('resolve_resource_type CDP PascalCase normalization', () => {
    it('normalizes Font to font', () => {
        expect(resolve_resource_type('Font')).toBe('font');
    });

    it('normalizes Stylesheet to stylesheet', () => {
        expect(resolve_resource_type('Stylesheet')).toBe('stylesheet');
    });

    it('normalizes Script to script', () => {
        expect(resolve_resource_type('Script')).toBe('script');
    });

    it('normalizes Image to image', () => {
        expect(resolve_resource_type('Image')).toBe('image');
    });

    it('normalizes Media to media', () => {
        expect(resolve_resource_type('Media')).toBe('media');
    });

    it('normalizes Fetch to fetch', () => {
        expect(resolve_resource_type('Fetch')).toBe('fetch');
    });

    it('normalizes XHR to xhr', () => {
        expect(resolve_resource_type('XHR')).toBe('xhr');
    });

    it('normalizes XMLHttpRequest to xhr', () => {
        expect(resolve_resource_type('XMLHttpRequest')).toBe('xhr');
    });

    it('normalizes Document to document', () => {
        expect(resolve_resource_type('Document')).toBe('document');
    });

    it('normalizes Websocket to websocket', () => {
        expect(resolve_resource_type('Websocket')).toBe('websocket');
    });

    it('returns other for empty string', () => {
        expect(resolve_resource_type('')).toBe('other');
    });
});
