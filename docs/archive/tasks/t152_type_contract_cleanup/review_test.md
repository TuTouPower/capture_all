# Task review t152（reviewer_focus: 测试）

- task：`t152_type_contract_cleanup`
- spec：`docs/tasks/t152_type_contract_cleanup/spec.md`
- diff_anchor：`a5d21b1d8615f445993a1d1f73192d6aab8f6f5d`
- target：`git diff a5d21b1d8615f445993a1d1f73192d6aab8f6f5d`
- round：1
- reviewed_at：2026-08-13 02:11 UTC+8

## Findings

### t152_test_f001 - agent_data_queries 测试中 end_time/order 两属性被挤成一行（格式噪声）

- 严重度：minor
- 锚点：无行为影响，纯 diff 噪声
- 位置：`tests/unit/agent_data_queries.test.ts:234`
- 问题：`get_timeline_from_capture_data` 的查询对象原为
  `end_time: 30,` 与 `order: 'desc'` 两行，改动后成一行 `end_time: 30,            order: 'desc'`（中间大段空格）。语义完全等价，但属与任务无关的顺手改动，且引入不整洁空白，与「精准修改」原则相悖。
- 建议：还原为两行原样，或至少规整为单行 `end_time: 30, order: 'desc'`。

### t152_test_f002 - ws_message 查询 summary 读 `event.data.ws_url` 分支无查询级测试

- 严重度：minor
- 锚点：AC-004 部分分支（network_requests store 内 ws 事件 summary 从 data.ws_url 取 url）
- 位置：`tests/unit/t152_network_ws_type_route.test.ts:42`（test 3）；对应生产 `src/extension/background/agent_data_queries.ts` `get_record_summary` network_requests 分支
- 问题：真实 ws 事件 base url 恒为 `''`（`create_base_event` 默认 `url: params.url ?? ''`，websocket_capture 未传 url），ws_url 只在 `event.data`。`get_record_summary` 的 `const ws_url = (event.data as {ws_url?: string}|null)?.ws_url; return \`${event.type} ${ws_url ?? event.url}\`` 主分支（data.ws_url）无测试触达——现有 test 3 的记录带顶层 `url:'wss://x'`，走的是 `?? event.url` 回退分支。若该行误读字段（如错写成 `event.url`），现有测试仍全绿。
- 建议：在 t152_network_ws_type_route 增一例：ws_message 记录带 `data:{ws_url:'wss://real'}`、顶层 url 为空，断言 summary 含 `wss://real` 且不含 `undefined`。属可扩展 case，非阻断。

## 结论

- 前轮 finding 复核：Round 1 无前轮。
- 改测方向复核：无「迁就实现」的改测。逐条核对 5 个更新测试文件：
  - `user_config_persistence`：合法值 `zh_CN`→`zh`、`absolute`→`relative`，非法值 `fr`→`zh_CN`、`x`→`absolute`，由 AC-001/002 值域变更（删 'absolute'、locale 单源 en/zh）驱动，非迁就实现；另新增 absolute 回退、zh/zh_CN 值域 4 条判别性测试（旧实现下 'absolute' 会保留、'zh' 会回退，均与断言相悖，确为 RED→GREEN）。
  - `mcp_schema`：passthrough 断言改为 strict/strip 断言，AC-008 规格变更驱动；strip 测试断言 `unexpected_field` 为 undefined、strict 测试断言未知顶层字段抛错，均能区分旧 passthrough 行为（旧实现不抛、字段保留）。
  - `websocket_capture_page`：断言整体从 `event.X` 迁到 `data.X`，AC-004 payload 迁移驱动；8 个用例断言值全保留，未删任何 expect，且新增 `event.ws_url/data_preview` undefined 的顶层纯净断言。
  - `storage_capture`：新增 AC-004 用例，断言 `event.storage_type/key` undefined（旧实现顶层混入，必失败）。
  - `agent_data_queries`：新增 storage_changes 查询回归（type/summary/preview 从 event.data 读，旧实现读顶层得 undefined，判别充分）。
- 本轮新发现：2 条（均 minor）。
- 未进表的提示：
  - `t152_event_kind_alignment` 的 CATEGORY_TO_KIND 映射表与生产 KIND 逐项对齐，9 个类别在 SAMPLE_TYPES 全被覆盖，非恒真；但若 category 与 kind 被「协同地」错误修改，映射表本身不会揭穿——属映射关系固有局限，非缺口。
  - `t152_id_unification` 中 `generate_unique_suffix` 唯一性依赖 crypto.randomUUID（Node 19+ 环境可用，回退 Math.random 亦近似唯一），非判别性断言，属新函数行为验证，可接受。
  - `i18n_locale_single_source` test 3（navigator 自动检测）新旧实现均通过，属 AC-010 语义保留回归，非判别性，可接受。
- 总体判断：测试真实触达生产逻辑，10 条 AC 全覆盖，判别力充分，无恒真/弱化/删断言/skip 等危险模式，改测均规格驱动；仅 2 条 minor，PASS。
- 系统性 follow-up：无。

### AC 复验方式

