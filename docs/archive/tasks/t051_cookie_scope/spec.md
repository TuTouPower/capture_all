# Task spec + log - T051 cookie_scope

## 背景

`cookie_capture.ts` `chrome.cookies.onChanged` 全局事件，未按目标 tab/site/store 过滤，所有事件写 tab_id:0。

## 范围

- start_cookie_capture 加 target_tab_url/target_tab_id 参数。
- extract_target_domains 提取主域名 + 所有父域（含 dot 前缀）。
- handle_cookie_changed 按 cookie.domain 过滤；tab_id 改为传入值。
- service_worker.ts 调用点传 start_url + tab_id。

## 验收

- [x] cookie event 仅当 domain 匹配目标 tab 域时才发送。
- [x] tab_id 使用传入值。
- [x] npm test 全绿。

## 进展

- 2026-07-19：实施。
