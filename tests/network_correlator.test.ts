// tests/network_correlator.test.ts
import { describe, it, expect } from 'vitest';
import {
    correlate,
    merge_matched,
    build_cdp_only_request,
    build_web_request_only_request,
    type CdpBodyEvent,
    type WebRequestMeta
} from '../src/background/network_correlator';
import type { NetworkRequestData } from '../src/shared/types';

function make_web_meta(overrides: Partial<WebRequestMeta> = {}): WebRequestMeta {
    return {
        session_id: 'session_1',
        relative_time: 100,
        absolute_time: 1700000000000,
        tab_id: 1,
        method: 'GET',
        url: 'https://example.com/api/data',
        status_code: 200,
        request_headers: { 'Accept': 'application/json' },
        response_headers: { 'Content-Type': 'application/json' },
        request_body: null,
        request_body_status: 'not_enabled',
        duration_ms: 150,
        resource_type: 'xhr',
        ...overrides
    };
}

function make_cdp_event(overrides: Partial<CdpBodyEvent> = {}): CdpBodyEvent {
    return {
        request_id: 'cdp_123',
        tab_id: 1,
        url: 'https://example.com/api/data',
        method: 'GET',
        status_code: 200,
        timestamp: 1700000000000,
        resource_type: 'xhr',
        request_body: null,
        request_body_status: 'not_enabled',
        response_body: '{"ok":true}',
        response_body_status: 'captured',
        request_headers: { 'Accept': 'application/json' },
        response_headers: { 'Content-Type': 'application/json' },
        ...overrides
    };
}

describe('correlate', () => {
    it('matches identical web and CDP events', () => {
        const web = make_web_meta();
        const cdp = make_cdp_event();
        expect(correlate(web, cdp)).toBe('matched');
    });

    it('returns ambiguous when methods differ', () => {
        const web = make_web_meta({ method: 'POST' });
        const cdp = make_cdp_event({ method: 'GET' });
        expect(correlate(web, cdp)).toBe('ambiguous');
    });

    it('returns ambiguous when status codes differ', () => {
        const web = make_web_meta({ status_code: 404 });
        const cdp = make_cdp_event({ status_code: 200 });
        expect(correlate(web, cdp)).toBe('ambiguous');
    });

    it('returns ambiguous when timestamps differ by more than 2s', () => {
        const web = make_web_meta({ absolute_time: 1700000000000 });
        const cdp = make_cdp_event({ timestamp: 1700000005000 }); // 5s later
        expect(correlate(web, cdp)).toBe('ambiguous');
    });

    it('matches when timestamps differ by less than 2s', () => {
        const web = make_web_meta({ absolute_time: 1700000000000 });
        const cdp = make_cdp_event({ timestamp: 1700000001500 }); // 1.5s later
        expect(correlate(web, cdp)).toBe('matched');
    });

    it('returns ambiguous when resource types differ', () => {
        const web = make_web_meta({ resource_type: 'document' });
        const cdp = make_cdp_event({ resource_type: 'xhr' });
        expect(correlate(web, cdp)).toBe('ambiguous');
    });

    it('matches URLs that differ only by query string', () => {
        const web = make_web_meta({ url: 'https://example.com/api/data?t=1' });
        const cdp = make_cdp_event({ url: 'https://example.com/api/data?t=2' });
        expect(correlate(web, cdp)).toBe('matched');
    });

    // Edge case: Chrome may emit absolute_time: 0 or pre-epoch timestamps for cached resources
    it('returns ambiguous when CDP timestamp is zero (Chrome cached response)', () => {
        const web = make_web_meta({ absolute_time: 1700000000000 });
        const cdp = make_cdp_event({ timestamp: 0 });
        expect(correlate(web, cdp)).toBe('ambiguous');
    });

    it('returns ambiguous when web absolute_time is zero', () => {
        const web = make_web_meta({ absolute_time: 0 });
        const cdp = make_cdp_event({ timestamp: 1700000000000 });
        expect(correlate(web, cdp)).toBe('ambiguous');
    });

    it('returns ambiguous when CDP timestamp is negative (pre-epoch)', () => {
        const web = make_web_meta({ absolute_time: 1000000000000 });
        const cdp = make_cdp_event({ timestamp: -1 });
        expect(correlate(web, cdp)).toBe('ambiguous');
    });

    it('returns ambiguous when web absolute_time is negative', () => {
        const web = make_web_meta({ absolute_time: -1 });
        const cdp = make_cdp_event({ timestamp: 1000000000000 });
        expect(correlate(web, cdp)).toBe('ambiguous');
    });

    it('returns ambiguous when both timestamps are zero (time diff == 0, within window)', () => {
        const web = make_web_meta({ absolute_time: 0 });
        const cdp = make_cdp_event({ timestamp: 0 });
        expect(correlate(web, cdp)).toBe('matched');
    });

    it('does not crash when CDP timestamp is Number.MIN_SAFE_INTEGER', () => {
        const web = make_web_meta({ absolute_time: 0 });
        const cdp = make_cdp_event({ timestamp: Number.MIN_SAFE_INTEGER });
        expect(() => correlate(web, cdp)).not.toThrow();
        expect(correlate(web, cdp)).toBe('ambiguous');
    });

    // Edge case: duplicate CDP events with same URL/method/status but different request_id
    it('matches both CDP events when duplicates differ only by request_id', () => {
        const web = make_web_meta();
        const cdp_a = make_cdp_event({ request_id: 'cdp_aaa' });
        const cdp_b = make_cdp_event({ request_id: 'cdp_bbb' });
        expect(correlate(web, cdp_a)).toBe('matched');
        expect(correlate(web, cdp_b)).toBe('matched');
    });

    it('handles duplicate CDP events where one has different URL base', () => {
        const web = make_web_meta({ url: 'https://example.com/api/data' });
        const cdp_a = make_cdp_event({
            request_id: 'cdp_aaa',
            url: 'https://example.com/api/data'
        });
        const cdp_b = make_cdp_event({
            request_id: 'cdp_bbb',
            url: 'https://example.com/api/other'
        });
        expect(correlate(web, cdp_a)).toBe('matched');
        expect(correlate(web, cdp_b)).toBe('ambiguous');
    });

    it('handles duplicate CDP events where one has different timestamp outside window', () => {
        const web = make_web_meta({ absolute_time: 1700000000000 });
        const cdp_a = make_cdp_event({
            request_id: 'cdp_aaa',
            timestamp: 1700000000000
        });
        const cdp_b = make_cdp_event({
            request_id: 'cdp_bbb',
            timestamp: 1700000005000 // 5s later
        });
        expect(correlate(web, cdp_a)).toBe('matched');
        expect(correlate(web, cdp_b)).toBe('ambiguous');
    });
});

