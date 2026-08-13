# Spike report

## 问题

Agent capture config 的 `max_body_capture_bytes` / `inline_text_max_bytes` 硬上限取值——应拒绝超过多少的值？

## 成功判据

- 明确硬上限：取自既有常量（与采集实现一致），无新魔数。

## 尝试

- `src/shared/constants.ts`：`MAX_BODY_CAPTURE_BYTES = 100MB`（单条 body 采集上限，`DEFAULT_CONFIG.max_body_capture_bytes` 默认值）、`INLINE_TEXT_MAX_BYTES = 32KB`（inline 文本上限）。
- 采集实现（network_capture/body_capture）按 `max_body_capture_bytes` 截断，> 常量值无额外意义（已到全局上限）。
- `agent_command_dispatcher.ts` `has_valid_capture_config_values` 只校验非负整数，无上限。

## 证据

- constants.ts:25/27 常量定义；dispatcher:291-292 非负整数校验。

## 结论

硬上限 = 既有常量：`max_body_capture_bytes ≤ MAX_BODY_CAPTURE_BYTES`（100MB）、`inline_text_max_bytes ≤ INLINE_TEXT_MAX_BYTES`（32KB）。超限拒绝（INVALID_QUERY），与采集实现口径一致，无新魔数。

## 是否采纳

- 决定：是
- 理由：复用既有全局上限，防配置超过采集实现能力。
- 后续 task：t178
