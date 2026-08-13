// tests/unit/export_body_strip.test.ts
// t171 AC-004: 导出独立剥离 request body / response body / preview
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { export_json } from '../../src/extension/background/exporter';
import { load_user_config } from '../../src/shared/user_config';

vi.mock('../../src/extension/background/storage', () => ({
    get_capture: vi.fn(async () => ({
        capture_id: 'c1', name: 'n', status: 'completed', started_at: '2026-01-01T00:00:00Z',
        ended_at: '2026-01-01T00:01:00Z', duration_ms: 60000, start_url: 'https://e.com', end_url: null,
        tab_id: 1, window_id: null, config_snapshot: {}, tags: [], created_at: '', updated_at: '',
        stats: { event_count: 0, user_action_count: 0, nav_count: 0, request_count: 1, log_count: 0, error_count: 0, storage_change_count: 0, cookie_change_count: 0, total_body_bytes: 0 },
    })),
    get_events_by_category: vi.fn(async () => []),
    get_network_requests: vi.fn(async () => [{
        request_id: 'r1', event_id: 'r1', capture_id: 'c1', method: 'POST', url: 'https://e.com/api',
        url_status: 'captured', status_code: 200, status_text: 'OK', protocol: 'http/2', resource_type: 'fetch',
        initiator: null, duration_ms: 10, start_time_ms: 1, end_time_ms: 11,
        request_headers: {}, response_headers: {}, headers_status: 'captured',
        request_body: 'req-body-content', request_body_status: 'captured', request_body_encoding: 'utf8',
        request_body_bytes: 17, request_body_mime: 'application/json',
        response_body: 'resp-body-content', response_preview: 'preview-text', response_body_status: 'captured',
        response_body_encoding: 'utf8', response_body_bytes: 17, mime_type: 'application/json',
        request_size_bytes: null, response_size_bytes: null, transfer_size_bytes: null,
        from_cache: null, cache_status: null, error_text: null, capture_method: 'web_request', body_capture_mode: 'off',
        relative_time_ms: 5,
    }]),
    get_console_events: vi.fn(async () => []),
}));

vi.mock('../../src/shared/user_config', () => ({
    load_user_config: vi.fn(async () => ({ system_time_timezone: 'UTC' })),
}));

beforeEach(() => { vi.clearAllMocks(); });

describe('export body 剥离选项', () => {
    it('AC-004a: include_request_body=false 剥离 request body，response body 保留', async () => {
        const json = await export_json('c1', { include_request_body: false });
        const data = JSON.parse(json);
        const req = data.network_requests[0];
        expect(req.request_body).toBeUndefined();
        expect(req.response_body).toBe('resp-body-content');
    });

    it('AC-004b: include_response_body=false 剥离 response body，request body 保留', async () => {
        const json = await export_json('c1', { include_response_body: false });
        const data = JSON.parse(json);
        const req = data.network_requests[0];
        expect(req.response_body).toBeUndefined();
        expect(req.request_body).toBe('req-body-content');
    });

    it('AC-004c: include_preview=false 剥离 preview', async () => {
        const json = await export_json('c1', { include_preview: false });
        const data = JSON.parse(json);
        expect(data.network_requests[0].response_preview).toBeUndefined();
    });

    it('AC-004d: 默认（无选项）三者保留', async () => {
        const json = await export_json('c1');
        const req = JSON.parse(json).network_requests[0];
        expect(req.request_body).toBe('req-body-content');
        expect(req.response_body).toBe('resp-body-content');
        expect(req.response_preview).toBe('preview-text');
    });
});
