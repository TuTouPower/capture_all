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
只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。
<!-- /规范 -->

- [ ] AC-001：payload.format 含 `..`、`/` 或 `\\` 时，不在 EXPORT_DIR 外创建/写入文件；调用结果为失败或使用安全默认扩展名且路径仍在导出目录下。
- [ ] AC-002：合法 format（如 `json`/`jsonl`/`har`/`html` 中项目已支持集合）仍写出到导出目录内且文件名以安全 capture_id 为基。
- [ ] AC-003：最终 resolve 后的绝对路径的 realpath 前缀等于导出目录 realpath（或等价目录包含判定）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试（临时目录作 EXPORT_DIR）。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P0-5；src_bridge_mcp/review.md f002

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 设 CAPTURE_ALL_EXPORT_DIR 到 tmp；调用 resolve/write 路径；断言文件系统位置。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无

### 风险与回退

- 风险：过严 format 白名单可能拒绝用户自定义扩展名——应用明确允许列表或仅允许 [a-z0-9]+。
- 回退：恢复原 join（不安全，仅紧急）。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
