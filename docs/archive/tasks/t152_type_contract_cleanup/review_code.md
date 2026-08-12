# Task review t152（reviewer_focus: 代码）

- task：`t152_type_contract_cleanup`
- spec：`docs/tasks/t152_type_contract_cleanup/spec.md`
- diff_anchor：`a5d21b1d8615f445993a1d1f73192d6aab8f6f5d`
- target：`git diff a5d21b1d8615f445993a1d1f73192d6aab8f6f5d`
- round：1
- reviewed_at：2026-08-13 11:20 UTC+8
- reviewed_scope: ecb9b704c82e25d0

## Findings

### t152_code_f001 - AC-004 把 storage payload 移入 event.data，但 agent 查询 storage_changes 仍读顶层字段，产出误导记录

- 严重度：important
- 锚点：AC-004 行为差距（payload 契约变更后消费端读不到 `key` 等字段）+ 可观测行为缺陷（agent 查询 storage 源返回 undefined 字段）
- 位置：`src/extension/content/storage_capture.ts:194`（`state.sender?.(base, data)`）、`src/extension/content/websocket_capture.ts:230`（同）；`src/extension/background/agent_data_queries.ts:259`、`:289`、`:323`
- 问题：改动前 storage_change 事件以 `{ ...base, ...data }` 顶层落库，`agent_data_queries` 的 `get_record_type` / `get_record_summary` / `get_record_preview`（storage_changes 分支）读 `record.action` / `record.storage_type` / `record.key` / `record.origin` / `record.value_status` 均取到真值。AC-004 改为 `sender(base, data)`，经 `content_script.ts` `send_event` 合并成 `{ ...event, data }`，SW `handle_event` 原样经 `write_events` 落库，store 记录变为 `event.data` 嵌套形。`agent_data_queries` 三处 storage 分支未同步改为读 `(record as CaptureEvent).data`，仍读顶层字段。失败场景：`list_records(source='storage_changes')` / `get_record` / timeline 中 storage 记录的 summary 变成 `"undefined.undefined *"`，preview 三字段全 `undefined`，`list_data_sources` 的 storage types 序列化为 `[null]`。与 AC-003 为 network 消除的「agent 查询误导记录」同类，storage 现在也出现该问题，且为本次改动引入（改动前顶层字段可读）。
- 建议：`agent_data_queries.ts` storage_changes 三处（type/summary/preview）改为从 `event.data`（`record.data`）读取 `StorageChangeData` 字段；或引入与 `is_event_record` 对称的归一化读取。同时补一条 agent 查询 storage 源的断言测试（现有 `tests/unit/agent_data_queries.test.ts` 的 storage fixture 仍是顶层形，与真实落库形不符，未覆盖该回归）。

### t152_code_f002 - ws_message 事件 payload 移入 event.data 后，agent 查询 summary/preview 的 url 恒为空

- 严重度：minor
- 锚点：AC-004 连带（payload 移动后 ws 事件关键字段不再在顶层）；AC-003 路由分支读取位置
- 位置：`src/extension/background/agent_data_queries.ts:275-277`（`get_record_summary` network 事件分支）、`:308-311`（`get_record_preview` network 事件分支）
- 问题：`websocket_capture.ts` 的 base 事件不设 `url`（`create_base_event` 默认 `url: ''`），ws_url 只在 `data.ws_url`。AC-004 后 payload 入 `event.data`，`get_record_summary` 对 ws 事件返回 `"${event.type} ${event.url}"` = `"ws_message "`（尾随空），`get_record_preview` 的 `url` 恒为 `''`，agent 在 list_records 层面看不到 ws 地址。`tests/unit/t152_network_ws_type_route.test.ts` fixture 手工给事件加了 `url: 'wss://x'`，与真实落库形（url=''）不符，掩盖该缺口。
- 建议：network 事件分支对 `ws_frame`/`ws_message` 从 `event.data.ws_url` 读取 url 作为 summary/preview 来源。

## 结论

