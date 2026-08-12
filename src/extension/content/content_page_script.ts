// content/content_page_script.ts
// 注入脚本公共模板：network_hook / websocket_capture 的 build_page_script 组合复用。
// signal 是模块标识（如 'ws' / 'network_hook'），推导 installed/prev key 与 SIGNAL 常量，
// 与各模块的 __capture_all_{signal}_installed__ / _prev__ / SIGNAL 命名一致。
import { SYNC_HMAC_JS } from './content_hmac';

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
