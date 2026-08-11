// tests/unit/t113_logger_url_boundary.test.ts
// t113: Logger 任意文本 URL 扫描边界启发式回归。
// 负例（三元/可选链/无斜杠相对路径）逐字保留；正例（明确 URL 上下文）脱敏。
import { describe, it, expect } from 'vitest';
import { sanitize_log_value } from '../../src/shared/logger';

type T113Case = {
    name: string;
    input: unknown;
    expect_redacted: boolean;
};

// 负例：非 URL 的 JS 三元/可选链必须逐字保留
const negative_cases: T113Case[] = [
    { name: '三元 message', input: 'branch result: cond?token=x:y', expect_redacted: false },
    { name: '三元嵌套 details', input: { detail: 'cond?token=x:y' }, expect_redacted: false },
    { name: '三元 Error message', input: { message: 'Error: got cond?token=x:y in line 3' }, expect_redacted: false },
    { name: '可选链', input: 'value user?.token missing', expect_redacted: false },
    // 无斜杠相对路径（file?token=x）属边界启发式显式收缩面，不参与任意文本扫描
    { name: '无斜杠相对路径收缩', input: 'open file?token=SECRET now', expect_redacted: false },
];

// 正例：具备明确 URL 上下文的片段必须脱敏
const positive_cases: T113Case[] = [
    { name: '绝对 URL', input: 'see https://example.com/p?token=SECRET now', expect_redacted: true },
    { name: '独立 ?query', input: 'redirect to ?token=SECRET please', expect_redacted: true },
    { name: '/path?query', input: 'go /login?token=SECRET now', expect_redacted: true },
    { name: '括号内 /path?query', input: 'go (/login?token=SECRET) now', expect_redacted: true },
    { name: '合法冒号 query', input: 'url https://example.com/p?token=abc:def ok', expect_redacted: true },
    { name: 'data URL value', input: 'got https://example.com/p?token=data:text/plain;base64,QUJDRA==', expect_redacted: true },
    { name: 'base64 = padding', input: 'see https://example.com/p?token=QUJDRA== end', expect_redacted: true },
    { name: '逗号分隔 /path?query', input: 'list: /a?token=SECRET, /b', expect_redacted: true },
    // f001: `=` 前置的序列化形态（path=/login?…、url=?…）必须脱敏，防止明文残留
    { name: '等号前置 path', input: 'path=/login?token=SECRET&k=2', expect_redacted: true },
    { name: '等号前置 bare query', input: 'url=?token=SECRET&k=2', expect_redacted: true },
    { name: '引号内 path', input: 'src="/login?token=SECRET"', expect_redacted: true },
    // 行首 /path?query 与行首 ?query（字符串开头即 URL 上下文）
    { name: '行首 path', input: '/login?token=SECRET then', expect_redacted: true },
    { name: '行首 bare query', input: '?token=SECRET then', expect_redacted: true },
    // 左方括号 / 尖括号 / 引号前置（lookbehind 其余分支）
    { name: '方括号内 path', input: 'go [/login?token=SECRET] now', expect_redacted: true },
    { name: '尖括号内 path', input: 'see </login?token=SECRET> now', expect_redacted: true },
    { name: '单引号内 path', input: "go '/login?token=SECRET' now", expect_redacted: true },
    // f003 已知边界固化：带空格三元（cond ?token=x:y）与独立 ?query 同享 \s URL 边界语义，
    // 会被当作 query 脱敏（spec 上下文区披露的已知权衡，非静默 false negative）
    { name: '带空格三元（已知边界）', input: 'cond ?token=x:y', expect_redacted: true },
];

function contains_redacted(value: unknown): boolean {
    if (typeof value === 'string') return value.includes('REDACTED');
    if (value === null || typeof value !== 'object') return false;
    return Object.values(value as Record<string, unknown>).some((v) => contains_redacted(v));
}

describe('t113 Logger URL 边界启发式', () => {
    it.each(negative_cases)('负例保留原文：$name', ({ input }) => {
        const out = sanitize_log_value(input);
        expect(contains_redacted(out)).toBe(false);
        // 字符串形态原样保留；对象形态逐字保留（不被吞/置空）
        if (typeof input === 'string') {
            expect(out).toBe(input);
        } else {
            expect(out).toEqual(input);
        }
    });

    it('负例 Error 实例（stack 路径）逐字保留', () => {
        const err = new Error('Error: got cond?token=x:y in line 3');
        const out = sanitize_log_value({ error: err }) as { error: { message: string; stack: string } };
        expect(contains_redacted(out)).toBe(false);
        expect(out.error.message).toBe('Error: got cond?token=x:y in line 3');
        expect(out.error.stack).toContain('cond?token=x:y');
    });

    it.each(positive_cases)('正例脱敏：$name', ({ input }) => {
        const out = sanitize_log_value(input);
        expect(contains_redacted(out)).toBe(true);
        // 敏感值不得以明文残留
        const serialized = JSON.stringify(out);
        expect(serialized).not.toContain('SECRET');
        expect(serialized).not.toContain('QUJDRA==');
        expect(serialized).not.toContain('abc:def');
    });
});
