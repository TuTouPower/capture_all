# Task review t116（reviewer_focus: 测试）

- task：`t116_test_case_coverage_pack`
- spec：`docs/tasks/t116_test_case_coverage_pack/spec.md`
- diff_anchor：`b6c03aac4cd6cadcc91a6eaed739147f8941961e`
- target：`git diff b6c03aac4cd6cadcc91a6eaed739147f8941961e`
- round：1
- reviewed_at：2026-08-11 15:20 UTC+8

## Round 1

reviewed_scope: 950bfebe1d8cf9bc

## Findings

### t116_test_f001 - `handle_network_request` 导出未按上下文区 `_for_test` 命名约定

- 严重度：minor
- 锚点：spec 上下文区「测试策略」已批准决策「AC-013 若需导出 `handle_network_request`，导出须带 `_for_test` 命名约定」；契约区 AC-014 无命名要求，测试本身有效。
- 位置：`src/extension/background/service_worker.ts:882`
- 问题：`async function handle_network_request` 改为 `export async function handle_network_request`，导出无 `_for_test` 后缀；同 diff 中 `dashboard_detail.ts:728` 的测试钩子命名 `_render_dt_list_for_test` 符合约定，两处不一致。裸导出使 SW 模块公共面多出一个无下划线内部处理函数，可被误作公共 API 消费。无功能缺陷。
- 建议：若保留导出，按约定改名（如导出 `handle_network_request` 的同时保留内部名，或接受裸导出并在 `task.md` 处置表说明偏离理由）；不改名则属上下文区决策未执行，须在处置表标注。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：不适用（Round 1）
- 改测方向复核：无「迁就实现」的改测。既有断言改动两处，均为收紧/规范收敛且有归因：`service_worker_exception_sink.test.ts:148` `logs.some(...)===false` → `toHaveLength(0)`（p003 要求，更强断言，实现若误写 exception 到 console 即红）；`service_worker_exception_sink.test.ts:114` `errors[0].type` → `errors[0].error_name`（p004 要求收敛到 `RuntimeExceptionData` 已声明字段，`types.ts:410` 声明、`exception_capture.ts:139-140` 生产写入）。`cleanup_start_mutex.test.ts:84` `send_start` 加默认参为纯测试基础设施抽取，非断言改动。
- 本轮新发现：1 条（f001）
- 未进表的提示：
  - 危险模式「test 文件加 eslint-disable」调查：`content_postmessage_nonce.test.ts:315`（新增 AC-005）及全库既有 5 处 `// eslint-disable-next-line no-eval`（141/144/168 行既有、`websocket_capture_injected_script.test.ts:69`）——单行豁免仅禁 `no-eval` 规则，因 jsdom 不执行注入 script 而用 eval 模拟浏览器执行；eval 输入为测试可控的生产脚本字符串，eval 结果均有后续断言验证（AC-005 eval 后断言 window 变量、AC-004 捕获 nonce 后断言接受/拒绝）。不掩盖失败、不规避真实交互、不降低覆盖，按判据不出 finding。
  - `AC-002httpb` 的 `expect(m![1].length).toBeGreaterThan(0)`（`content_postmessage_nonce.test.ts:243`）非弱化：p014 要求即「证明 fallback nonce 非空」，且紧随的正向断言（`sender` 被调 1 次）证明该 nonce 真实可用，双重证据。
  - AC-012 用例用 `.value =` 程序赋值（`detail_search_preserve_input.test.ts:54`）：文本输入赋值与 `.fill()` 同类合法；且 spec AC-012 描述即为「补直接测试」，`filtered_events`（`dashboard_detail.ts:145`）实时读 DOM value 过滤，测试直达生产过滤逻辑。
  - `ws_absolute_time_wiring.test.ts` 与 `cleanup_start_mutex.test.ts` 的模块级 `vi.mock`（user_config/app_log_storage/keepalive/bridge_client、storage partial mock）均为系统边界，未 mock 被测逻辑本身。
- 总体判断：14 条 AC 全部有测试且断言触达生产实现，134 用例复跑全过，无未解决 critical / important，仅 1 条 minor 命名约定。
- 系统性 follow-up：无

### AC 复验方式

