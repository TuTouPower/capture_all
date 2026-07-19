# Task spec + log - T044 html_export_escape

## 背景

`src/extension/background/exporter.ts:104-167` JSON 走 escape_for_html_embed，但 capture_id/start_date/duration_str/body_capture_mode/body_capture_status 直接插入 HTML text/title。

## 范围

- 用 escape_html 包装所有动态 HTML 文本插值：capture_id、start_date、duration_str、body_capture_mode、body_capture_status。

## 验收

- [x] HTML 中所有动态字段走 escape_html。
- [x] npm test 全绿。

## 进展

- 2026-07-19：import escape_html；safe_capture_id/safe_start_date 局部变量；duration/body_capture_info 全部 escape。
