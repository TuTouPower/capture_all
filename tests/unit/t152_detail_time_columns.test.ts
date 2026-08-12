// @vitest-environment jsdom
// tests/unit/t152_detail_time_columns.test.ts
// t152 AC-005: 网络/控制台表时间列读真实字段，不再读恒 undefined 的 timestamp。
import { describe, expect, it, beforeEach } from 'vitest';
import { set_detail_network, set_detail_console } from '../../src/extension/dashboard/dashboard_shared';
import { _render_net_table_for_test, _render_con_table_for_test } from '../../src/extension/dashboard/dashboard_detail';
import type { NetworkRequestData, ConsoleEventData } from '../../src/shared/types';

function net_req(overrides: Partial<NetworkRequestData> = {}): NetworkRequestData {
    return {
        request_id: 'r1',
        method: 'GET',
        url: 'https://example.com/x',
        url_status: 'captured',
        status_code: 200,
        status_text: 'OK',
        protocol: null,
        resource_type: 'fetch',
        initiator: null,
        duration_ms: 100,
        start_time_ms: null,
        end_time_ms: null,
        request_headers: null,
        response_headers: null,
        headers_status: 'captured',
        request_body: null,
        request_body_status: 'not_enabled',
        request_body_encoding: null,
        request_body_bytes: null,
        request_body_mime: null,
        response_body: null,
        response_preview: null,
        response_body_status: 'not_enabled',
        response_body_encoding: null,
        response_body_bytes: null,
        mime_type: null,
        request_size_bytes: null,
        response_size_bytes: null,
        transfer_size_bytes: null,
        from_cache: null,
        cache_status: null,
        error_text: null,
        capture_method: 'web_request',
        body_capture_mode: 'none',
        ...overrides,
    };
}

function con_log(overrides: Partial<ConsoleEventData> = {}): ConsoleEventData {
    return {
        level: 'info',
        args_preview: ['hi'],
        args_status: 'captured',
        stack_trace: null,
        source_url: null,
        line: null,
        column: null,
        repeat_count: null,
        related_network_request_id: null,
        ...overrides,
    };
}

beforeEach(() => {
    set_detail_network([]);
    set_detail_console([]);
});

describe('t152 AC-005 时间列读真实字段', () => {
    it('网络表显示 NetworkRequestData.relative_time（非恒 +00.000s）', () => {
        set_detail_network([net_req({ relative_time: 1500 })]);
        const html = _render_net_table_for_test();
        expect(html).toContain('+01.500s');
        expect(html).not.toContain('+00.000s');
    });

    it('网络表无 relative_time 时回退 +00.000s（不崩）', () => {
        set_detail_network([net_req({})]);
        expect(_render_net_table_for_test()).toContain('+00.000s');
    });

    it('控制台表显示 ConsoleEventData.relative_time_ms（非恒空）', () => {
        set_detail_console([con_log({ relative_time_ms: 2500 })]);
        const html = _render_con_table_for_test();
        expect(html).toContain('+02.500s');
    });

    it('控制台表无 relative_time_ms 时显示 +00.000s（非空 cell）', () => {
        set_detail_console([con_log({})]);
        const html = _render_con_table_for_test();
        expect(html).toContain('+00.000s');
    });
});
