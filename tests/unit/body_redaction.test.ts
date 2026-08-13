// tests/unit/body_redaction.test.ts
// t171 AC-002/003: body MIME 敏感 key 脱敏 + 不可解析 fallback（长度/preview）
import { describe, expect, it } from 'vitest';
import { redact_body } from '../../src/shared/body_redaction';

import { DEFAULT_CONFIG, DEFAULT_USER_CONFIG } from '../../src/shared/constants';

describe('AC-001: body 采集默认关闭', () => {
    it('DEFAULT_CONFIG / DEFAULT_USER_CONFIG 默认 capture_request_body/response_body = false', () => {
        expect(DEFAULT_CONFIG.capture_request_body).toBe(false);
        expect(DEFAULT_CONFIG.capture_response_body).toBe(false);
        expect(DEFAULT_USER_CONFIG.capture_request_body).toBe(false);
        expect(DEFAULT_USER_CONFIG.capture_response_body).toBe(false);
    });
});


describe('redact_body', () => {
    it('AC-002a: form-urlencoded 敏感 key 脱敏，非敏感保留', () => {
        const r = redact_body('username=alice&password=secret123&remember=1', 'application/x-www-form-urlencoded', 100);
        expect(r).toEqual({
            content: 'username=alice&password=[REDACTED]&remember=1',
            mode: 'redacted',
        });
    });

    it('AC-002b: JSON 嵌套敏感 key 脱敏（token/api_key/secret）', () => {
        const body = JSON.stringify({
            user: 'alice',
            session: { token: 'abc123', refresh_token: 'xyz' },
            api_key: 'key123',
            name: 'ok',
        });
        const r = redact_body(body, 'application/json', 100);
        expect(r!.mode).toBe('redacted');
        const parsed = JSON.parse(r!.content) as Record<string, unknown>;
        expect(parsed.user).toBe('alice');
        expect(parsed.name).toBe('ok');
        expect(parsed.api_key).toBe('[REDACTED]');
        expect((parsed.session as Record<string, unknown>).token).toBe('[REDACTED]');
        expect((parsed.session as Record<string, unknown>).refresh_token).toBe('[REDACTED]');
    });

    it('AC-002c: multipart 含敏感 name 降级 preview（password/file 内容默认跳过）', () => {
        const body = '--boundary\r\nContent-Disposition: form-data; name="password"\r\n\r\nhunter2\r\n--boundary--';
        const r = redact_body(body, 'multipart/form-data; boundary=boundary', 50);
        expect(r!.mode).toBe('preview');
        expect(r!.content).toContain('[body_redacted:len=');
        expect(r!.content).not.toContain('hunter2');
    });

    it('AC-003a: 未知/二进制 MIME 降级长度摘要，不落盘完整内容（f002 恒真断言修复）', () => {
        const body = 'binary\x00\x01data-with-secret-token-abcdef';
        const r = redact_body(body, 'application/octet-stream', 20);
        expect(r!.mode).toBe('preview');
        expect(r!.content).toContain('[body_redacted:len=');
        // 不含 preview 字段（长度-only）——完整原文绝不出现
        expect(r!.content).not.toContain('preview=');
        expect(r!.content).not.toContain('binary');
        expect(r!.content).not.toContain('secret-token');
    });

    it('AC-003b: JSON 解析失败降级长度摘要，不返回完整原文（f005）', () => {
        const body = '{"broken": "json" 未闭合';
        const r = redact_body(body, 'application/json', 100);
        expect(r!.mode).toBe('preview');
        expect(r!.content).toContain('[body_redacted:len=');
        expect(r!.content).not.toContain('broken');
        expect(r!.content).not.toContain('未闭合');
    });

    it('null/空 body 返回 null/空', () => {
        expect(redact_body(null, 'application/json', 100)).toBeNull();
        expect(redact_body('', 'application/json', 100)).toEqual({ content: '', mode: 'redacted' });
    });

    it('multipart 含 file part 降级（f003: file 内容默认跳过）', () => {
        const body = '--b\r\nContent-Disposition: form-data; name="file"; filename="a.txt"\r\n\r\nhello-secret\r\n--b--';
        const r = redact_body(body, 'multipart/form-data; boundary=b', 100);
        expect(r!.mode).toBe('preview');
        expect(r!.content).not.toContain('hello-secret');
    });

    it('multipart 无敏感 name 且无 file part 保留原文', () => {
        const body = '--b\r\nContent-Disposition: form-data; name="username"\r\n\r\nalice\r\n--b--';
        const r = redact_body(body, 'multipart/form-data; boundary=b', 100);
        expect(r!.mode).toBe('redacted');
        expect(r!.content).toBe(body);
    });

    it('f004: 词边界匹配不误伤 author/tokenizer', () => {
        const r = redact_body('author=me&tokenizer=x&access_token=abc', 'application/x-www-form-urlencoded', 100);
        expect(r!.content).toBe('author=me&tokenizer=x&access_token=[REDACTED]');
    });

    it('f008: 敏感词数字后缀（password2 确认字段）也脱敏', () => {
        const r = redact_body('password=one&password2=two&username=alice', 'application/x-www-form-urlencoded', 100);
        expect(r!.content).toBe('password=[REDACTED]&password2=[REDACTED]&username=alice');
    });
});