- AC-001（p002）：`re_verified`——重跑 `user_config_persistence.test.ts` 10 用例全过；NaN/Infinity 经 `sanitize_user_config`（`user_config.ts:414-419`）`Number.isInteger` 拒绝回退默认，250 恰为 `MIN_POLL_INTERVAL_MS`（`agent_bridge_config.ts:15`）保留，断言与生产一致。
- AC-002（p003）：`re_verified`——重跑 3 用例全过；`expect(logs).toHaveLength(0)` 经真实 `get_console_events` 存储读断言。
- AC-003（p004）：`re_verified`——`error_name` 为 `RuntimeExceptionData` 已声明字段，生产由 `exception_capture.ts` 写入。
- AC-004（p005）：`re_verified`——describe 级 `beforeEach` 调 `mock_chrome_debugger.reset()`（`service_worker_exception_sink.test.ts:81-83`），reset 语义（`chrome_debugger.ts:103-113` 清 listeners/状态）正确。
- AC-005（p008）：`re_verified`——`body_capture_external_poll_stop.test.ts:160-189`；与生产 `poll_once`/`poll_stopped`/`stop_poll`（`body_capture_coordinator.ts:234-267`）逐点对应：旧闭包 resolve 后 `poll_stopped` 拦截不写、重入清 timer 后单路新 poll，断言如拦截失效即红。
- AC-006（p009）：`re_verified`——har/17 字符/'JSON' 三用例；与 `server.ts:775` `/^[a-zA-Z0-9]{1,16}$/` + `toLowerCase()` 校验一致（har 合法、17 位超长回退 json、JSON 归一 json），断言 file_path 与生产扩展名决定一致。
- AC-007（p012）：`re_verified`——`content_postmessage_nonce.test.ts:258-298` 真实 `crypto.randomUUID`（不 stub）两次 start 捕获注入 nonce 断言不同，并补旧 nonce 失效/新 nonce 接受；`update_page_nonce` 每次 start 注入（`network_hook.ts:328`）。
- AC-008（p013）：`re_verified`——`content_postmessage_nonce.test.ts:300-317` start 经 `update_page_nonce` 生产写路径注入脚本，eval 后断言 `window.__capture_all_network_nonce__` 被写入。
- AC-009（p014）：`re_verified`——`content_postmessage_nonce.test.ts:228-256` 无 `crypto.randomUUID` 环境（`stubGlobal('crypto', {})`）下 fallback nonce 非空 + 该 nonce 被接收端接受。
- AC-010（p015）：`re_verified`——`network_hook_config_gate.test.ts:33-37` 静态计数 `start_network_hook(` 在 `start_capture` 段恰好 1 次；`start_network_hook` 在生产 `content_script.ts` start_capture 门控内单点调用。
- AC-011（p016）：`re_verified`——`cleanup_start_mutex.test.ts:150-179` cleanup 的 `storage.get` 挂起 → start 排队 → resolve 后 start 写入键保留、无 null 键；start handler 经 async `handle_message` 返回后 resolve（`service_worker.ts:205-206`），时序可信。
- AC-012（p022）：`re_verified`——`detail_search_preserve_input.test.ts:47-75` 设搜索词后 `render_dt_list` 输出仅含匹配项 + 计数文案；`filtered_events`（`dashboard_detail.ts:140-148`）读 DOM value 过滤，`event_title/detail` 对 `page_navigation` 输出 `data.to` URL，断言命中。
- AC-013（p024）：`re_verified`——三句分断言齐备：delete 被拒后 `get_capture` 非空（`storage_limit_active_delete.test.ts:104-107`）、`update_capture` 参数含 `ended_at`（:131-135）、`capture_stopped.data.reason === 'storage_limit'` 经真实库读（:157-162）。
- AC-014（p025）：`re_verified`——`ws_absolute_time_wiring.test.ts:99-143/145-188` 直连导出后的 `handle_network_request` 断言守卫两分支：`start_time_ms>0` 保留 epoch 且 `absolute_time` 不接线（与 `service_worker.ts:908-910` 守卫一致）、普通记录 `absolute_time = started_at + relative_time_ms` 精确断言。

coverage = 14 / 14

verdict: PASS

## Round 2 (2026-08-11 15:30 UTC+8)

reviewed_scope: 4fa041b3599aaea5

### 前轮 finding 复核

