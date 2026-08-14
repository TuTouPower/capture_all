# Task review t198（reviewer_focus: 代码）

- task：`t198_storage_export_boundaries`
- spec：`docs/tasks/t198_storage_export_boundaries/spec.md`
- diff_anchor：`87ad5a883819d82dfa48a8b7de7dba7f70941b18`
- target：`git diff 87ad5a883819d82dfa48a8b7de7dba7f70941b18`
- round：1
- reviewed_at：2026-08-14 05:05 UTC+8

## Findings

### t198_code_f001 - AC-002 测试的 `toBeGreaterThan(0)` 依赖 mock 数据序列化后 ≥512 字节

- 严重度：minor
- 锚点：AC-002 断言健壮性
- 位置：`tests/unit/exporter.test.ts:236`
- 问题：`expect(expected_kb).toBeGreaterThan(0)` 成立依赖 mock_capture + 默认 mock 数据的 `JSON.stringify(parsed)` 字节数 ≥512（`Math.round(x/1024) > 0` 的边界）。该断言与「total_size_kb 等于实际字节数」的正确性无关——若未来精简 mock 数据到 512B 以下，实现与测试的 round 结果同变（实现 total_size_kb 与回灌值一致），但此断言会无谓假红。当前数据满足（测试实测通过），属脆弱断言而非错误。
- 建议：去掉 `toBeGreaterThan(0)`，仅保留 `<span>${expected_kb} KB</span>` 一致性断言（已隐含 expected_kb 与实现同源）；或改用与 total_size_kb 语义无关的固定校验。

### t198_code_f002 - AC-001「NaN 视为全量」测试与 clamp-1 分支区分度不足

- 严重度：minor
- 锚点：AC-001 覆盖强度
- 位置：`tests/unit/storage_list_captures_limit.test.ts:66-69`
- 问题：测试仅造 1 条记录断言 `length === 1`。若实现误将 NaN 也 clamp 到 1（而非视为全量 undefined），测试同样通过——「全量」与「clamp 1」在此数据下不可区分，与测试名「NaN 视为全量」的意图有差距。实现本身正确（`!Number.isFinite(NaN)` → `undefined` 分支），此条仅覆盖弱点，非恒真断言。
- 建议：造 2 条记录后断言 `length === 2`，使「全量」与「clamp 1」可区分。

## 结论

- 本轮新发现：2 条（均为 minor）
- 未进表的提示：
  - 文件过大：`src/extension/background/storage.ts` 766 行（≥400 minor 阈值，本 task 净增 5 行），按降级规则不进 finding 表；本 task 增量小，无可观测缺陷。其余触及文件均未超阈值（body_capture_coordinator.ts 369、exporter.ts 469 但本 task 未改）。
  - 复杂度：无新增复杂分支；`convert_bridge_event_to_request` 为既有函数（B2-L5 相对时间修正已在 anchor 前存在），本 task 仅加 export 关键字与注释，未增分支。
  - 范围外观察：无。改动面严格限定于 limit 归一化（storage.ts 5 行）、函数导出（1 行）与补断言测试，无与 task 无关的模块改动。
- 总体判断：AC-001~AC-005 全部落实且全绿（203 文件 1916 测试通过），无未解决 blocking finding，仅有 2 条 minor 测试健壮性建议，PASS。
- AC 复验方式：
  - AC-001（re_verified）：读 `src/extension/background/storage.ts:211-215` 归一化表达式（`undefined/NaN/±Infinity → undefined 全量`，`Math.max(1, Math.floor(limit))` clamp/截断），并核对 4 条用例断言；实测 `storage_list_captures_limit.test.ts` 通过。调用方核对：MCP 路径 `get_optional_non_negative_int`（agent_command_dispatcher.ts:204）已拒绝负数/非整数，popup 传 10、dashboard 不传 limit，合法路径语义不变。
  - AC-002（re_verified）：读 `exporter.ts:157-159`，`total_size_kb = Math.round(TextEncoder(json_str).length/1024)`，与测试回灌公式同源等价；实测 `exporter.test.ts` 通过。
  - AC-003（re_verified）：读 `body_capture_coordinator.ts:335` `Math.max(0, evt.timestamp - start_time)`（anchor 前已有 B2-L5），3 条用例覆盖正常/回拨 clamp/相等边界；实测 `body_capture_bridge_relative_time.test.ts` 通过。
  - AC-004（re_verified）：读 `storage.ts:325-336` CATEGORY_STORE_MAP `dom_data → USER_ACTION_EVENTS` 与 `write_events` 路由、`get_events_by_category` 回读；实测 `storage_keyset.test.ts` 通过。
  - AC-005（re_verified）：完整 `vitest run` 203 文件 1916 测试全通过，无回归。
  - coverage = 5 / 5
