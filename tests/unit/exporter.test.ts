// tests/exporter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { export_json, export_jsonl, export_html, export_har } from '../../src/extension/background/exporter';
import { get_capture, get_events_by_category, get_network_requests, get_console_events } from '../../src/extension/background/storage';
import { load_user_config } from '../../src/shared/user_config';

// Mock dependencies
vi.mock('../../src/extension/background/storage', () => ({
    get_capture: vi.fn(),
    get_events_by_category: vi.fn(),
    get_network_requests: vi.fn(),
    get_console_events: vi.fn(),
}));

vi.mock('../../src/shared/user_config', () => ({
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

        // AC-004: 回灌验证——内嵌 JSON 经真实 JS 字符串字面量解码后必须可 parse 且数据完整。
        // 用 new Function 走引擎真实字面量语义（而非手工 unescape），使 pre-fix 缺陷（' 与 \n 未转义）
        // 在构造时抛 SyntaxError 捕获回归，避免「宽恕式手工解码」假绿。
        function extract_embedded_json(html: string): unknown {
            const m = html.match(/const data = JSON\.parse\('([\s\S]*?)'\);/);
            if (!m) throw new Error('no embedded JSON found');
            const decoded = new Function(`"use strict"; return '${m[1]}';`)();
            return JSON.parse(decoded);
        }

        it('AC-001: 含单引号的数据导出 HTML 后 JSON.parse 可解析且数据完整', async () => {
            (get_capture as any).mockResolvedValue({ ...mock_capture, capture_id: "it's" });
            (get_events_by_category as any).mockResolvedValue([{ type: 'user_action', data: { text: "it's a test" } }]);
            (get_network_requests as any).mockResolvedValue([]);
            (get_console_events as any).mockResolvedValue([]);

            const result = await export_html("it's");
            const parsed = extract_embedded_json(result) as { capture: { capture_id: string } };
            expect(parsed.capture.capture_id).toBe("it's");
        });

        it('AC-002: 含换行/制表的数据导出 HTML 后 JSON.parse 可解析', async () => {
            (get_capture as any).mockResolvedValue({ ...mock_capture, capture_id: 'cap1' });
            (get_events_by_category as any).mockResolvedValue([{ type: 'console', data: { text: 'line1\nline2\tend' } }]);
            (get_network_requests as any).mockResolvedValue([]);
            (get_console_events as any).mockResolvedValue([]);

            const result = await export_html('cap1');
            const parsed = extract_embedded_json(result) as { events: Array<{ data: { text: string } }> };
            expect(parsed.events[0].data.text).toBe('line1\nline2\tend');
        });

        it('AC-003: 含 </script> 注入尝试保持被转义', async () => {
            (get_capture as any).mockResolvedValue({ ...mock_capture, capture_id: 'cap1' });
            (get_events_by_category as any).mockResolvedValue([{ type: 'user_action', data: { text: '</script><script>alert(1)</script>' } }]);
            (get_network_requests as any).mockResolvedValue([]);
            (get_console_events as any).mockResolvedValue([]);

            const result = await export_html('cap1');
            // 内嵌 JSON 中注入的 </script> 的 < 与 > 均转义为 \\u003c/\\u003e，不形成可闭合 script 标签的原文
            expect(result).toContain('\\u003c\\/script\\u003e');
            // 且回灌解析后数据完整（含注入文本）
            const parsed = extract_embedded_json(result) as { events: Array<{ data: { text: string } }> };
            expect(parsed.events[0].data.text).toBe('</script><script>alert(1)</script>');
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

        it('AC-001a: absolute_time(number) 被用于 startedDateTime（correlator 产出形状）', async () => {
            const req = { ...mock_network_requests[0], start_time_ms: null, absolute_time: 1704067202000 };
            (get_network_requests as any).mockResolvedValue([req]);

            const result = await export_har('test_capture');
            const parsed = JSON.parse(result);

            expect(parsed.log.entries[0].startedDateTime).toBe('2024-01-01T00:00:02.000Z');
        });

        it('AC-001b: start_time_ms 为绝对 epoch 时直接用（websocket 形状，不双计）', async () => {
            const req = { ...mock_network_requests[0], start_time_ms: 1704067203000, absolute_time: undefined };
            (get_network_requests as any).mockResolvedValue([req]);

            const result = await export_har('test_capture');
            const parsed = JSON.parse(result);

            expect(parsed.log.entries[0].startedDateTime).toBe('2024-01-01T00:00:03.000Z');
        });

        it('AC-001c: 无时间字段时回退采集开始（非 1970）', async () => {
            const req = { ...mock_network_requests[0], start_time_ms: null, absolute_time: undefined, relative_time: undefined };
            (get_network_requests as any).mockResolvedValue([req]);

            const result = await export_har('test_capture');
            const parsed = JSON.parse(result);

            expect(parsed.log.entries[0].startedDateTime).toBe('2024-01-01T00:00:00.000Z');
        });

        it('AC-002: base64 响应体写出时 content.encoding 为 base64', async () => {
            const req = { ...mock_network_requests[0], response_body: 'aGVsbG8=', response_body_encoding: 'base64' };
            (get_network_requests as any).mockResolvedValue([req]);

            const result = await export_har('test_capture');
            const parsed = JSON.parse(result);

            expect(parsed.log.entries[0].response.content.encoding).toBe('base64');
        });

        it('AC-003: UTF-8 文本响应体不错误标记为 base64 encoding', async () => {
            const req = { ...mock_network_requests[0], response_body: '{"data": "test"}', response_body_encoding: 'utf8' };
            (get_network_requests as any).mockResolvedValue([req]);

            const result = await export_har('test_capture');
            const parsed = JSON.parse(result);

            expect(parsed.log.entries[0].response.content.encoding).toBeUndefined();
        });
    });
});