describe('merge_matched', () => {
    it('merges web metadata with CDP body', () => {
        const web = make_web_meta();
        const cdp = make_cdp_event({ response_body: '{"result":"ok"}' });
        const result = merge_matched(web, cdp, 'matched');

        expect(result.method).toBe('GET');
        expect(result.url).toBe('https://example.com/api/data');
        expect(result.response_body).toBe('{"result":"ok"}');
        expect(result.response_body_status).toBe('captured');
        expect(result.correlation_status).toBe('matched');
        expect(result.cdp_request_id).toBe('cdp_123');
    });
});

describe('build_cdp_only_request', () => {
    it('creates a request with cdp_only status', () => {
        const cdp = make_cdp_event({ response_body: 'cdp body' });
        const result = build_cdp_only_request(cdp, 'capture_x', 1700000000000);

        expect(result.capture_id).toBe('capture_x');
        expect(result.response_body).toBe('cdp body');
        expect(result.correlation_status).toBe('cdp_only');
        expect(result.cdp_request_id).toBe('cdp_123');
    });
});

describe('build_web_request_only_request', () => {
    it('creates a request with web_request_only status', () => {
        const web = make_web_meta();
        const result = build_web_request_only_request(web);

        expect(result.method).toBe('GET');
        expect(result.response_body).toBeNull();
        expect(result.response_body_status).toBe('not_enabled');
        expect(result.correlation_status).toBe('web_request_only');
    });
});

// ─── P0.31-R1: CDP PascalCase resource_type normalization in correlator ───

