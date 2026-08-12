# p033 storage_capture build_page_script 迁移到共享模板

- 来源：t126 审阅范围外观察（code_review storage_capture.ts 第三处同构位点）
- 内容：`storage_capture.ts` 的注入脚本与 websocket_capture 同构（post 形状、SIGNAL/SECRET/SYNC_HMAC_JS、重注入还原守卫），t126 仅覆盖 network_hook 与 websocket_capture。storage_capture 未迁移，仍内联 SYNC_HMAC_JS 与还原守卫，双份维护风险依旧。待迁移到 `content_page_script.ts` 共享模板（page_script_reinstall_guard / page_script_preamble）。
- 处理：未开