- 系统性 follow-up：无。

reviewed_scope: 2ad8f61ac6077457

verdict: PASS

## Round 2 (2026-08-14 05:08 UTC+8)

### 前轮 finding 复核

- **t198_code_f001（minor，AC-002 `toBeGreaterThan(0)`）——已消除。** 当前 `tests/unit/exporter.test.ts:229-241`（`t198 AC-002: total_size_kb 为实际序列化字节数` 用例）已移除 `toBeGreaterThan(0)`，仅保留 `expect(result).toContain(\`<span>${expected_kb} KB</span>\`)` 一致性断言；`expected_kb` 由 `extract_embedded_json` 回灌数据 `TextEncoder().encode(JSON.stringify(parsed)).length/1024` 取 round，与实现 `exporter.ts:158` `Math.round(new TextEncoder().encode(json_str).length / 1024)` 同源等价（JSON.parse 保持键序，stringify 后与内嵌 `json_str` 逐字节一致；`escape_for_html_embed` 仅转义 `'`，提取侧解码还原）。fixture 另加非 ASCII（`capture_id: '测试采集'`、`中文标题 & <em>强调</em>`）锁定「字节数」口径——若生产回归为字符计数，期望值（字节）与展示值（字符数 round）不一致，用例变红。grep 全文已无 `toBeGreaterThan(0)`。注：AC-002 字面含「>0」，修复后不再显式断言 >0，但一致性断言同源覆盖（数据 <512B 时实现与期望同变，断言仍稳），不构成 AC 缺口。
- **t198_code_f002（minor，NaN 用例区分度）——已消除。** 当前 `tests/unit/storage_list_captures_limit.test.ts:65-69` NaN 用例造 2 条记录并断言 `expect((await list_captures(Number.NaN)).length).toBe(2)`，可区分「全量（2）」与「clamp 到 1（1）」，与测试名「NaN 视为全量（不返回空数组，非 clamp 到 1）」语义匹配；实现侧 `storage.ts:211-215` `!Number.isFinite(NaN)` → `safe_limit = undefined` 全量路径正确。

### 本轮新发现

- 0 条。自第 1 轮以来 diff 仅变动测试（AC-002 用例去掉脆弱断言 + fixture 加中文、NaN 用例改 2 条记录），生产代码未变；无修复引入的新问题。

## 结论

- 前轮 finding 复核：f001、f002 均已在当前 diff 中按建议消除（逐条见上），处置表「已修」属实，不依赖 implementer 自述。
- 本轮新发现：0 条。
- 未进表的提示：
  - 文件过大：`src/extension/background/storage.ts` 766 行（≥400 minor 阈值，本 task 净增 5 行，按降级规则不进 finding 表，无由过大引发的可观测缺陷）；`body_capture_coordinator.ts` 369、`exporter.ts` 469（本 task 未改）、`tests/unit/exporter.test.ts` 305、`storage_list_captures_limit.test.ts` 71 均未超阈值。
  - 复杂度：无新增分支；`convert_bridge_event_to_request` 仅加 `export` 关键字与注释，`safe_limit` 为单表达式归一化，CC 不升。
  - 范围外观察：无。改动面仍严格限定 limit 归一化、函数导出与补断言测试。
- 总体判断：2 条 minor 均已真修，全量 203 文件 1916 测试通过，无未解决 blocking finding，PASS。
- AC 复验方式：
  - AC-001（re_verified）：读 `storage.ts:211-215` 归一化表达式，核对 4 条用例（undefined 全量、正整数截断、负数/0 clamp 到 1 且倒序仍生效、小数向下取整、NaN 视为全量且 2 条记录可区分 clamp）；实测 `storage_list_captures_limit.test.ts` 4/4 通过。
  - AC-002（re_verified）：读 `exporter.ts:157-159` 与 `exporter.test.ts:229-241`，一致性断言与实现同源等价，中文 fixture 锁定字节语义；实测 `exporter.test.ts` 16/16 通过。
  - AC-003（re_verified）：读 `body_capture_coordinator.ts:335` `Math.max(0, evt.timestamp - start_time)` 与 3 条用例（正常 1500/回拨 clamp 0/相等 0）；实测 `body_capture_bridge_relative_time.test.ts` 3/3 通过。
  - AC-004（re_verified）：读 `storage.ts:325-336` CATEGORY_STORE_MAP 与 `storage_keyset.test.ts` dom_data 路由断言（`get_events_by_category` 回读 + `user_action_events` store 直查双路径）；实测 8/8 通过。
  - AC-005（re_verified）：完整 `npx vitest run` 203 文件 1916 测试全通过，无回归。
  - coverage = 5 / 5
- 系统性 follow-up：无。

reviewed_scope: 0635689bc9041d7e

verdict: PASS