- 前轮 finding 复核：无（Round 1）。
- 本轮新发现：2 条（f001 important、f002 minor）。
- 未进表的提示：
  - 文件过大（按降级规则只列不进表，本 task 净增均 ≤7 行，未「继续堆大」）：`src/extension/background/service_worker.ts` 1258 行、`src/extension/dashboard/dashboard_detail.ts` 797 行、`src/extension/shared/i18n.ts` 828 行。
  - 范围外观察（不进 finding 表）：`src/bridge/cdp_handler.ts:206` session_key、`src/shared/logger.ts:153` log id、`src/extension/content/content_nonce.ts:11` nonce 仍用 `Math.random`，与 AC-007 已统一的一类碰撞隐患，但不在 AC-007 列出的文件范围；`agent_data_queries` cookie_changes 分支读顶层 `cause`/`domain`/`name` 亦为 undefined，但该问题在本次改动前已存在（cookie 事件历来以 `{...base, data}` 落库），非本 task 引入。
  - 复杂度：未发现本 task 新增函数达圈复杂度阈值。
- 总体判断：AC-001/002/003/005/006/007/008/009 实现正确、范围内无偏航；AC-004 引入 storage agent 查询回归（f001），为未解决 important，blocking。
- 系统性 follow-up：建议标题「统一剩余 Math.random id 生成位点（bridge session_key / logger / content_nonce）」，slug `unify_remaining_random_id_sites`，阻断性普通（非 blocking，可在后续 task 处理）。

### AC 复验方式

- AC-001 `re_verified`：`src/` 无残留 `'absolute'`；`DetailTimeDisplayMode` 为 `'relative' | 'system'`（types.ts:668）；sanitize 值域与设置页 seg 一致；`user_config_persistence.test.ts` 断言非法值回退默认。
- AC-002 `re_verified`：`set_locale` 不再写独立 `locale` key（i18n.ts:791）；`init_locale` 从 `user_config.locale` 恢复并显式校验 `en|zh`（i18n.ts:795）；设置页 select 值域 `zh|en` + `set_locale`/`persist` 双写（dashboard_settings.ts:196）；`i18n_locale_single_source.test.ts` 往返断言。
- AC-003 `re_verified`：`NetworkRequestData` 无 `type` 字段（types.ts:323-368），`normalize_network_request` 不注入 `type`（service_worker.ts:920），`'type' in record` 判别可靠；ws_frame 经 `event.data` 落 NETWORK_REQUESTS store（CATEGORY_STORE_MAP network→NETWORK_REQUESTS），按 type 路由三处分支均已覆盖。
- AC-004 `re_verified`：storage/ws 均改为 `sender(base, data)`→`{...base, data}`；dashboard `event_detail`/`event_title`/`merge_detail_events` 读 `e.data` 正常；exporter 原样序列化。**发现 f001（agent storage 查询回归）**。
- AC-005 `re_verified`：`dashboard_detail.ts` net 表读 `relative_time`、console 表读 `relative_time_ms`（:329/:385），fallback `+00.000s`；`t152_detail_time_columns.test.ts` 断言真实值显示。
- AC-006 `re_verified`：`event_kind` 全 9 类 CategoryKey 映射完备（dashboard_shared.ts:149-160），KIND 含全部 9 key；ws/clipboard/form/visibility 归入正确类别，capture_lifecycle 仍为 capture；`t152_event_kind_alignment.test.ts` 全类别断言。
- AC-007 `re_verified`：`generate_unique_suffix` 统一 crypto.randomUUID（id.ts:8），capture_id/event_id 保留原结构，`get_native_record_id` 追加稳定指纹消除同 (sort_key, absolute_time) 碰撞（agent_data_queries.ts:236-238）；`t152_id_unification.test.ts` 断言唯一性/确定性。
- AC-008 `re_verified`：顶层工具 schema `strict`、嵌套 config `strip`（schemas.ts）；`src/mcp/main.ts` 为唯一消费点（外部 MCP 客户端），bridge 不使用这些 schema，无内部误拒路径；MCP 工具定义由 schema 派生，合法客户端只发声明字段，strict 不误拒；`mcp_schema.test.ts` 断言拒绝未知字段。
- AC-009 `re_verified`：`get_relative_time` 返回 `Math.max(0, now - start)`（event_utils.ts:29）；`t152_relative_time_clamp.test.ts` 覆盖回拨/相等场景。
- AC-010 `re_verified`：storage/ws/user_config/mcp 既有测试均已按新契约更新为行为断言（非改预期迁就）；未发现旧测试被就地改期望。

coverage = 10 / 10

verdict: FAIL

## Round 2 (2026-08-13 02:10 UTC+8)

- reviewed_scope: ecb9b704c82e25d0

