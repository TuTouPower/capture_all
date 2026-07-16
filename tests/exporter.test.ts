// tests/exporter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { export_json, export_jsonl, export_html, export_har } from '../src/background/exporter';
import { get_capture, get_events_by_category, get_network_requests, get_console_events } from '../src/background/storage';
import { load_user_config } from '../src/shared/user_config';

// Mock dependencies
vi.mock('../src/background/storage', () => ({
    get_capture: vi.fn(),
    get_events_by_category: vi.fn(),
    get_network_requests: vi.fn(),
    get_console_events: vi.fn(),
}));

vi.mock('../src/shared/user_config', () => ({
    load_user_config: vi.fn(),
}));

describe('exporter', () => {
    const mock_capture = {
        capture_id: 'test_capture',
        name: 'Test Capture',
        status: 'completed',
        started_at: '2024-01-01T00:00:00Z',
        ended_at: '2024-01-01T00:01:00Z',
        duration_ms: 60000,
        start_url: 'https://example.com',
        end_url: 'https://example.com/page',
        tab_id: 1,
        window_id: 1,
        config_snapshot: {},
        stats: {
            event_count: 10,
            user_action_count: 5,
            nav_count: 2,
            request_count: 3,
            log_count: 0,
            error_count: 0,
            storage_change_count: 0,
            cookie_change_count: 0,
            total_body_bytes: 0,
        },
        tags: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
    };

    const mock_events = [
        {
            event_id: 'evt_1',
            capture_id: 'test_capture',
            category: 'user_action',
            type: 'mouse_event',
            relative_time_ms: 1000,
            absolute_time: '2024-01-01T00:00:01Z',
            tab_id: 1,
            frame_id: 0,
            url: 'https://example.com',
            top_frame_url: null,
            page_title: null,
            source: 'content_script',
            severity: 'info',
            related_event_ids: [],
            redaction_status: 'none',
            raw_available: true,
            created_at: '2024-01-01T00:00:01Z',
            data: { action: 'click', x: 100, y: 200 },
        },
    ];

    const mock_network_requests = [
        {
            request_id: 'req_1',
            capture_id: 'test_capture',
            method: 'GET',
            url: 'https://api.example.com/data',
            url_status: 'captured',
            status_code: 200,
            status_text: null,
            protocol: null,
            resource_type: 'xhr',
            initiator: null,
            duration_ms: 50,
            start_time_ms: null,
            end_time_ms: null,
            relative_time: 1500,
            absolute_time: '2024-01-01T00:00:01.500Z',
            tab_id: 1,
            request_headers: {},
            response_headers: {},
            headers_status: 'captured',
            request_body: null,
            request_body_status: 'not_enabled',
            request_body_encoding: null,
            request_body_bytes: null,
            request_body_mime: null,
            response_body: '{"data": "test"}',
            response_preview: null,
            response_body_status: 'captured',
            response_body_encoding: null,
            response_body_bytes: null,
            mime_type: null,
            request_size_bytes: null,
            response_size_bytes: null,
            transfer_size_bytes: null,
            from_cache: null,
            cache_status: null,
            error_text: null,
            capture_method: 'cdp_primary',
            body_capture_mode: 'extension_cdp',
        },
    ];

    const mock_user_config = {
        time_format: 'relative',
        timezone: 'UTC',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (get_capture as any).mockResolvedValue(mock_capture);
        (get_events_by_category as any).mockImplementation((capture_id: string, category: string) => {
            if (category === 'user_action') return Promise.resolve(mock_events);
            return Promise.resolve([]);
        });
        (get_network_requests as any).mockResolvedValue(mock_network_requests);
        (get_console_events as any).mockResolvedValue([]);
        (load_user_config as any).mockResolvedValue(mock_user_config);
    });

    describe('export_json', () => {
        it('should export capture data as JSON', async () => {
            const result = await export_json('test_capture');
            const parsed = JSON.parse(result);

            expect(parsed.capture.capture_id).toBe('test_capture');
            expect(parsed.events).toHaveLength(1);
            expect(parsed.network_requests).toHaveLength(1);
            expect(get_capture).toHaveBeenCalledWith('test_capture');
        });

        it('should strip response body when include_response_body is false', async () => {
            const result = await export_json('test_capture', { include_response_body: false });
            const parsed = JSON.parse(result);

            expect(parsed.network_requests[0]).not.toHaveProperty('response_body');
        });

        it('should throw error when capture not found', async () => {
            (get_capture as any).mockResolvedValue(null);
            await expect(export_json('nonexistent')).rejects.toThrow('Capture not found');
        });
    });

    describe('export_jsonl', () => {
        it('should export capture data as JSONL', async () => {
            const result = await export_jsonl('test_capture');
            const lines = result.split('\n').filter(line => line.trim());

            expect(lines).toHaveLength(3); // capture + 1 event + 1 network request
            const capture_line = JSON.parse(lines[0]);
            expect(capture_line.type).toBe('capture');
            expect(capture_line.capture_id).toBe('test_capture');
        });

        it('should strip response body when include_response_body is false', async () => {
            const result = await export_jsonl('test_capture', { include_response_body: false });
            const lines = result.split('\n').filter(line => line.trim());
            const network_line = JSON.parse(lines.find(l => l.includes('"type":"network_request"'))!);

            expect(network_line).not.toHaveProperty('response_body');
        });
    });

    describe('export_html', () => {
        it('should export capture data as HTML', async () => {
            const result = await export_html('test_capture');

            expect(result).toContain('<!DOCTYPE html>');
            expect(result).toContain('test_capture');
            expect(result).toContain('const data = JSON.parse');
        });
    });

    describe('export_har', () => {
        it('should export capture data as HAR', async () => {
            const result = await export_har('test_capture');
            const parsed = JSON.parse(result);

            expect(parsed.log.version).toBe('1.2');
            expect(parsed.log.entries).toHaveLength(1);
            expect(parsed.log.entries[0].request.method).toBe('GET');
        });
    });
});
