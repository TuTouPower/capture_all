// @vitest-environment jsdom
// tests/unit/content_injection_diagnostics.test.ts — B3-M3: 注入失败诊断（CSP 拦截 / DOM 异常）
// inject_script_element 与 report_injection_failure 依赖 document/window，独立 jsdom 文件（
// 避免污染 content_page_script.test.ts 的 node 路径解析）。
import { describe, expect, it, vi } from 'vitest';
import { inject_script_element, report_injection_failure } from '../../src/extension/content/content_page_script';

describe('inject_script_element diagnostics (B3-M3)', () => {
    it('reports csp_blocked_or_eval_error when the script element fires error', () => {
        const on_failure = vi.fn();
        const el = inject_script_element('(function(){})();', on_failure);
        expect(el).not.toBeNull();
        el!.dispatchEvent(new Event('error'));
        expect(on_failure).toHaveBeenCalledWith('csp_blocked_or_eval_error');
    });

    it('reports dom_inject_exception when appendChild throws and returns null', () => {
        const root = document.documentElement!;
        const original = root.appendChild;
        root.appendChild = (() => { throw new Error('boom'); }) as typeof original;
        const on_failure = vi.fn();
        const el = inject_script_element('(function(){})();', on_failure);
        expect(el).toBeNull();
        expect(on_failure).toHaveBeenCalledWith('dom_inject_exception');
        root.appendChild = original;
    });
});

describe('report_injection_failure (B3-M3 capture_error)', () => {
    it('emits a capture_error event with recoverable=false', () => {
        const sender = vi.fn();
        report_injection_failure('storage', 'csp_blocked_or_eval_error', { capture_id: 'c1', capture_start_epoch_ms: 1000, tab_id: 1 }, sender);
        expect(sender).toHaveBeenCalledTimes(1);
        const evt = sender.mock.calls[0][0];
        expect(evt.type).toBe('capture_error');
        expect(evt.category).toBe('error');
        expect(evt.severity).toBe('error');
        expect(evt.data.recoverable).toBe(false);
        expect(evt.data.reason).toBe('csp_blocked_or_eval_error');
        expect(evt.data.module).toBe('storage');
    });
});