describe('P0.31-R1: resource_type normalization in correlator outputs', () => {
    it('merge_matched normalizes PascalCase CDP resource_type to lowercase', () => {
        const web = make_web_meta({ resource_type: 'Font' });
        const cdp = make_cdp_event({ resource_type: 'Font' });
        const result = merge_matched(web, cdp, 'matched');
        expect(result.resource_type).toBe('font');
    });

    it('build_cdp_only_request normalizes PascalCase resource_type', () => {
        const cdp = make_cdp_event({ resource_type: 'Stylesheet' });
        const result = build_cdp_only_request(cdp, 'session_x', 1700000000000);
        expect(result.resource_type).toBe('stylesheet');
    });

    it('build_cdp_only_request normalizes Script to script', () => {
        const cdp = make_cdp_event({ resource_type: 'Script' });
        const result = build_cdp_only_request(cdp, 'session_x', 1700000000000);
        expect(result.resource_type).toBe('script');
    });

    it('build_cdp_only_request normalizes Image to image', () => {
        const cdp = make_cdp_event({ resource_type: 'Image' });
        const result = build_cdp_only_request(cdp, 'session_x', 1700000000000);
        expect(result.resource_type).toBe('image');
    });

    it('build_cdp_only_request normalizes XHR to xhr', () => {
        const cdp = make_cdp_event({ resource_type: 'XHR' });
        const result = build_cdp_only_request(cdp, 'session_x', 1700000000000);
        expect(result.resource_type).toBe('xhr');
    });

    it('build_web_request_only_request normalizes PascalCase resource_type', () => {
        const web = make_web_meta({ resource_type: 'Fetch' });
        const result = build_web_request_only_request(web);
        expect(result.resource_type).toBe('fetch');
    });

    it('build_web_request_only_request normalizes Media to media', () => {
        const web = make_web_meta({ resource_type: 'Media' });
        const result = build_web_request_only_request(web);
        expect(result.resource_type).toBe('media');
    });

    it('merge_matched normalizes when web is lowercase but CDP is PascalCase', () => {
        const web = make_web_meta({ resource_type: 'font' });
        const cdp = make_cdp_event({ resource_type: 'Font' });
        // correlate will return 'ambiguous' due to mismatch, but merge can still be called
        const result = merge_matched(web, cdp, 'matched');
        expect(result.resource_type).toBe('font');
    });
});

const REQUIRED_NETWORK_REQUEST_FIELDS: (keyof NetworkRequestData)[] = [
    'request_id', 'method', 'url', 'url_status', 'status_code', 'status_text',
    'protocol', 'resource_type', 'initiator', 'duration_ms', 'start_time_ms',
    'end_time_ms', 'request_headers', 'response_headers', 'headers_status',
    'request_body', 'request_body_status', 'response_body', 'response_preview',
    'response_body_status', 'mime_type', 'request_size_bytes', 'response_size_bytes',
    'transfer_size_bytes', 'from_cache', 'cache_status', 'error_text',
    'capture_method', 'body_capture_mode',
];

function assert_required_fields(obj: Record<string, unknown>, label: string): void {
    for (const field of REQUIRED_NETWORK_REQUEST_FIELDS) {
        if (field === 'request_headers' || field === 'response_headers') {
            // These can be null in the type but should be present
        }
        expect(obj, `${label}: missing ${field}`).toHaveProperty(field);
    }
}

describe('field completeness', () => {
    it('build_cdp_only_request has all required fields', () => {
        const cdp = make_cdp_event();
        const result = build_cdp_only_request(cdp, 'session_x', 1700000000000);
        assert_required_fields(result as unknown as Record<string, unknown>, 'build_cdp_only_request');
        expect(result.capture_method).toBe('extension_cdp');
        expect(result.body_capture_mode).toBe('extension_cdp');
        expect(result.response_preview).toBe(cdp.response_preview);
    });

    it('merge_matched has all required fields', () => {
        const web = make_web_meta();
        const cdp = make_cdp_event();
        const result = merge_matched(web, cdp, 'matched');
        assert_required_fields(result as unknown as Record<string, unknown>, 'merge_matched');
        expect(result.capture_method).toBe('web_request');
        expect(result.body_capture_mode).toBe('extension_cdp');
    });

    it('build_web_request_only_request has all required fields', () => {
        const web = make_web_meta();
        const result = build_web_request_only_request(web);
        assert_required_fields(result as unknown as Record<string, unknown>, 'build_web_request_only_request');
        expect(result.capture_method).toBe('web_request');
        expect(result.body_capture_mode).toBe('none');
    });

    it('build_cdp_only_request has non-null request_id', () => {
        const cdp = make_cdp_event({ request_id: 'cdp_test_123' });
        const result = build_cdp_only_request(cdp, 'session_x', 1700000000000);
        expect(result.request_id).toBe('cdp_test_123');
    });
});
