# Task log - T026 sse_body_cap

## 进展

- 2026-07-19：`src/extension/background/network_capture.ts` 两处修复：
  1. stream_buffer on_flush：拼接前用 TextEncoder 检查累计字节；超 max_body_capture_bytes 时停止追加并标 meta.response_body_status='too_large'；已超上限的后续 on_flush 直接 return。
  2. loadingFinished 流式分支：优先尊重 on_flush 标注的 too_large，避免重新评估时回退到 captured。

## 关键验证

- 红 -> 绿：sse_body_cap.test.ts 1 用例 -> 红 -> 全绿。
- 全量：`npm test` 100 文件 / 1129 用例全绿。
- TypeScript：`tsc --noEmit` 无错误。

## 决策

- 累计字节检查每次 on_flush 调用 TextEncoder.encode().length。CPU 开销与内存压力权衡：拼接前检查可阻止无界增长，CPU 开销远低于内存压力风险。
- 超上限时保留 remaining 字节的部分内容，保证可观察。
- loadingFinished 评估 status 时优先用 meta.response_body_status（on_flush 标注），保留 too_large 语义。

## 验收

- [x] SSE 累计字节超 max 后 meta.response_body_status='too_large'。
- [x] 后续 chunk 不再增加 meta.response_body 字节。
- [x] npm test 全绿。
