// content/content_message.ts — t195 AC-003: content onMessage 响应纯函数。
// 独立模块避免 content_script 顶层 chrome 注册副作用阻断 import（行为级单测入口）。

/** B3-M8: 未知 action 显式失败响应——避免 return true 后通道永不 resolve 挂起发送端。 */
export function unknown_action_response(): { success: false; error: 'unknown_action' } {
    return { success: false, error: 'unknown_action' };
}
