# Task spec

## 背景

`resolve_auto_output_path` 对 `capture_id` 做字符过滤，对 `format` 原样拼进 `join(dir, id.format)`。恶意 format（含 `..` 或路径分隔）可写出 EXPORT_DIR 外。P0-5 verified。

## 契约区

### 范围

- 净化 auto 导出路径的 format（及必要时的完整路径解析），保证最终文件落在配置导出目录内。
- 非法 format 拒绝或回退安全默认（如 `json`），并返回可观察错误码/失败结果。
- 单测覆盖逃逸样例。

### 非范围

- 不改 MCP 工具列表。
- 不实现任意用户指定绝对路径导出（除非已有契约且仍限制在 allow 目录）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：payload.format 含 `..`、`/` 或 `\\` 时，不在 EXPORT_DIR 外创建/写入文件；调用结果为失败或使用安全默认扩展名且路径仍在导出目录下。
- [ ] AC-002：合法 format（如 `json`/`jsonl`/`har`/`html` 中项目已支持集合）仍写出到导出目录内且文件名以安全 capture_id 为基。
- [ ] AC-003：最终 resolve 后的绝对路径的 realpath 前缀等于导出目录 realpath（或等价目录包含判定）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试（临时目录作 EXPORT_DIR）。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P0-5；src_bridge_mcp/review.md f002

### 有意不测

- 无

### 测试策略

- 设 CAPTURE_ALL_EXPORT_DIR 到 tmp；调用 resolve/write 路径；断言文件系统位置。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：过严 format 白名单可能拒绝用户自定义扩展名——应用明确允许列表或仅允许 [a-z0-9]+。
- 回退：恢复原 join（不安全，仅紧急）。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
