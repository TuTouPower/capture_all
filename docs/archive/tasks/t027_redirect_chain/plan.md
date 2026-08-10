# Task plan - T027_redirect_chain

## 步骤

1. 红：扩展 tests/unit/network_capture.test.ts 模拟 301 → 200 重定向。
2. 红：跑测试失败。
3. 绿：requestWillBeSent 检测 params.redirectResponse：
   - existing 存在：用 redirectResponse 填充 existing.status_code/response_headers/mime，立即 emit；再 set 新 meta。
   - CdpRequestMeta 加 redirect_count 字段。
4. 全量 npm test + tsc --noEmit。
5. log + commit + 归档。

## 风险与回退

- 风险：emit 多个事件可能让现有测试期望事件数变化。缓解：grep 现有断言。
- 回退：`git revert <commit>`。
