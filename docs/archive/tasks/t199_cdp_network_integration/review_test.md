# Task review t199（reviewer_focus: 测试）

- task：`t199_cdp_network_integration`
- spec：`docs/tasks/t199_cdp_network_integration/spec.md`
- diff_anchor：`a71525cb14ab623b07bb3da5e7720057e4c37bd8`
- target：`git diff a71525cb14ab623b07bb3da5e7720057e4c37bd8`
- round：1
- reviewed_at：2026-08-14 05:24 UTC+8

## Findings

无。

（0 finding。全部 AC 经独立复验，危险模式扫描无命中，见下。）

## 结论

- 前轮 finding 复核：第 1 轮，无。
- 改测方向复核：无。diff 未修改任何既有测试断言——`cdp_body_budget_accounting.test.ts` 仅追加 1 用例，`cdp_network_redaction_integration.test.ts` 为新建；无「迁就实现」改测。
- 本轮新发现：0 条。
- 未进表的提示：
  - AC-001 用例中 body 预算超限淘汰走 `splice`（已终态带 body 事件，见 `src/bridge/cdp_handler.ts:142`），不产生 `evicted` 终态；`evicted` 是事件数上限淘汰 pending 时的终态，已由 t157 既有 AC-005/AC-005b 用例（`tests/unit/cdp_body_budget_accounting.test.ts:237,262`）完整覆盖。AC-001 字面「含 evicted 终态」跨用例覆盖成立，非本用例缺口。
  - AC-002 正常路径用例与既有 network_cdp 事件流用例场景重叠，但断言侧重不同（.catch 位点无副作用 vs 事件字段映射），保留合理。
  - AC-003 true 用例传入 `inline_text_max_bytes: 32768`，而 `redact_body` 签名 `_max_preview_bytes` 当前未引用（`src/shared/body_redaction.ts:85`）——测试传参无害，实现侧未用参数属 code review 范畴，不进表。
- 总体判断：AC-001~004 全部有测试且经反向性验证非假绿；无未解决 critical / important，无 minor。
- 系统性 follow-up：无。

### AC 复验方式

- AC-001：`re_verified`。重跑 `cdp_body_budget_accounting.test.ts` 8 用例全绿（含 t199 新增用例）；逐行核对 `enforce_body_budget`（`src/bridge/cdp_handler.ts:125-147`）淘汰语义与用例中间态断言一致（r1/r2 各 200B 连续触发两次 400>300 淘汰、幸存 r3 账本 200、poll 后归零）；走真实 MockWebSocket 事件流 + getResponseBody 命令回写（`emit_completed_with_body` → 生产 `body_seq_to_req_id` 映射 → `handle_cdp_events` 真实 /cdp/events 接口）。
- AC-002：`re_verified`。反向性探针实测：临时删除生产 `.catch`（`src/extension/background/service_worker.ts:989`）后 vitest 捕获 1 个 unhandled rejection、4/4 用例红；恢复后复绿。spy 路径读码确认：`check_storage_limit` mockRejectedValue → `check_limit_and_stop` reject（:1040）→ `handle_network_request` reject（:1056）→ `.catch` 真实捕获；用例另断言 `limit_spy` 被调用与 `logger.error('handle_cdp_body_event failed')` 经 transport 写出，防「mock 了没用上」假绿。
- AC-003：`re_verified`。反向性探针实测：临时移除 `redact_body` 调用（:1092）后 redact_data=true 用例红（断言失败信息 `expected '{"password":"s3cret","user":"alice"}' to contain '[REDACTED]'`）；恢复后复绿。断言组合「`toContain('[REDACTED]')` + `not.toContain('s3cret'/'abc123')` + 非敏感键 'alice' 保留」验证 redact_body 真实调用与脱敏语义，非仅 not.toContain 弱断言。
- AC-004：`re_verified`。重跑 CDP/网络/service_worker 相关 16 个测试文件 196 用例全绿（`cdp_body_budget_accounting` 8 + `cdp_network_redaction_integration` 4 + `network_cdp` 21 + 其余 13 文件 163）；生产改动仅新增 `_handle_cdp_body_event_for_test` 导出（:1051，与 p025 既有测试钩子模式一致），零行为影响。

coverage = 4 / 4

### 危险模式扫描记录

- 恒真断言 / 删除反转 expect / 注释断言 / 弱化断言 / 删测试 / `.skip`/`.only` / `@ts-ignore` 类 / 条件跳过 / 阈值掩盖：均未命中（逐文件读码确认，`cdp_network_redaction_integration.test.ts` 4 用例 + `cdp_body_budget_accounting.test.ts` 新增用例）。
- mock 误用：AC-002 spy `check_storage_limit` 属存储限额边界（模拟存储故障制造错误路径，正当）；AC-001 mock WebSocket/fetch 为系统边界；AC-003 无 mock；`_get_session_for_test`/`_set_max_session_body_bytes_for_test` 为 t157 既有测试钩子（项目约定模式），非 mock 被测逻辑。
- 存在即通过：`expect(req).toBeDefined()` 均为中间步骤，其后必跟具体值断言（response_body / capture_method / 脱敏内容 / 账本字节数）。
- 异步时序：`wait_flush` 30ms 后断言的是微任务链（rejected promise 传播），反向性探针已证明对 `.catch` 缺失敏感，无 timeout 掩盖。

