// @vitest-environment jsdom
// tests/unit/network_hook_gate_behavior.test.ts
// 行为级验证：network_hook 门控与 body 采集语义
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    start_network_hook,
    stop_network_hook,
    _set_nonce_for_test,
    _set_secret_for_test,
    build_page_script,
} from '../../src/extension/content/network_hook';
import { sign_message, TEST_SECRET } from '../support/helpers/signed_message';

function dispatch_message(data: unknown): void {
    window.dispatchEvent(new MessageEvent('message', {
        data,
        origin: window.location.origin,
        source: window,
    }));
}

describe('network_hook 配置门控行为 (T098)', () => {
    let sender: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        sender = vi.fn();
        _set_nonce_for_test('nonce-1');
        _set_secret_for_test(TEST_SECRET);
    });

    afterEach(() => {
        stop_network_hook();
        _set_nonce_for_test(null);
        _set_secret_for_test(null);
    });

    it('AC-001: 未 start（capture_network=false 门控结果）时 hook 事件不转发', () => {
        dispatch_message({
            source: '__capture_all_network_hook__',
            nonce: 'nonce-1',
            method: 'GET',
            url: 'https://example.com/data',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        });
        expect(sender).not.toHaveBeenCalled();
    });

    it('AC-002: start 后（capture_network=true 路径）事件转发（回归）', () => {
        start_network_hook(sender, 'cap', Date.now(), 1);
        dispatch_message(sign_message({
            source: '__capture_all_network_hook__',
            nonce: 'nonce-1',
            method: 'GET',
            url: 'https://example.com/data',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        }));
        expect(sender).toHaveBeenCalledTimes(1);
    });

    it('AC-003: capture_response_body=false 时注入脚本不含 body 采集路径', () => {
        const script = build_page_script(false, TEST_SECRET);
        expect(script).toContain('CAPTURE_BODY = false');
        // 注入脚本在 body 关闭时对 clone 分支直接返回元数据（无 response_body 读取）
        expect(script).toContain("response_body_status: 'not_enabled'");
    });

    it('AC-003b: capture_response_body=true 时注入脚本含 body 采集路径', () => {
        const script = build_page_script(true, TEST_SECRET);
        expect(script).toContain('CAPTURE_BODY = true');
        expect(script).toContain('clone.text()');
    });

    // H3: fallback 路径 URL 按配置脱敏，url_status 不再恒 captured
    it('H3: redact_data=true 时 fallback URL query 脱敏且 url_status=redacted', () => {
        start_network_hook(sender, 'cap', Date.now(), 1, true, { redact_data: true, redact_url_query: true });
        dispatch_message(sign_message({
            source: '__capture_all_network_hook__',
            nonce: 'nonce-1',
            method: 'GET',
            url: 'https://example.com/data?token=SECRET&id=1',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        }));
        expect(sender).toHaveBeenCalledTimes(1);
        const event = sender.mock.calls[0][1];
        expect(event.url_status).toBe('redacted');
        expect(event.url).not.toContain('SECRET');
        expect(event.url).toContain('%5BREDACTED%5D');
        expect(event.url).toContain('id=1');
    });

    it('H3: redact_data=true 但 redact_url_query=false 时 URL 不脱敏', () => {
        start_network_hook(sender, 'cap', Date.now(), 1, true, { redact_data: true, redact_url_query: false });
        dispatch_message(sign_message({
            source: '__capture_all_network_hook__',
            nonce: 'nonce-1',
            method: 'GET',
            url: 'https://example.com/data?token=SECRET',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        }));
        expect(sender).toHaveBeenCalledTimes(1);
        const event = sender.mock.calls[0][1];
        expect(event.url_status).toBe('captured');
        expect(event.url).toBe('https://example.com/data?token=SECRET');
    });

    it('H3: redact_data=false 时行为与修前一致（不脱敏）', () => {
        start_network_hook(sender, 'cap', Date.now(), 1, true, { redact_data: false, redact_url_query: true });
        dispatch_message(sign_message({
            source: '__capture_all_network_hook__',
            nonce: 'nonce-1',
            method: 'GET',
            url: 'https://example.com/data?token=SECRET',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        }));
        expect(sender).toHaveBeenCalledTimes(1);
        const event = sender.mock.calls[0][1];
        expect(event.url_status).toBe('captured');
        expect(event.url).toBe('https://example.com/data?token=SECRET');
    });
});
