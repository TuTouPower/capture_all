# Task spec

## 背景

MCP 指南把 `output_path` 公开为任意本地路径，示例用 `"/absolute/path/export.json"`；t137 安全约束后 `safe_output_path` 只接受导出目录内相对路径，绝对路径返回 `INVALID_QUERY`。同时默认导出目录首次使用时 `realpath(base)` 抛 `ENOENT`，顶层转成 HTTP 500；嵌套父目录不存在时 `writeFile` 失败返回 500。文档与契约、初始化路径均未同步。

## 契约区

### 范围

- 明确并发布单一契约：`output_path` 为导出根目录内相对路径/文件名。
- 指南删除任意绝对路径示例，解释实际返回的绝对 `file_path`。
- MCP schema 增加相对路径、禁止 `..`/绝对路径校验，错误在 tool 输入边界产生。
- `safe_output_path` 在 `realpath(base)` 前安全创建 base；写入嵌套路径时创建目标父目录并再次校验。

### 非范围

- 不弱化 t137 的绝对路径/`..`/symlink 逃逸防护。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：指南示例使用导出目录内相对路径（如 `"output_path":"export.json"`），不再用绝对路径示例。
- [ ] AC-002：默认导出目录不存在时，首次显式相对路径导出成功，不返回 500。
- [ ] AC-003：`output_path:"nested/export.json"` 父目录不存在时导出成功（或 MCP 输入边界明确拒绝）。
- [ ] AC-004：绝对路径、`..`、symlink escape 仍被拒绝，防护不退化。
- [ ] AC-005：新增默认目录不存在、合法相对路径、嵌套目录、base/parent symlink 四类测试通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：临时导出目录 fixture 覆盖四类路径。

## 上下文区

- 来源：BC-001、BM-M003（2026-08-13 核实，`da722d5`/`5649916` 引入绝对路径能力，`7daf059` t137 引入 containment）。

### 有意不测

- 无。

### 测试策略

- 真实临时目录驱动 `safe_output_path` 与写盘路径；断言拒绝与成功边界。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：创建 base/父目录时引入 symlink 逃逸窗口。
- 回退：创建前/后均做 containment + symlink 校验，不降级。

### 依赖与约束

- 复用 t137 的 containment 校验，不弱化。

### Finalization 时更新的 blueprint

- `docs/guides/mcp_usage.md`：更新 `output_path` 契约与示例。