本轮复核方式：`npx tsc --noEmit`（exit 0）、`npx vitest run` 全量 148 files / 1520 tests 全通过；逐条对照修复后 `git diff a5d21b1` 的 `src/extension/background/agent_data_queries.ts` 与新增回归测试。

### 前轮 finding 复核

- t152_code_f001（important）**已消除**：storage_changes 三处分支（`agent_data_queries.ts:252-257` type、`:295-298` summary、`:330-333` preview）均改从 `(record as CaptureEvent).data` 读 `StorageChangeData`；回归测试 `tests/unit/agent_data_queries.test.ts:310-329` 以嵌套 data 落库形真实断言 type='set'、summary='local.set theme'、preview 三字段。与真实落库形一致，已覆盖。
- t152_code_f002（minor）**修不彻底，仍存在**：`get_record_summary` network 事件分支已修（`agent_data_queries.ts:278-280` 读 `data.ws_url` 并 fallback `event.url`），但 `get_record_preview` network 事件分支（`:316-319`）仍返回 `{ url: event.url, tab_id, frame_id }`，ws 事件 base 的 `url=''`（`websocket_capture.ts` base 未传 url），preview.url 恒空。`tests/unit/t152_network_ws_type_route.test.ts:26/36/44` 的 ws fixture 仍手工给顶层 `url: 'wss://x'`，与真实落库形（url=''）不符，恰好让 `expect(rec.preview.url).toBe('wss://x')`（:49）通过，掩盖 preview 缺口。

### 本轮新发现

### t152_code_f003 - storage_changes 分支读 event.data 无存在性防护，改动前顶层形旧记录触发 TypeError 崩溃

- 严重度：minor
- 锚点：行为缺陷（agent 查询旧 capture storage 源崩溃）+ f001 修复引入的读取路径
- 位置：`src/extension/background/agent_data_queries.ts:253-256`（type）、`:295-298`（summary）、`:330-333`（preview）
- 问题：三处均 `const sd = (record as CaptureEvent).data as unknown as StorageChangeData; return sd.action/...`，无 data 存在性判断。AC-004 改动前采集的 storage 事件以 `{ ...base, ...data }` 顶层展开落库，无 `data` 键；扩展升级后旧 capture 记录仍留在 IndexedDB，agent 查询（`list_data_sources` / `list_records` / timeline）走到 storage 分支时 `sd` 为 undefined，`sd.action` 抛 TypeError，整次查询失败。改动前旧记录顶层字段可读，本修复让旧数据路径从「读得到值」退化为「崩溃」。
- 建议：三处对 `event.data` 做存在性 fallback（如 `const sd = ((record as CaptureEvent).data ?? record) as unknown as StorageChangeData`，或 `const data = event.data as ... | undefined; if (!data) return fallback;`），兼容两种落库形。

## 结论（Round 2）

- 前轮 finding 复核：f001 已消除；f002 修不彻底（summary 已修、preview 未修，测试 fixture 仍掩盖）。
- 本轮新发现：1 条（f003 minor）。
- 未进表的提示：无新增文件过大/复杂度项。
- 总体判断：f001（唯一 important）已按 diff 与测试核实修复；剩余 f002 部分 + f003 均为 minor，不阻断。tsc 与全量测试独立复验通过。
- 系统性 follow-up：沿用 Round 1 建议（`unify_remaining_random_id_sites`），无新增。

verdict: PASS

## Round 3 (2026-08-13 02:15 UTC+8)

- reviewed_scope: ecb9b704c82e25d0

本轮复核方式：`npx tsc --noEmit`（exit 0）、`npx vitest run` 全量 148 files / 1520 tests 全通过；对照修复后 `git diff a5d21b1` 的 `src/extension/background/agent_data_queries.ts` 与测试现状。

### 前轮 finding 复核

- t152_code_f002（minor）**代码已修**：`get_record_preview` network 事件分支已改为 `return { url: ws_url ?? event.url, ... }`，`ws_url = (event.data as { ws_url?: string } | null)?.ws_url`（`agent_data_queries.ts:316-320`）。`WsMessageData.ws_url` 字段名核实一致（types.ts:244），逻辑正确。
- t152_code_f003（minor）**代码已修**：storage_changes 三处分支均改为 `((record as CaptureEvent).data ?? record) as unknown as StorageChangeData`（`:252-256` type、`:295-298` summary、`:330-333` preview）。旧顶层形记录 `data` 为 undefined/null → fallback 读 record 自身，与新嵌套形、旧顶层形两种落库形均兼容，防旧 capture 查询崩溃。

