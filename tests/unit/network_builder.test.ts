// tests/unit/network_builder.test.ts
// 验证 shared/network_builder.build_network_data：默认字段、body 派生、extra 覆盖。
import { describe, it, expect } from 'vitest';
import { build_network_data } from '../../src/shared/network_builder';
import type { NetworkDataInput } from '../../src/shared/network_builder';

function base(): NetworkDataInput {
    return {
        request_id: 'r1',
        method: 'GET',
        url: 'https://example.com/api',
        url_status: 'captured',
        status_code: 200,
        resource_type: 'xhr',
        duration_ms: 100,
        request_headers: { 'Accept': 'application/json' },
        response_headers: { 'Content-Type': 'application/json' },
        headers_status: 'captured',
        capture_method: 'web_request',
        body_capture_mode: 'none',
    };
}

describe('build_network_data', () => {
    it('默认 null 字段被填充', () => {
        const d = build_network_data(base());
        expect(d.status_text).toBeNull();
        expect(d.protocol).toBeNull();
        expect(d.initiator).toBeNull();
        expect(d.start_time_ms).toBeNull();
        expect(d.end_time_ms).toBeNull();
        expect(d.request_body_mime).toBeNull();
        expect(d.mime_type).toBeNull();
        expect(d.request_size_bytes).toBeNull();
        expect(d.response_size_bytes).toBeNull();
        expect(d.transfer_size_bytes).toBeNull();
        expect(d.from_cache).toBeNull();
        expect(d.cache_status).toBeNull();
        expect(d.error_text).toBeNull();
    });

    it('body 派生字节与 utf8 编码', () => {
        const d = build_network_data({
            ...base(),
            request_body: 'abc',
            response_body: 'def',
        });
        expect(d.request_body_encoding).toBe('utf8');
        expect(d.request_body_bytes).toBe(3);
        expect(d.response_body_encoding).toBe('utf8');
        expect(d.response_body_bytes).toBe(3);
    });

    it('无 body 时编码字节为 null', () => {
        const d = build_network_data(base());
        expect(d.request_body_encoding).toBeNull();
        expect(d.request_body_bytes).toBeNull();
        expect(d.response_body_encoding).toBeNull();
        expect(d.response_body_bytes).toBeNull();
    });

    it('多字节 utf8 按字节数计算', () => {
        const d = build_network_data({
            ...base(),
            request_body: '你好',
            response_body: '👋',
        });
        expect(d.request_body_bytes).toBe(6); // 你好 = 2×3
        expect(d.response_body_bytes).toBe(4); // 👋 = 4
        expect(d.request_body_encoding).toBe('utf8');
    });

    it('derive_body=false 不派生 body 字节（hook 预览通道）', () => {
        const d = build_network_data({
            ...base(),
            request_body: 'abc',
            response_body: 'def',
            derive_body: false,
        });
        expect(d.request_body_encoding).toBeNull();
        expect(d.request_body_bytes).toBeNull();
        expect(d.response_body_encoding).toBeNull();
        expect(d.response_body_bytes).toBeNull();
    });

    it('extra 覆盖派生字段', () => {
        const d = build_network_data({
            ...base(),
            response_body: 'payload',
            extra: { response_body_encoding: 'base64', response_body_bytes: 999 },
        });
        expect(d.response_body_encoding).toBe('base64');
        expect(d.response_body_bytes).toBe(999);
    });
});