reviewed_scope: bf89180dc7a7fa38

verdict: PASS

## Round 2 (2026-08-14 05:31 UTC+8)

第 2 轮重审。自第 1 轮后测试文件**零变化**（git diff 确认：`cdp_body_budget_accounting.test.ts` 相对 anchor 仍仅追加 1 用例，`cdp_network_redaction_integration.test.ts` 仍为新建 4 用例）；spec.md 仅 AC-001 措辞修订 + 上下文区新增过时标注一行（code reviewer t199_code_f001 处置）；service_worker.ts 仅第 1 轮已审的 `_handle_cdp_body_event_for_test` 导出行，无新增。

### 契约区 drift 核对

- AC-001 措辞变更（「含 evicted 终态」→「splice 删除，无 evicted 终态；evicted 属事件数淘汰路径，由 t157 AC-005 覆盖」）：**非未经确认的需求变更**。系 code reviewer 标注的 spec 过时处置（`docs/tasks/t199_cdp_network_integration/spec.md` 上下文区已注明来源 t199_code_f001）；且测试内容未变——AC-001 用例从未断言 evicted 终态（断言集为幸存事件列表 / body_bytes 账本 / poll 后归零），新措辞只是把测试实际验证的行为写准确。不构成 blocking。
- 第 1 轮指纹 bf89180dc7a7fa38 因 spec.md 计入指纹且措辞已改而失效（脚本复核 `review_scope=stale`），本轮按新指纹重审（见文末）。

### Findings

无（0 finding）。

### 前轮 finding 复核（Round 2）

- 第 1 轮 0 finding，无逐条复核项；第 1 轮 verdict PASS 的前提（测试内容、生产代码位点）经 diff 比对未变化，判定保持。

### 改测方向复核

无。本轮 diff 未修改任何既有测试断言——`cdp_body_budget_accounting.test.ts` 仅追加用例，无删除/反转/弱化；spec 措辞修订是「把 spec 写成与实现一致」，测试方向未迁就实现（测试本就不测 evicted 终态）。

### 本轮新发现

0 条。

### 未进表的提示

无。第 1 轮已提示的 `inline_text_max_bytes` 未被 `redact_body` 引用属 code review 范畴，本轮不重复。

### 总体判断

AC-001~004 全部有测试且经本轮重跑验证全绿，危险模式扫描无命中；无未解决 critical / important，无 minor。

### 系统性 follow-up

无。

### AC 复验方式（Round 2 重跑）

- AC-001：`re_verified`。本轮重跑 `cdp_body_budget_accounting.test.ts` 8 用例全绿；新增用例运行日志显示真实触发两次 `cdp_event_evicted`（`reason: body_budget_cap`，`body_bytes: 200`），证明走真实 getResponseBody 回写 → `session.body_bytes +=` → `enforce_body_budget` splice 淘汰（`src/bridge/cdp_handler.ts:513,142`）。断言中间态（`['r3']`、200B 账本）+ poll 后归零 + 幸存事件完整返回均与生产语义一致。
- AC-002：`re_verified`。本轮重跑 `cdp_network_redaction_integration.test.ts` 错误路径用例通过；读码确认链路：`check_storage_limit` mockRejectedValue → `check_limit_and_stop` reject（`service_worker.ts:1040`）→ `handle_network_request` reject（:1056）→ `.catch` 真实捕获（:989-991）；断言 `limit_spy` 调用 + `log_write` 写出 `handle_cdp_body_event failed`（该日志只可能出自 `.catch` 分支，与 timing 无关），非假绿。
- AC-003：`re_verified`。本轮重跑 2 用例通过；读码确认 redact_data 分支真实调用 `redact_body`（`service_worker.ts:1089-1104`），落库后经 `get_network_requests` 查询验证（`[REDACTED]` 替换 + 敏感值缺失 + 非敏感键 'alice' 保留 + false 反例原样落库）。
- AC-004：`re_verified`。本轮重跑：t199 两文件 12/12；CDP/网络/存储回归 7 文件 138/138（含 network_cdp 21）；全量 unit 204 文件 1921 用例全绿。

coverage = 4 / 4

### 危险模式扫描记录（Round 2）

- 恒真断言 / 删除反转 expect / 注释断言 / 弱化断言 / 删测试 / `.skip`/`.only` / `@ts-ignore` 类 / 条件跳过 / 阈值掩盖 / `.value=` 替代交互 / 存在即通过：均未命中（逐文件重读 12 用例确认）。AC-003 `toContain('[REDACTED]')` + `not.toContain(敏感值)` + 非敏感键保留组合可区分「整体替换」与「key 级脱敏」，非弱化。
- mock 误用：AC-002 spy `check_storage_limit` 为存储限额系统边界（制造错误路径），非 mock 被测逻辑；AC-001 mock WebSocket/fetch 为系统边界；`_handle_*_for_test` 为直接导出生产函数调用（项目既有 p025 模式），非 mock。
- 异步时序：`wait_flush` 30ms 后断言的错误日志写出来自 `.catch` 分支、`limit_spy` 调用在 rejection 传播链内（微任务先于 timer 完成），无 timeout 掩盖。

reviewed_scope: ec87337184e0e843

verdict: PASS
