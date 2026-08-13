# Task review t176（reviewer_focus: 代码）

- task：`t176_fix_output_path_contract`
- spec：`docs/tasks/t176_fix_output_path_contract/spec.md`
- diff_anchor：`9b9df37746fa4cd3279a1db8c9cb27330e5d348f`
- target：`git diff 9b9df37746fa4cd3279a1db8c9cb27330e5d348f`
- round：1
- reviewed_at：2026-08-13 20:18 UTC+8
- reviewed_scope: 55baeeed2162efd8

## Findings

### t176_code_f001 - MCP schema 未拒 Windows 根相对路径（`\foo`）与 drive-relative（`C:foo`），输入边界校验有缝隙

- 严重度：minor
- 锚点：spec 范围「MCP schema 增加相对路径、禁止 `..`/绝对路径校验，错误在 tool 输入边界产生」未完全兑现；AC-004 仍满足（桥层兜底拒绝，安全无缺口）
- 位置：`src/mcp/schemas.ts:16`
- 问题：`output_path_schema` 的 refine 只拒绝 `/` 前缀与 `^[a-zA-Z]:[\\/]` 盘符绝对路径，未拒绝 Windows 根相对路径（如 `output_path: "\\etc\\x.json"`，即 `\` 开头）与 drive-relative（`C:x.json`，冒号后无分隔符）。在 Windows host 上这些是 rooted/驱动器相对路径，MCP 输入边界放行后由桥层 `safe_output_path` 的词法检查（`src/bridge/server.ts:893`，win32 `resolve` 后逃逸 base）以 400 拒绝——拒绝行为不变，但「错误在 tool 输入边界产生」的契约落在桥层而非 schema，与 spec 范围描述不一致。POSIX host 上 `\foo` 是合法相对文件名字符，无此问题；同一 commit 已把 `\` 当分隔符处理（`split(/[\\/]/)`），语义上自洽。
- 建议：refine 增补 `p.startsWith('\\')` 拒绝（与本文件已把 `\` 视为分隔符的语义一致）；drive-relative `C:x.json` 可一并拒绝或明确标注仅桥层兜底。若认为 POSIX 上 `\` 开头应作合法文件名，则在 schema 注释中显式记录该取舍。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 本轮新发现：1 条（均为 minor）。
- 未进表的提示：
  - **文件过大**：`src/bridge/server.ts` 1050 行（本 task 净增 +10），超过实现源码 400 行 minor 阈值；函数级代码增量小且改动局部，未观察到因过大导致的行为分叉，按降级规则不进 finding 表。`src/mcp/schemas.ts` 163 行、`docs/guides/mcp_usage.md` 增量 4 行，均未超阈值。
  - **复杂度**：`safe_output_path` 手算 CC ≈ 8（含新增 2 个分支），低于 10，不进表。
  - **范围外观察（test reviewer 职责）**：新增测试 `tests/unit/output_path_contract.test.ts:4` 的 `mkdir`、`writeFile` import 未被使用。
  - **范围外观察**：AC-004c 测试（`link/evil.txt`）实际命中 t137 既有 realpath 收敛拒绝（`server.ts:916`），未触达本 task 新增的 post-mkdir 校验（`server.ts:922-925`）；该校验只对 loop→mkdir 之间 TOCTOU 换链窗口生效，无法确定性构造用例，且 AC-004「防护不退化」已被该测试与 t137 全套验证，属合理覆盖。另 `server.ts:553-555` 与 `592-595` 双调 `safe_output_path` 为 t137 既有模式，t176 后 pre-flight 调用附带 mkdir 副作用（后续命令即使失败如 503 也会建目录），无害。
- 总体判断：AC-001~005 全部实现且行为正确；`safe_output_path` 创建前/后双向 containment + symlink 校验与 spec「风险与回退」一致，t137 防护未退化（absolute/`..`/symlink 逃逸测试全绿）。仅 1 条 minor，不阻断。
- 系统性 follow-up：无。

### AC 复验方式

- AC-001：re_verified。读 guide diff（`"exports/session-xxx.json"` 替换绝对路径示例）+ grep 确认全文无 `output_path` 绝对路径残留；测试断言 `output_path_contract.test.ts:32-34` 核对过。
- AC-002：re_verified。代码路径 `server.ts:891` mkdir(base) 先于 `:898` realpath(base)；实跑 `output_path_contract.test.ts` AC-002 用例通过。
- AC-003：re_verified。代码路径 `server.ts:921-925` 创建父目录后 realpath 再校验；实跑 AC-003 用例（`nested/deep/export.json`）通过。
- AC-004：re_verified。schema refine（schemas.ts:14-21）+ 桥层词法/收敛双检查（server.ts:893/916/922-925）；实跑 `t137_bridge_security.test.ts`（absolute/`..`/symlink 三项 HTTP 与函数级用例）与 AC-004a~d 全部通过。
- AC-005：re_verified。`npx vitest run tests/unit/output_path_contract.test.ts tests/unit/t137_bridge_security.test.ts tests/unit/export_large_fix.test.ts` 3 文件 38 测试全过，覆盖默认目录不存在、合法相对路径、嵌套目录、base 下 symlink 四类。

coverage = 5 / 5

verdict: PASS

## Round 2 (2026-08-13 20:20 UTC+8)

reviewed_scope: 763a349cce4b3e5e

前轮 finding 复核（以 `git diff 9b9df37746fa4cd3279a1db8c9cb27330e5d348f` 为准）：

- **t176_code_f001（minor，schema 未拒 Windows 根相对 `\foo` / drive-relative `C:foo`）— 已修**：`src/mcp/schemas.ts:16` refine 现为 `if (p.startsWith('/') || p.startsWith('\\') || /^[a-zA-Z]:/.test(p)) return false;`。`\` 前缀（Windows rooted 路径）与 `^[a-zA-Z]:`（含 `C:foo` 冒号后无分隔符的 drive-relative）均被拒绝；原 `/^[a-zA-Z]:[\\/]/` 已放宽覆盖 drive-relative，原 `C:\foo` / `C:/foo` 仍拒。`..` 组件检查（`:17`）未动。修复仅触及 refine 布尔条件，未改 schema 结构、错误消息与其它工具共享路径。

本轮新发现：0 条。

修复扫描：

- 合法相对路径不受影响：`exports/session-xxx.json`、`nested/deep/export.json` 均不以 `/`、`\` 开头、非盘符前缀、无 `..` 组件，仍通过；`npx vitest run tests/unit/output_path_contract.test.ts tests/unit/export_large_fix.test.ts` 24/24 通过（含 AC-004d 合法相对路径通过断言与 AC-001 指南断言）。
- 类型检查：`npx tsc --noEmit` 退出 0，无新错误。
- 取舍确认：POSIX 上 `X:foo`（单字母+冒号开头的合法文件名）与 `\` 开头文件名会被过拒，属跨平台防御取舍（schema 已把 `\` 视为分隔符，语义自洽），Round 1 建议已允许此处置。

未进表的提示：与 Round 1 结论段相同（server.ts 文件行数、新测试文件未用 import 等），本 diff 未引入新附注项。

总体判断：f001 按建议修复到位，合法相对路径不受影响，未引入新问题；当前无未解决 critical / important。

verdict: PASS
