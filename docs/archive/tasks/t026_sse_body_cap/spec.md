# Task spec - T026 sse_body_cap

## 背景

`src/extension/background/network_capture.ts:190-197` stream_buffer 的 on_flush 把 accumulated 拼接到 `meta.response_body`，每次 += accumulated，累计字节检查仅在 `loadingFinished` 后决定终态（line 502-504），不限制采集期间累计字符串。

SSE 长连接可长期不触发 `loadingFinished`，导致 `meta.response_body` 持续增长，SW 内存压力、GC、进程终止、采集中断；恶意页面可制造资源耗尽。

## 范围

代码/配置：

- `src/extension/background/network_capture.ts` stream_buffer on_flush：
  - 每次拼接前用 TextEncoder 检查累计字节；超过 `config.max_body_capture_bytes` 时停止追加并标 `meta.response_body_status = 'too_large'`。
  - 已超上限的 meta 后续 on_flush 直接 return（不再拼接）。

测试：

- `tests/unit/network_capture.test.ts` 或新建：模拟 SSE 长流，累计字节超过 max 后 meta 标 'too_large' 且后续 chunk 不再增加。

文档：

- 无 blueprint 改动。

## 非范围

- 不改 cdp_handler.ts 的 stream_buffer（T024 已处理 entry 生命周期）。
- 不改 SSE chunk 协议。

## 验收标准

- [ ] SSE 累计字节超 max_body_capture_bytes 后 meta.response_body_status === 'too_large'。-> 验证：单测。-> 预期：'too_large'。
- [ ] 后续 chunk 不再增加 meta.response_body 字节。-> 验证：单测。-> 预期：长度不再增长。
- [ ] `npm test` 全绿。

## 依赖与约束

- 受影响业务不变量：SSE 长流不耗尽内存；max_body_capture_bytes 在采集期间生效。
- 无数据迁移。
- 无平台限制。
