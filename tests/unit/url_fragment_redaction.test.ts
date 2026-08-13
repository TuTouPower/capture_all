// tests/unit/url_fragment_redaction.test.ts
// t173 SEC-006 AC-001~005: URL fragment 结构感知脱敏
import { describe, expect, it } from 'vitest';
import { redact_url } from '../../src/shared/redaction';

describe('redact_url fragment 脱敏', () => {
    it('AC-001: OAuth implicit——#access_token=SECRET 脱敏不保留 secret', () => {
        const r = redact_url('https://app.example/callback#access_token=SECRET&token_type=bearer', true);
        expect(r.url_status).toBe('redacted');
        expect(r.url).not.toContain('SECRET');
        expect(r.url).toContain('access_token=[REDACTED]');
        // token_type 含 'token' 子串，随既有 query 敏感 key 规则一并脱敏
        expect(r.url).toContain('token_type=[REDACTED]');
    });

    it('AC-002: hash route——#/route?token=SECRET 的 token 被脱敏', () => {
        const r = redact_url('https://app.example/#/callback?token=SECRET&state=abc', true);
        expect(r.url_status).toBe('redacted');
        expect(r.url).not.toContain('SECRET');
        expect(r.url).toContain('/callback?token=[REDACTED]');
        expect(r.url).toContain('state=abc');
    });

    it('AC-003a: 普通锚点 #section 保形', () => {
        const r = redact_url('https://app.example/page#section', true);
        expect(r.url_status).toBe('captured');
        expect(r.url).toBe('https://app.example/page#section');
    });

    it('AC-003b: 无敏感 hash route 保形', () => {
        const r = redact_url('https://app.example/#/dashboard', true);
        expect(r.url_status).toBe('captured');
        expect(r.url).toBe('https://app.example/#/dashboard');
    });

    it('AC-003c: hash route 无 query 但无凭据保形', () => {
        const r = redact_url('https://app.example/#/orders/123', true);
        expect(r.url_status).toBe('captured');
        expect(r.url).toBe('https://app.example/#/orders/123');
    });

    it('AC-004a: route 值泄漏形（#/token/SECRET）fail-closed 替换整个 fragment', () => {
        const r = redact_url('https://app.example/#/token/SECRET?state=x', true);
        expect(r.url_status).toBe('redacted');
        // 整个 fragment 被替换（非逐 key 脱敏）
        expect(r.url).toContain('#[REDACTED]');
        expect(r.url).not.toContain('SECRET');
    });

    it('AC-004b: 编码 hash decode 失败但命中 credential fail-closed', () => {
        const r = redact_url('/path#token%3DSECRET%ZZ', true);
        expect(r.url_status).toBe('redacted');
        expect(r.url).toContain('#[REDACTED]');
        expect(r.url).not.toContain('SECRET');
    });

    it('AC-004d: access_token/id_token/refresh_token route 值泄漏同样 fail-closed（f003）', () => {
        for (const leak of ['access_token', 'refresh_token', 'id_token', 'credential']) {
            const r = redact_url(`https://app.example/#/${leak}/SECRET?state=x`, true);
            expect(r.url_status, leak).toBe('redacted');
            expect(r.url).toContain('#[REDACTED]');
            expect(r.url).not.toContain('SECRET');
        }
    });

    it('AC-004c: 普通路由名 /oauth/token 不触发 fail-closed（f001）', () => {
        const r = redact_url('https://app.example/#/oauth/token?client_id=abc', true);
        // query 无敏感、route 为路由名 → 保形
        expect(r.url_status).toBe('captured');
        expect(r.url).toBe('https://app.example/#/oauth/token?client_id=abc');
    });

    it('AC-005a: encoded hash——%3D/%3F 编码的 hash 参数', () => {
        const r = redact_url('https://app.example/#access_token%3DSECRET%26type%3Dbearer', true);
        expect(r.url_status).toBe('redacted');
        expect(r.url).not.toContain('SECRET');
        expect(r.url).toContain('REDACTED');
    });

    it('AC-005b: query 部分不受影响（既有规则）+ hash 同时脱敏', () => {
        const r = redact_url('https://app.example/?next=1#access_token=SECRET', true);
        expect(r.url_status).toBe('redacted');
        expect(r.url).toContain('next=1');
        expect(r.url).toContain('access_token=[REDACTED]');
    });

    it('AC-005c: 相对 URL 带 query + hash 双脱敏', () => {
        const r = redact_url('/api?code=abc#token=SECRET', true);
        expect(r.url_status).toBe('redacted');
        expect(r.url).toContain('token=[REDACTED]');
        expect(r.url).not.toContain('SECRET');
    });

    it('redact_query=false 时 fragment 保形（既有语义）', () => {
        const r = redact_url('https://app.example/#access_token=SECRET', false);
        expect(r.url_status).toBe('captured');
        expect(r.url).toContain('access_token=SECRET');
    });
});
