# Task log - T027 redirect_chain

## 进展

- 2026-07-19：`src/extension/background/network_capture.ts` requestWillBeSent 处理 `params.redirectResponse`：
  - existing 存在时，用 redirectResponse 填充 existing.status_code/response_headers/mime，立即 emit 前一跳事件（status 3xx）作为重定向中间证据。
  - 再 set 新 meta（覆盖），保留 redirect_count（meta.redirect_count 累加）。
  - `CdpRequestMeta` 加可选 `redirect_count?: number` 字段。

## 关键验证

- 红 -> 绿：redirect_chain.test.ts 1 用例 -> 直接全绿（实现已先于测试完成；测试验证行为）。
- 全量：`npm test` 101 文件 / 1130 用例全绿。
- TypeScript：`tsc --noEmit` 无错误。

## 决策

- 前一跳事件 body_status='not_enabled'（重定向响应通常无 body，仅 location header）。
- redirect_count 字段可选，不破坏现有 schema；下游可选择展示。
- 仅 CDP 路径处理重定向；webRequest 路径独立 requestId，不涉及。

## 验收

- [x] 301 → 200 重定向 emit 至少 2 个事件。
- [x] 前一跳 status_code=301，最终 status_code=200。
- [x] 两个 URL 独立保留。
- [x] npm test 全绿。
