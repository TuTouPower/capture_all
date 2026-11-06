# T063 max_body_capture_bytes + bridge timeout boundary validation

## 背景
bridge/cdp_handler.ts max_body_capture_bytes 接受任意 number 不校验整数/非负/上限。server.ts validate_command_request 只查 timeout_ms 类型不校验正整数/上限。

## 修复
- max_body_capture_bytes: Number.isSafeInteger + 0..MAX_BODY_CAPTURE_BYTES。
- timeout_ms: Number.isInteger + > 0 + <= 300000。

## 验收
- [x] 超范围 max_body 回退默认。
- [x] 无效 timeout_ms 返回 INVALID_QUERY。
- [x] npm test 全绿。
