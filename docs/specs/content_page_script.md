# spec: content_page_script

## 背景

`network_hook.ts` 与 `websocket_capture.ts` 的 `build_page_script` 曾各自内联同构注入脚本片段（重注入还原守卫、SIGNAL/SECRET 声明、SYNC_HMAC_JS、post 签名发送）。T121 后 SYNC_HMAC_JS 已共享，但还原守卫与头部声明仍双份维护。t126 抽取共享模板收敛。

## 验收标准

- AC-001：`network_hook.ts` 与 `websocket_capture.ts` 的 `build_page_script` 不再各自内联同构片段，共享模板被两者引用（代码结构断言）。
- AC-002：注入脚本行为不变：network_hook / websocket_capture / content_hmac 相关测试全绿，断言覆盖还原重装、per-message HMAC 签名、nonce 动态读取。
- AC-003：`npm test` 全绿，`npx tsc --noEmit` 通过。

## 可测试性

全部 AC 可自动测试：AC-001 结构断言，AC-002/003 测试套件。

## 共享模板落点

`src/extension/content/content_page_script.ts` 导出 `page_script_reinstall_guard(signal, restore_body)`（重注入还原守卫，restore 由调用方注入）与 `page_script_preamble(signal, secret)`（SIGNAL/SECRET 声明 + SYNC_HMAC_JS）。`signal` 推导模块的 `__capture_all_{signal}_installed__` / `_prev__` / SIGNAL 常量。post 发送逻辑因各模块 nonce 键名与载荷构造差异保留在各自 `build_page_script`。