- **t116_test_f001（= t116_code_f001，同一 finding）：已消除。** diff 核实：`src/extension/background/service_worker.ts:883` 由裸 `export async function handle_network_request` 改为别名导出 `export { handle_network_request as _handle_network_request_for_test }`，保留内部名 `handle_network_request`、公共面命名符合上下文区「测试策略」`_for_test` 约定；测试 `ws_absolute_time_wiring.test.ts:112,159` 两处 import 解构同步改为 `{ _handle_network_request_for_test: handle_network_request }`，后续 `await handle_network_request(...)` 调用不变，仍直连生产守卫逻辑。命名与全库既有测试钩子（`_render_dt_list_for_test`、`_set_nonce_for_test`、`_base64_decoded_size_for_test` 等）一致。

### 本轮新发现

无新 finding。

### 改测方向复核

本轮测试改动仅 import 引用随导出改名同步（`ws_absolute_time_wiring.test.ts:112,159`），属接口改名必需，非「迁就实现」。AC-001/AC-014 断言语义未动。

### AC 复验方式（本轮范围）

- AC-014（p025）：`re_verified`——重跑 `ws_absolute_time_wiring.test.ts` 2 用例全过，别名导出下守卫两分支断言与 Round 1 一致（`start_time_ms>0` 保留 epoch 不接线、普通记录 `absolute_time = started_at + relative_time_ms`）。
- 其余 AC：Round 1 已逐条复验（见上），本轮仅导出形式与 import 引用变化，不改变断言语义，不重复复验。

coverage = 14 / 14

### 结论

- 前轮 finding 复核：t116_test_f001 已消除（以 diff 与代码为准，非采信处置表）
- 改测方向复核：无
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：f001 修复彻底，无未解决 critical / important，仅 Round 1 遗留 0 minor
- 系统性 follow-up：无

verdict: PASS

## Round 3 (2026-08-11 15:41 UTC+8)

reviewed_scope: d9d84e070ee3ed92

### 前轮 finding 复核

- **t116_test_f001（= t116_code_f001）：保持已消除。** Round 2 后 src/tests 零改动——全量 mtime ≤ 2026-08-11 15:22（Round 2 审阅 15:30 之前），别名导出 `_handle_network_request_for_test`（`service_worker.ts:883`）与测试 import 引用（`ws_absolute_time_wiring.test.ts:112,159`）均无后续变更；当前指纹 d9d84e070ee3ed92 与 prompt 注入一致，无回归来源。

### 本轮新发现

无新 finding。

### 收尾文档核对（终审范围）

- `docs/specs/test_case_coverage_pack.md`（新增，2026-08-11 15:32）：AC-001~014 与 spec 契约区逐条对照一致——含 AC-005 重入变体语义、AC-013 三条分句齐全、AC-014 守卫表达式（`start_time_ms > 0` 不被覆盖）语义等价；可测试性声明一致；额外「测试钩子约定」节（`_for_test` 命名）与上下文区「测试策略」及 Round 2 f001 修复方向一致，无新增行为承诺。
- `docs/specs_index.md` 登记行：`| test_case_coverage_pack | t116 | 2026-08-11 |`，位于 t109 之后，格式与既有行一致。
- 指纹复算：按 `check_review_status.py` 同口径执行 `git diff --binary b6c03aac4cd6cadcc91a6eaed739147f8941961e`（排除 task.md / review_*.md / handoff.json / docs/pending / docs/findings / docs/archive / tasks_index / docs/spikes / .scratch），SHA1 前 16 位 = `d9d84e070ee3ed92`，与 prompt 注入值一致——自渲染后无非流程文件改动。

### 改测方向复核

无（Round 2 后无任何代码/测试改动）。

### AC 复验方式（本轮范围）

- AC-001~014 收尾文档一致性：`re_verified`——逐条对照 prompt 注入契约区与 `docs/specs/test_case_coverage_pack.md`，14 条编号、语义一一对应。
- 测试状态：`re_verified`——复跑 t116 相关 10 测试文件 134 用例全过（vitest 2026-08-11 15:40，与 Round 1 记录一致）；src 零改动故 tsc 结论无来源变化。
- AC 行为层证据沿用 Round 1 逐条独立复验（重跑命令 + 断言查证）与 Round 2 AC-014 复验；代码零改动（指纹 + mtime 双证）使前轮 re_verified 结论保持有效。

coverage = 14 / 14

### 结论

- 前轮 finding 复核：t116_test_f001 保持已消除（无新改动，无回归来源，以 diff 与 mtime 为准）
- 改测方向复核：无
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：终审无未解决 critical / important / minor；收尾文档与 spec/实现一致，Round 1/2 结论全部保持
- 系统性 follow-up：无

verdict: PASS