### 本轮新发现

### t152_code_f004 - f002/f003 修复缺针对性测试覆盖：ws 路由 fixture 仍顶层 url 掩盖 data.ws_url 分支；旧顶层形 storage 记录无回归测试

- 严重度：minor
- 锚点：测试覆盖缺口（f002/f003 的修复行为未被测试真正验证）
- 位置：`tests/unit/t152_network_ws_type_route.test.ts:26/36/44`（ws fixture 顶层 `url: 'wss://x'` 且无 `data` 字段）；`tests/unit/agent_data_queries.test.ts:310-329`（storage 回归测试仅嵌套 data 形）
- 问题：（1）f002 修复后，`t152_network_ws_type_route.test.ts` 的 `preview.url === 'wss://x'` 断言（:49）走的是 `event.url` fallback 分支——fixture 顶层 url 恒 'wss://x' 且无 data 键。真实落库 ws 事件 url=''，读取依赖 `data.ws_url`；若该分支 key 写错，测试仍绿。f002 修复未真正被验证。（2）f003 修复后，storage 回归测试只覆盖新嵌套 data 形（:319），未覆盖「旧顶层形记录（无 data 键）」fallback 路径，防崩溃行为无测试佐证。
- 建议：ws fixture 改为真实落库形（顶层 `url: ''` + `data: { ws_url: 'wss://x', ... }`）使断言落到 data.ws_url 分支；storage 补一条旧顶层形记录（顶层 `action/storage_type/key`、无 data）断言 type/summary/preview 正常且不抛。

## 结论（Round 3）

- 前轮 finding 复核：f002、f003 代码均按 diff 核实修复（f002 preview 读 data.ws_url；f003 storage 旧形 fallback）。tsc 与全量测试独立复验通过。
- 本轮新发现：1 条（f004 minor，测试覆盖缺口）。
- 未进表的提示：无新增文件过大/复杂度项。
- 总体判断：所有 prior important/minor 的代码问题已消除；剩余 f004 为测试覆盖缺口（minor），不阻断。AC-001~010 契约清理目标全部达成。
- 系统性 follow-up：沿用 Round 1 建议（`unify_remaining_random_id_sites`），无新增。

verdict: PASS

## Round 4 (2026-08-13 02:20 UTC+8)

- reviewed_scope: a75264927f84aca4

本轮复核方式：f004 修复后 diff 已变（`git diff a5d21b1` 指纹从 `ecb9b704c82e25d0` 更新为 `a75264927f84aca4`，check_review_status.py 重算同值）。独立复验：`npx tsc --noEmit` exit 0；`npx vitest run` 全量 148 files / 1522 tests 全通过（较上轮新增 2 用例）。

### 前轮 finding 复核

- t152_code_f004（minor）**已消除**：
  1. `tests/unit/t152_network_ws_type_route.test.ts:42-51` 新增「ws_message 真实落库形」用例——fixture 顶层 `url: ''` + `data: { ws_url: 'wss://real.example/ws', direction: 'sent' }`，断言 `summary` 含真实 ws_url、`preview.url === 'wss://real.example/ws'`，真正落到 `data.ws_url` 分支（此前测试走 event.url fallback 掩盖缺口）。
  2. `tests/unit/agent_data_queries.test.ts:331-345` 新增「旧顶层形 storage 记录 fallback」用例——无 `data` 键的顶层形 fixture，断言 `type='remove'`、`summary='session.remove auth'` 且不抛，覆盖 `(record.data ?? record)` 旧数据兼容路径。
  - 两条用例均锚定 f002/f003 修复的具体分支，非表面断言。

### 本轮新发现

无。

## 结论（Round 4）

- 前轮 finding 复核：f004 已按 diff 与测试核实消除（ws 真实落库形 + storage 旧形 fallback 两条针对性用例）。tsc 与全量测试独立复验通过。
- 本轮新发现：0 条。
- 未进表的提示：无新增文件过大/复杂度项。
- 总体判断：全部 finding（f001~f004）已闭环；AC-001~010 契约清理目标达成。当前 diff 指纹 `a75264927f84aca4` 已回写。
- 系统性 follow-up：沿用 Round 1 建议（`unify_remaining_random_id_sites`），无新增。

verdict: PASS