- AC-001：`re_verified` — user_config_persistence 断言 relative/system 保留、absolute 回退默认，与 sanitize enum `['system','relative']` 及 `DEFAULT_USER_CONFIG.detail_time_display_mode='system'` 静态核对一致。
- AC-002：`re_verified` — i18n_locale_single_source 断言 set_locale 不再写 'locale' key、init_locale 从 user_config.locale 恢复、保存往返生效；对照 i18n.ts set_locale/init_locale 实现及 user_config STORAGE_KEY='user_config' 静态核对。
- AC-003：`re_verified` — t152_network_ws_type_route 断言 timeline/list 对 ws_frame 记录取事件 type、非事件取 resource_type；对照 agent_data_queries `is_event_record`/`get_record_type` 静态核对。
- AC-004：`re_verified` — storage_capture/websocket_capture_page 断言 payload 在第二参数且事件顶层不混入；agent_data_queries storage_changes 断言 type/summary/preview 从 event.data 读；对照三个生产调用点静态核对。
- AC-005：`re_verified` — t152_detail_time_columns 通过真实渲染函数 `_render_net_table_for_test`/`_render_con_table_for_test` 断言 HTML 含 `+01.500s` 等真实时间、无 `+00.000s`/空 cell；对照 rel_time 格式化静态核对。
- AC-006：`re_verified` — t152_event_kind_alignment 断言 ws_frame/ws_message→network、clipboard/form→user、visibility_change→nav、capture→capture，且全 9 类别与 category_for_event_type 对齐；对照 event_category.ts 集合与 dashboard_shared event_kind 静态核对。
- AC-007：`re_verified` — t152_id_unification 断言 generate_unique_suffix 唯一定长、get_native_record_id 同键不同内容不碰撞且确定性；对照 id.ts/agent_data_queries 静态核对（同 relative_time+absolute_time 不同 url 在旧实现下 record_id 相同，测试判别）。
- AC-008：`re_verified` — mcp_schema 断言 config 未知字段 strip、全局工具 strict 拒绝 target_instance_id、全工具拒绝未知顶层字段；对照 schemas.ts 全部 17 个 schema 无 `.passthrough` 残留静态核对。
- AC-009：`re_verified` — t152_relative_time_clamp 通过 mock Date.now 断言时钟回拨返回 0、正常返回差值；对照 event_utils `Math.max(0, ...)` 静态核对。
- AC-010：`re_verified` — 逐文件核对更新测试断言值保留、仅按规格变更迁移/调整，无删断言、无迁就实现（详见改测方向复核）。

coverage = 10 / 10（全部以静态核查测试断言与生产实现方式复验；未实际运行测试——review 只读边界禁止运行）。

reviewed_scope: ecb9b704c82e25d0

verdict: PASS

## Round 2 (2026-08-13 02:21 UTC+8)

reviewed_scope: a75264927f84aca4

### 前轮 finding 复核

- **t152_test_f001（格式噪声）**：已修。`tests/unit/agent_data_queries.test.ts:234` 现为独立一行 `            end_time: 30,`，`order: 'desc'` 单独成行，格式还原，该 hunk 已从 diff 消失。同意消除。
- **t152_test_f002（ws_message summary 读 data.ws_url 分支无查询级测试）**：已补。`tests/unit/t152_network_ws_type_route.test.ts:42` 新增用例 `'ws_message 真实落库形（data 内 ws_url，base url=""）summary/preview 读 data.ws_url'`，记录形为 `{ event_id:'m2', type:'ws_message', relative_time_ms:200, url:'', data:{ ws_url:'wss://real.example/ws', direction:'sent' } }`，断言 summary 含真实 ws_url、preview.url 为真实 ws_url。生产侧 `get_record_preview` network_requests 事件分支同步改为 `url: ws_url ?? event.url`（`src/extension/background/agent_data_queries.ts` f002 注释处）。该用例走 `data.ws_url` 主分支，若实现错读 `event.url` 或未解 `data.ws_url` 断言即红，判别充分。已消除。

### 本轮新发现

- 0 条 blocking；0 条 minor。
- 本轮 diff 新增的 f003 配套测试（`tests/unit/agent_data_queries.test.ts` `storage_changes 旧顶层形记录 fallback`）已核：生产三处 storage_changes 分支（type/summary/preview）均改为 `((record as CaptureEvent).data ?? record)`，测试用无 data 键旧顶层形记录精确断言 type='remove'、summary='session.remove auth'，无 fallback 时 `sd.action` 对 undefined 取属性即崩，判别充分。无 skip/only/恒真/弱化断言。

### 改测方向复核

- 无「迁就实现」的改测。f002/f003 均为 code 轴修复（AC-003/AC-004 真实形与旧数据兼容）配套新增测试，断言精确，方向正确。

### 结论

- 前轮 2 条 finding 均已消除（f001 格式还原、f002 真实形用例补齐且生产 preview 同步），本轮无新 finding。
- 未进表的提示：无。
- 总体判断：code 轴 f003/f004 修复后配套测试真实触达生产逻辑、判别充分，无危险模式；前轮 minor 全部闭环，PASS。
- 系统性 follow-up：无。

verdict: PASS
