# Task spec - T024 stream_buffer_cleanup

## 背景

`src/extension/background/stream_buffer.ts`：

1. `on_flush` 类型固定为同步 `void`，`flush()` 在调用回调前已清空 chunks/bytes；回调失败或下游异步队列失败时 buffer 无法恢复数据。连续达阈值时不等待前一次 flush 入队，缺背压。
2. `flush()` 仅清空 entry 内容不从 buffers Map 删除；`force_flush`/`flush_all` 也不清理。只有外部显式 `remove()` 才删，但接口未把"连接结束必须 remove"编码为不变量，长时间采集大量请求时每个 request_id 至少永久保留一个对象，MV3 SW keepalive 下显著内存泄漏。`size()` 也把已空 entry 计为活跃流。
3. `remove(request_id)` 对不存在 request_id 会抛 TypeError：`entry?.timer !== null` 当 entry 为 undefined 时为 true（`undefined !== null`），随后 `entry!.timer!` 解引用 undefined。

## 范围

代码/配置：

- `src/extension/background/stream_buffer.ts`：
  - `on_flush` 改返回 `Promise<void>` 或 `void`，按 request_id 串行 flush（前一次 await 后再放下一次）。
  - 成功后才丢弃 chunks/bytes；失败保留批次待重试（限次）。
  - 区分 `flush`（保留 entry 继续接收）与 `finish`（flush + delete entry）；`force_flush` 默认 finish（连接结束语义）。
  - `remove(request_id)` 改 `if (entry?.timer != null)`，幂等 delete 不存在 request_id。
  - `size()` 仅计 chunks.length > 0 的活跃流。

测试：

- `tests/unit/stream_buffer.test.ts` 扩展：
  - `force_flush` 后 entry 从 Map 删除。
  - `remove` 不存在 request_id 不抛错。
  - on_flush 失败时 chunks 保留。
  - 异步 on_flush 串行（连续 append 不重叠）。

文档：

- 无 blueprint 改动。

## 非范围

- 不引入全局高水位限制（T038 配套）。
- 不改 stream_buffer 调用方业务逻辑（cdp_handler 已调 force_flush + remove 配合）。

## 验收标准

- [ ] `force_flush(req)` 后 buffers 不含 req。-> 验证：单测。-> 预期：size 不含 req。
- [ ] `remove(unknown)` 不抛错。-> 验证：单测。-> 预期：无异常。
- [ ] on_flush 抛错时 chunks 保留。-> 验证：单测。-> 预期：entry.chunks 非空。
- [ ] `npm test` 全绿。

## 依赖与约束

- 受影响业务不变量：流式 body 写入失败可重试；连接结束原子清理；Map 不无限增长。
- 无数据迁移。
- 无平台限制。
