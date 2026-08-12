// content/content_page_script.ts
// 注入脚本公共模板：network_hook / websocket_capture 的 build_page_script 组合复用。
// signal 是模块标识（如 'ws' / 'network_hook'），推导 installed/prev key 与 SIGNAL 常量，
// 与各模块的 __capture_all_{signal}_installed__ / _prev__ / SIGNAL 命名一致。
import { SYNC_HMAC_JS } from './content_hmac';
import type { CaptureEvent, CaptureErrorData } from '../../shared/types';
import { create_content_event, get_relative_time } from './content_event_utils';

// 重注入还原守卫：先还原上次 hook 再重装（持最新 SECRET），stop→start 采集不断流；
// 原 guard 语义从「阻止重注入」改为「还原后重装」，hook 链不叠加。
// restore_body 为模块特有的还原语句（引用 prev_hook），由调用方按行内嵌缩进提供。
export function page_script_reinstall_guard(signal: string, restore_body: string): string {
    return `if (window.__capture_all_${signal}_installed__) {
        var prev_hook = window.__capture_all_${signal}_prev__;
        if (prev_hook) {
${restore_body}
        }
    }
    window.__capture_all_${signal}_installed__ = true;`;
}

// 注入脚本头部：SIGNAL / SECRET 声明 + HMAC 同步实现（sign_str）。
export function page_script_preamble(signal: string, secret: string): string {
    return `var SIGNAL = '__capture_all_${signal}__';
    var SECRET = '${secret}';
${SYNC_HMAC_JS}`;
}

// stop 还原脚本：用 __capture_all_{signal}_prev__ 还原点还原 window API，并清理 installed/prev 标记。
// restore_body 为模块特有还原语句（引用 prev），由调用方提供。
export function page_script_restore(signal: string, restore_body: string): string {
    return `if (window.__capture_all_${signal}_installed__) {
    var prev = window.__capture_all_${signal}_prev__;
    if (prev) {
${restore_body}
    }
    delete window.__capture_all_${signal}_installed__;
    delete window.__capture_all_${signal}_prev__;
}`;
}

// B3-M3: 注入页面脚本并诊断失败，替代各模块空的 inject_page_script 的裸 try/catch。
// - DOM 插入同步异常 → 立即 on_failure('dom_inject_exception')
// - CSP 拦截 inline script → script 元素 error 事件（HTML spec：blocked-by-CSP 的 classic script
//   触发 error）→ on_failure('csp_blocked_or_eval_error')；error 任务先于 setTimeout(0) 派发，
//   故延时移除不吞诊断。
// 返回 script 元素（测试可派发 error 事件验证诊断路径）；同步异常返回 null。
export function inject_script_element(
    script_text: string,
    on_failure: (reason: string) => void,
): HTMLElement | null {
    const element = document.createElement('script');
    element.textContent = script_text;
    element.addEventListener('error', () => on_failure('csp_blocked_or_eval_error'), { once: true });
    try {
        (document.documentElement || document.head || document.body).appendChild(element);
    } catch {
        element.remove();
        on_failure('dom_inject_exception');
        return null;
    }
    setTimeout(() => element.remove(), 0);
    return element;
}

// 注入失败上报：发 capture_error 事件（recoverable=false），SW 侧计入 error stats。
export function report_injection_failure(
    module: string,
    reason: string,
    state: { capture_id: string; capture_start_epoch_ms: number; tab_id: number },
    sender: ((event: CaptureEvent) => void) | null,
): void {
    if (!sender) return;
    const data: CaptureErrorData = {
        module,
        message: `Page script injection failed (${reason}); capture degraded`,
        reason,
        recoverable: false,
        fallback_used: false,
    };
    const event = create_content_event({
        capture_id: state.capture_id,
        category: 'error',
        type: 'capture_error',
        relative_time_ms: get_relative_time(state.capture_start_epoch_ms),
        tab_id: state.tab_id,
        source: 'content_script',
        severity: 'error',
    });
    sender({ ...event, data } as CaptureEvent & CaptureErrorData);
}
