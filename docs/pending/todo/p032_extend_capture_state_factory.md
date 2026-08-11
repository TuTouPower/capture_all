# p032 扩展 create_capture_state 工厂到其余 content 捕获模块

- 来源：t127 遗留（review_code 非阻断观察）
- 内容：t127 将 9 个 content 捕获模块（mouse/keyboard/scroll/focus/resize/visibility/fullscreen/print/form_submit）的状态样板抽为 create_capture_state 工厂。clipboard/dom/storage/network_hook/websocket 及 content_script 仍保留同构样板（is_capturing + capture_id + epoch + tab_id + send_event 模块级变量 + start 重入守卫），命名也不统一。可扩展工厂到这些模块统一样板；含 monkey-patch 还原逻辑的模块（clipboard/network_hook/websocket）需额外处理还原点状态。
- 处理：未开
