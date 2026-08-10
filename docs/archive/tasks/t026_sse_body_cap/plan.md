# Task plan - T026 sse_body_cap

## 步骤

1. 红：扩展 tests/unit/network_capture.test.ts 模拟 SSE 累计字节超限。
2. 红：跑测试失败。
3. 绿：stream_buffer on_flush 内：
   - 已标 too_large 的 meta 跳过；
   - 累计 + accumulated 字节 > max_body_capture_bytes 时停止追加并标 too_large。
4. 全量 npm test + tsc --noEmit。
5. log + commit + 归档。

## 风险与回退

- 风险：每次 TextEncoder 计字节有 CPU 开销。缓解：累计 cached_bytes 字段，避免重复 encode 整字符串。
- 回退：`git revert <commit>`。
