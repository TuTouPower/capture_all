// tests/unit/logger_stack_redact.test.ts
// 验证 Error.stack 走 URL 脱敏；redact_url 对相对/无法 parse 的 URL 不 fail-open 泄露 query
import { describe, it, expect } from 'vitest';
import { redact_url } from '../../src/shared/redaction';
import { sanitize_log_value } from '../../src/shared/logger';

async function await_import_logger(): Promise<typeof import('../../src/shared/logger')> {
    return await import('../../src/shared/logger');
}

describe('logger stack 脱敏 (T100 AC-001)', () => {
    it('AC-001: Error.stack 含敏感 URL 时输出无明文 secret', () => {
        const err = new Error('boom');
        err.stack = `Error: boom
    at fn (https://example.test/x?access_token=secret123&ok=1)
    at other (file:///app/main.ts:10:5)`;
        const sanitized = sanitize_log_value(err) as { stack: string };
        expect(sanitized.stack).not.toContain('secret123');
        expect(decodeURIComponent(sanitized.stack)).toContain('[REDACTED]');
    });

    it('AC-001b: logger details 中 Error.stack 被脱敏', () => {
        const err = new Error('failed');
        err.stack = `Error: failed
    at https://example.test/data?api_key=abc123`;
        const sanitized = sanitize_log_value({ error: err }) as { error: { stack: string } };
        expect(sanitized.error.stack).not.toContain('abc123');
    });
});

describe('redact_url 相对/无法 parse (T100 AC-002)', () => {
    it('AC-002: 相对 URL query 脱敏不泄露敏感值', () => {
        const result = redact_url('path?api_key=abc123&ok=1', true);
        expect(result.url).not.toContain('abc123');
        expect(result.url).toContain('[REDACTED]');
        expect(result.url_status).toBe('redacted');
    });

    it('AC-002b: 纯 query 串（无路径）脱敏', () => {
        const result = redact_url('?token=xyz123', true);
        expect(result.url).not.toContain('xyz123');
        expect(result.url).toContain('[REDACTED]');
    });

    it('AC-003: 无 query 的普通绝对 URL 脱敏后保留 host/path', () => {
        const result = redact_url('https://example.test/foo/bar', true);
        expect(result.url).toContain('example.test');
        expect(result.url).toContain('/foo/bar');
        expect(result.url_status).toBe('captured');
    });

    it('AC-002d: 相对 query 嵌套绝对 URL 时内层敏感值也脱敏（f001 回归）', () => {
        const result = redact_url('?next=https://app.example.com/login?token=abc123', true);
        expect(result.url).not.toContain('abc123');
        expect(decodeURIComponent(result.url)).toContain('[REDACTED]');
    });

    it('AC-002e: JS 可选链/三元不被误匹配（f002 回归）', async () => {
        // 可选链与三元应原样保留（无 key=value 形态）
        const { sanitize_log_value: slv } = await await_import_logger();
        const s1 = slv('user?.token 读取失败') as string;
        expect(s1).toContain('user?.token 读取失败');
        expect(s1).not.toContain('[REDACTED]');
        const s2 = slv('cond?token:x') as string;
        expect(s2).toContain('cond?token:x');
    });

    it('AC-002f: 编码敏感 key 也脱敏（f004 回归）', () => {
        const result = redact_url('?%74oken=secret', true);
        expect(result.url).not.toContain('secret');
    });

    it('AC-002c: 含敏感键的绝对 URL query 脱敏', () => {
        const result = redact_url('https://example.test/x?access_token=sec1&id=5', true);
        expect(result.url).not.toContain('sec1');
        expect(decodeURIComponent(result.url)).toContain('[REDACTED]');
        expect(result.url).toContain('id=5');
    });
});
