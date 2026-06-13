import { describe, it, expect } from 'vitest';
import {
    build_network_jsonl_line,
    render_readme,
    build_archive,
} from '../src/shared/archive_builder';
import { strFromU8, unzipSync } from 'fflate';
import type {
    NetworkRequestData,
    CaptureRecord,
} from '../src/shared/types';

function make_req(
    overrides: Partial<NetworkRequestData> = {},
): NetworkRequestData {
    return {
        request_id: 'req1',
        url: 'https://example.com/api',
        method: 'GET',
        status_code: 200,
        status_text: null,
        protocol: null,
        resource_type: 'xhr',
        initiator: null,
        duration_ms: 100,
        start_time_ms: 1000,
        end_time_ms: 1100,
        request_headers: { 'content-type': 'application/json' },
        response_headers: { 'content-type': 'application/json' },
        headers_status: 'captured',
        request_body: null,
        request_body_status: 'not_enabled',
        request_body_encoding: null,
        request_body_bytes: null,
        request_body_mime: null,
        response_body: '{"ok":true}',
        response_preview: '{"ok":true}',
        response_body_status: 'captured',
        response_body_encoding: 'utf8',
        response_body_bytes: 11,
        mime_type: 'application/json',
        request_size_bytes: null,
        response_size_bytes: null,
        transfer_size_bytes: null,
        from_cache: null,
        cache_status: null,
        error_text: null,
        capture_method: 'cdp_primary',
        body_capture_mode: 'extension_cdp',
        url_status: 'captured',
        ...overrides,
    };
}

function make_capture(overrides: Partial<CaptureRecord> = {}): CaptureRecord {
    return {
        capture_id: 'cap1',
        name: 'test',
        status: 'completed',
        started_at: '2026-06-13T00:00:00.000Z',
        ended_at: '2026-06-13T00:01:00.000Z',
        duration_ms: 60000,
        stats: {
            event_count: 1,
            nav_count: 0,
            request_count: 1,
            log_count: 0,
            error_count: 0,
            storage_change_count: 0,
            cookie_change_count: 0,
            user_action_count: 0,
        },
        ...overrides,
    } as CaptureRecord;
}

const INLINE = 32768;

describe('build_network_jsonl_line', () => {
    it('inlines small text body', async () => {
        const req = make_req();
        const line = await build_network_jsonl_line(req, INLINE);
        const parsed = JSON.parse(line);
        expect(parsed.response_body).toBe('{"ok":true}');
        expect(parsed.response_body_ref).toBeNull();
        expect(parsed.url).toBe('https://example.com/api');
        expect(parsed.method).toBe('GET');
        expect(parsed.status_code).toBe(200);
    });

    it('writes binary body to file ref', async () => {
        const req = make_req({
            response_body: 'aGVsbG8=',
            response_body_encoding: 'base64',
            response_body_bytes: 5,
            mime_type: 'image/png',
            resource_type: 'image',
        });
        const line = await build_network_jsonl_line(req, INLINE);
        const parsed = JSON.parse(line);
        expect(parsed.response_body).toBeNull();
        expect(parsed.response_body_ref).toContain('bodies/response/req1.png');
        expect(parsed.response_body_sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('preserves all existing fields (headers, timing, etc.)', async () => {
        const req = make_req();
        const line = await build_network_jsonl_line(req, INLINE);
        const parsed = JSON.parse(line);
        expect(parsed.request_headers).toEqual({
            'content-type': 'application/json',
        });
        expect(parsed.response_headers).toEqual({
            'content-type': 'application/json',
        });
        expect(parsed.duration_ms).toBe(100);
        expect(parsed.capture_method).toBe('cdp_primary');
        expect(parsed.initiator).toBeNull();
    });
});

describe('render_readme', () => {
    it('includes counts and privacy warning', () => {
        const md = render_readme({
            capture_id: 'cap1',
            network_count: 437,
            image_count: 7,
            event_count: 10,
        });
        expect(md).toContain('cap1');
        expect(md).toContain('437');
        expect(md).toContain('bodies/');
        expect(md.toLowerCase()).toContain('cookie');
        expect(md).toContain('captured');
        expect(md).toContain('too_large');
    });
});

describe('build_archive', () => {
    it('produces valid zip with manifest, README, and jsonl files', async () => {
        const archive = await build_archive(
            {
                capture: make_capture(),
                events: [],
                network_requests: [make_req()],
                console_events: [],
            },
            {
                inline_text_max_bytes: INLINE,
                system_time_timezone: 'browser',
            },
        );
        const unzipped = unzipSync(archive);
        expect(unzipped['manifest.json']).toBeDefined();
        expect(unzipped['README.md']).toBeDefined();
        expect(unzipped['network.jsonl']).toBeDefined();
        const manifest = JSON.parse(strFromU8(unzipped['manifest.json']));
        expect(manifest.format).toBe('capture_all_archive');
        expect(manifest.counts.network).toBe(1);
    });

    it('creates bodies/ entries for binary content', async () => {
        const archive = await build_archive(
            {
                capture: make_capture(),
                events: [],
                network_requests: [
                    make_req({
                        response_body: 'aGVsbG8=',
                        response_body_encoding: 'base64',
                        response_body_bytes: 5,
                        mime_type: 'image/png',
                        resource_type: 'image',
                    }),
                ],
                console_events: [],
            },
            {
                inline_text_max_bytes: INLINE,
                system_time_timezone: 'browser',
            },
        );
        const unzipped = unzipSync(archive);
        const png_path = Object.keys(unzipped).find(
            (k) => k.startsWith('bodies/response/') && k.endsWith('.png'),
        );
        expect(png_path).toBeDefined();
        expect(unzipped[png_path!].length).toBe(5);
    });
});
