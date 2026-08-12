// @vitest-environment jsdom
// tests/unit/dom_utils.test.ts — build_xpath（B3-L4: id 单引号转义）
import { describe, it, expect } from 'vitest';
import { build_xpath } from '../../src/extension/shared/dom_utils';

describe('build_xpath', () => {
    it('builds path with plain id', () => {
        const el = document.createElement('div');
        el.id = 'hero';
        document.body.appendChild(el);
        expect(build_xpath(el)).toContain("[@id='hero']");
    });

    it('builds positional path when no id', () => {
        const el = document.createElement('button');
        document.body.appendChild(el);
        expect(build_xpath(el)).toMatch(/\/button\[\d+\]$/);
    });

    // B3-L4: id 含单引号时用 concat 分段转义，避免 XPath 谓词语法损坏
    it('escapes single quote in id (B3-L4)', () => {
        const el = document.createElement('input');
        el.id = "it's";
        document.body.appendChild(el);
        const xpath = build_xpath(el);
        // 不出现未转义的 `[@id='it's']`
        expect(xpath).not.toContain("[@id='it's']");
        // 使用 concat('it',"'",'s') 合法字面量
        expect(xpath).toContain("[@id=concat('it',\"'\",'s')]");
    });

    it('escapes ids with multiple single quotes', () => {
        const el = document.createElement('a');
        el.id = "a'b'c";
        document.body.appendChild(el);
        const xpath = build_xpath(el);
        expect(xpath).toContain("concat('a',\"'\",'b',\"'\",'c')");
    });
});
