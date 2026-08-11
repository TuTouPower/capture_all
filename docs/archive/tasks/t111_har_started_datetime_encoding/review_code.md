# Task review t111（reviewer_focus: 代码）

- task：`t111_har_started_datetime_encoding`
- spec：`docs/tasks/t111_har_started_datetime_encoding/spec.md`
- diff_anchor：`aceba36f99e96e118dc042624facb366442aea4e`
- target：`git diff aceba36f99e96e118dc042624facb366442aea4e`
- round：1
- reviewed_at：2026-08-11 09:30 UTC+8

`reviewed_scope: 4b50e963adf6005c`

复验命令：`npx vitest run tests/unit/exporter.test.ts`（10/10 通过）、`npx tsc --noEmit`（exit 0）。

## Findings

### t111_code_f001 - websocket 记录 start_time_ms 双计：HAR startedDateTime 变为远期时间

- 严重度：critical
- 锚点：AC-001——给定网络事件 started 为已知非零时刻，导出 startedDateTime 与该时刻误差须 ≤1s；本修复对 websocket 记录输出误差约 50+ 年
- 位置：`src/extension/background/exporter.ts:316-319`（abs_time_ms 计算）；数据源 `src/extension/background/network_capture.ts:281`+`:685`、`src/extension/background/ws_handler.ts:45`、`src/extension/background/cdp_handler.ts:598`
- 问题：新增回退 `started_at_ms + (r.start_time_ms ?? 0)` 假定 `start_time_ms` 是相对采集开始的偏移。但全代码库唯一把 `start_time_ms` 填成非 null 的路径是 websocket，值为 `conn.created_ts = Date.now()`（绝对 epoch，见 `network_capture.ts:685`；`ws_handler.ts:45`、`cdp_handler.ts:598` 同为 `conn.created_ts`）。`archive_builder.ts:250` 亦用 `format_system_time(r.start_time_ms, ...)` 把该字段当绝对时间。修复后 websocket 记录 `abs_time_ms = started_at_ms + Date.now()` 双计：例 capture 开始 2024-01-01T00:00:00Z（1704067200000）+ ws 连接 2026-08-11（约 1786500000000）→ 3490567200000，`startedDateTime` 前移到约 2080 年。旧代码 `r.start_time_ms ?? 0` 对 websocket 输出的是正确绝对时间。旧注释「relative to capture start」本与数值不符，本修复沿用了注释的错误语义，把原本正确的 websocket 路径改坏。websocket 记录经 `get_network_requests`（storage.ts:513，无类型过滤）进入 HAR，故可复现。
- 建议：按字段实际语义区分，勿对绝对语义的 `start_time_ms` 再加 `started_at_ms`。可行方向：exporter 仅对已知为相对偏移的输入做 `started_at_ms + offset`；更稳的是 emit 侧统一落 `absolute_time`（number），exporter 走绝对分支（见 f002 建议）。

### t111_code_f002 - CDP-primary 记录无时间数据：HAR 时间线仍不可用（f007 未闭环）

- 严重度：important
- 锚点：范围「HAR 条目 startedDateTime 使用真实请求开始时间，非 epoch 零点」未在主路径达成；AC-001 在真实输入下无有效时刻可对齐
- 位置：`src/extension/background/network_capture.ts:1014` 与 `src/extension/background/cdp_handler.ts:721`（cdp_primary `start_time_ms/end_time_ms` 恒 null，`absolute_time`/`relative_time` 均不落库）；`src/extension/background/service_worker.ts:903-908`（`handle_network_request` 只写 data，丢弃事件上的 `relative_time_ms`）；`src/extension/background/exporter.ts:316-319`
- 问题：两个 CDP-primary 构建器 `build_cdp_primary_network_event` 只在事件对象上算 `relative_time_ms`，落库的 data 不含任何时间字段。修复后 primary 记录走 `started_at_ms + (null ?? 0) = started_at_ms`——每条 HAR 条目都显示采集开始时刻，时间线依然不可用（从「全 1970」变为「全采集开始」），f007（important，HAR 时间线不可用）本质未解决。AC-001 测试 `tests/unit/exporter.test.ts:196` 用 `start_time_ms: 1500`（相对偏移）构造了一个生产路径不存在的输入，未覆盖 primary 真实 null 场景，也未覆盖 websocket 绝对场景（f001 回归因此未被测试捕获）。
- 建议：在 CDP-primary 构建器 emit 时填 `start_time_ms = meta.timestamp` 或 `absolute_time = meta.timestamp`（f007 原建议），exporter 的 `absolute_time` number 分支即可输出真实请求时间；或至少把事件的 `relative_time_ms` 落到 data。

### t111_code_f003 - absolute_time 仅接受 number，字符串形式被静默忽略

- 严重度：minor
- 锚点：无 AC 直接违反；健壮性/潜在退化路径
- 位置：`src/extension/background/exporter.ts:317`；fixture `tests/unit/exporter.test.ts:87`
- 问题：`typeof r.absolute_time === 'number'` 只认 number。测试 fixture 的 `absolute_time` 是 ISO 字符串（`'2024-01-01T00:00:01.500Z'`），与类型 `absolute_time?: number`（types.ts:358）不符，被静默跳过落到回退分支；AC-002/AC-003 用例实际走 `started_at_ms + 0`。生产路径目前填 number（body_capture_coordinator.ts:296、network_correlator.ts 等），但一旦某路径存 ISO 字符串（`service_worker.ts:766-768` 的 handle_event 同时处理 number/string），HAR 时间会静默退化为采集开始时刻。
- 建议：仿 `service_worker.ts:766-768` 用 `Date.parse` 兼容字符串；或修正 fixture 为 number，避免测试路径与类型相悖。

### t111_code_f004 - base64 体 content.size 在 response_body_bytes 缺失时取 base64 文本长度

- 严重度：minor
- 锚点：无 AC 直接违反；f008 建议「size 用解码字节数」未落实
- 位置：`src/extension/background/exporter.ts:346`
- 问题：size 取 `r.response_body_bytes ?? utf8_byte_len(r.response_body)`。当 encoding=base64 且 `response_body_bytes` 为 null 时（AC-002 测试即此态），size 是 base64 字符串的 UTF-8 长度（`'aGVsbG8='` → 8），而非解码字节数（5）。CDP 路径已填 `byte_size`（network_capture.ts:614），生产大多正确；仅 null-bytes + base64 组合下 HAR 消费方拿到的 size 偏大。
- 建议：`body_encoding === 'base64'` 且 `response_body_bytes` 缺失时，按 base64 padding 修正计算解码长度。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 本轮新发现：4 条（1 critical、1 important、2 minor）。
- 未进表的提示：
  - 文件过大：`exporter.ts` 物理行数 452（≥400 触发 minor 阈值），本 task 净增约 9 行，未达 important（≥800）。单文件聚合 JSON/JSONL/HTML/HAR/app log 5 类导出；拆分建议放此，不构成当前阻断。
  - 复杂度：`build_har_entry` 手算 CC≈4-5（absolute_time 三元 + encoding 三元 + bodySize 嵌套三元），低于 10 阈值，无提示。
  - 范围外观察：diff 仅 `exporter.ts` + `exporter.test.ts` + `task.md`，无越界改动。
- 总体判断：修复引入 websocket 时间双计回归（critical），且 CDP-primary 主路径仍无真实请求时间（important），AC-001 在真实输入下不成立；FAIL。
- 系统性 follow-up：建议 emission 侧时间接线为独立 task：标题「network: CDP-primary 事件落库真实请求时间」，slug `network_cdp_primary_request_time`，阻断性 blocking（f007 主路径未闭环）。`task.py list` 无既有等价 tid；`docs/pending/` 无 HAR 相关条目。

### AC 复验披露

- AC-001：`re_verified` —— 重跑 `npx vitest run tests/unit/exporter.test.ts` 10/10 通过；独立核查生产路径（network_capture.ts / cdp_handler.ts / ws_handler.ts 的 start_time_ms 与 absolute_time 赋值）发现 websocket 双计回归（f001）与 primary 空时间（f002），真实输入下 AC-001 不成立；测试通过仅覆盖合成输入。
- AC-002：`re_verified` —— vitest 断言 + 代码 reading（exporter.ts:322,348 encoding spread），成立。
- AC-003：`re_verified` —— vitest 断言 + 代码 reading（非 'base64' 不设 encoding），成立。
- coverage = 3/3（均 re_verified；其中 AC-001 复验结论为真实输入下不成立，见 f001/f002）。

verdict: FAIL

## Round 2 (2026-08-11 09:35 UTC+8)

reviewed_scope: f26f755d7322cfe4

复验命令：`npx vitest run tests/unit/exporter.test.ts`（12/12 通过，无 skip/only）、`npx tsc --noEmit`（exit 0）。指纹用 `scripts/repo_template/check_review_status.py` 同口径重算，与注入值一致。

### 前轮 finding 复核（以 diff 与代码为准）

- **f001（critical，websocket start_time_ms 双计）——已修**。`exporter.ts:327-333` 时间解析重写为优先级链：`absolute_time`(number) → `start_time_ms`(绝对 epoch 直接用) → `started_at_ms + relative_time` → `started_at_ms`。不再有 `started_at_ms + start_time_ms`。核验 start_time_ms 语义：全仓唯一非 null 赋值为 ws 路径（`ws_handler.ts:45`、`network_capture.ts:281`、`cdp_handler.ts:598`，均为 `conn.created_ts = Date.now()` 绝对 epoch），与 `archive_builder.ts:250` `format_system_time(start_time_ms)` 语义一致，无其它生产者会喂相对偏移。websocket 记录现输出正确绝对时间。测试 AC-001b（`start_time_ms: 1704067201500` → `2024-01-01T00:00:01.500Z`）覆盖。
- **f002（important，CDP-primary 主路径无绝对时间）——已修**。`service_worker.ts:908-910` 在 `normalize_network_request` 前补 `request.absolute_time = new Date(current_capture.started_at).getTime() + event.relative_time_ms`，守卫 `request.absolute_time === undefined && typeof event?.relative_time_ms === 'number'`。接线核验：CDP-primary / web_request 事件经 `start_network_capture(capture_id, start_time, ..., handle_network_request)` 的 `send_to_background` 直达本函数，事件携带 `relative_time_ms`（`network_capture.ts:981/991`、`cdp_handler.ts:688/698`，`meta.timestamp = Date.now()` 为 epoch ms）；基线一致性：`started_at`（`start_capture` 的 `now_iso`）与 `start_time`（同函数 `now`）取自同一时刻，`started_at + relative_time_ms ≈ meta.timestamp`，误差毫秒级，满足 AC-001 1s 容差。`normalize_network_request`（861-869）不触碰 absolute_time，`write_network_requests`（storage.ts:575）原样持久化，无覆盖。ws_frame 分支在 889-901 提前 return，不受影响。
- **f003（minor，absolute_time 只认 number / fixture 字符串）——已修**。字段类型即 `absolute_time?: number`（types.ts:358），全部生产者填 number（network_correlator.ts:135/168、body_capture_coordinator.ts:296、build_cdp_only_request）；测试 fixture 字符串已移除，AC-001a 用 number `1704067201500`。
- **f004（minor，base64 content.size）——已修**。`exporter.ts:360` 在 `response_body_encoding==='base64'` 且 `response_body_bytes` 缺失时用 `base64_decoded_len`。手算验证：`'aGVsbG8='`→5、`'TQ=='`→1、`'TWE='`→2、空串→0，函数 `exporter.ts:22-26` 正确。

### 本轮新发现

0 条（无满足 Pre-Report Gate 的可观测缺陷）。

### 未进表的提示

- 测试层交叉核对（test reviewer 复核）：AC-001b fixture 仍带 `relative_time: 1500`，`started_at+1500 == 1704067201500` 与 start_time_ms 绝对值恰好相等，故该用例无法区分「start_time_ms 按绝对走」与「相对回退生效」两条路径；但能捕获原双计回归（远期日期），非恒真。建议 test reviewer 评估是否清空 relative_time 以增强隔离。
- 数据模型既有分叉（非本 task 引入）：`body_capture_coordinator.ts:295` 把 `relative_time` 填为 `evt.timestamp`（绝对 epoch），其余生产者填相对偏移；当前 absolute_time 恒同值并存，exporter 的 relative_time 回退分支不会命中该记录，仅为潜在隐患。
- `exporter.ts:367` response.bodySize 在 base64 + 无 response_body_bytes 时仍取 `utf8_byte_len(base64 文本)`，与 content.size（解码字节数）不一致；Round 1 仅要求改 content.size，bodySize 属既有轻微不一致。
- 文件过大：exporter.ts 445 行（≥400 minor 阈值），本 task 净增约 9 行，未达 important；结论仅此。
- 范围外观察：diff 增加 `service_worker.ts` 接线（f002 必要改动），无越界。

### AC 复验披露

- AC-001：`re_verified` —— 重跑 vitest 12/12；独立核验 producer 时间语义（start_time_ms 绝对、absolute_time number、meta.timestamp=epoch ms）与 `service_worker.ts:908-910` 接线基线一致性；真实输入下 CDP-primary / web_request / websocket 三条路径均产出正确绝对时刻，误差毫秒级。
- AC-002：`re_verified` —— vitest AC-002 断言 + exporter.ts:336,362 encoding 分支 reading。
- AC-003：`re_verified` —— vitest AC-003 断言 + 非 'base64' 不设 encoding reading。
- coverage = 3/3（均 re_verified）。

- 前轮 4 条 finding 全部消除，无新 blocker。
- 系统性 follow-up：无（Round 1 建议的 `network_cdp_primary_request_time` 已由本轮 f002 修复闭合，无需另建）。

verdict: PASS

## Round 3 (2026-08-11 09:45 UTC+8)

reviewed_scope: 4b486c65110544f8

复验命令：`npx vitest run tests/unit/exporter.test.ts`（12/12 通过，无 skip/only）、`npx tsc --noEmit`（exit 0）。指纹用 `render_review_prompts.py` 同口径重算：`git diff --binary aceba36f99e96e118dc042624facb366442aea4e -- .` 排除 task.md / review_*.md / handoff.json / pending / findings / archive / tasks_index / spikes / .scratch，sha1 前 16 位 = `4b486c65110544f8`，与注入值一致（r3 prompt 渲染后代码无改动）。

本轮聚焦：f002 接线守卫回归复核 —— `service_worker.ts:906-913` 新增 `!(request.start_time_ms && request.start_time_ms > 0)` 条件。

### 前轮 finding 复核（以 diff 与代码为准）

- **f001（critical，websocket start_time_ms 双计）——仍消除，且守卫使其更稳**。exporter.ts:327-333 保持 `start_time_ms` 绝对 epoch 直接采用（不再加 started_at）。本轮新增守卫使 ws 记录不再被 `handle_network_request` 的 `absolute_time` 接线覆盖，两条防线一致。核验数据流：ws 连接记录经 `ws_handler.ts:72` / `cdp_handler.ts:598` / `network_capture.ts:281` 的 `send_to_background` 直达 `handle_network_request`，事件恒带 `relative_time_ms`（ws_handler.ts:26 等，`Date.now() - start_time`）、data 恒带 `start_time_ms = conn.created_ts`（绝对 epoch），且同 req_id 在 connecting/open/closed 三态重复下发（`ws_handler.ts:144/160/195`）。若无守卫，closed 态复发的 `relative_time_ms`（关闭时刻偏移）会算出 `absolute_time = started_at + 关闭偏移`，exporter 以 absolute_time 优先覆盖 start_time_ms，HAR startedDateTime 变为连接关闭时刻而非创建时刻，误差 = 连接存活时长（分钟~小时级）。守卫使 `start_time_ms` 恒保留，走 AC-001b 直接采用分支，输出创建时刻。守卫为承重修改。
- **f002（important，CDP-primary 主路径无绝对时间）——仍消除，守卫不伤主路径**。CDP-primary / web_request 记录 `start_time_ms` 恒 null（全仓非 null 生产者仅三处 ws 路径：ws_handler.ts:45、cdp_handler.ts:598、network_capture.ts:281，均 `conn.created_ts` 绝对 epoch；其余 network_capture.ts:945/1014、cdp_handler.ts:721、webrequest_handler.ts:246、network_correlator.ts:81/132/180、network_hook.ts:350、body_capture_coordinator.ts:293、service_worker.ts:832 全为 null）。`!(null && ...)` = true，守卫不拦，`absolute_time = started_at + event.relative_time_ms` 照常计算，AC-001 主路径不变。
- **f003（minor，absolute_time 只认 number）——已消除（既有）**。字段类型 `absolute_time?: number`（types.ts:358），生产者均填 number；时间断言用例覆写为 number。测试基座 fixture 仍残留字符串 `absolute_time`（exporter.test.ts:87），但 AC-002/AC-003 只断言 encoding、不断言时间，字符串被 exporter 的 `typeof number` 分支静默跳过，无观测影响；属 test reviewer 职责，不新增代码 finding。
- **f004（minor，base64 content.size）——仍消除**。exporter.ts:360 base64+缺 `response_body_bytes` 时用 `base64_decoded_len`（exporter.ts:22-27），手算 `'aGVsbG8='`→5 正确。

### 本轮新发现

0 条。

守卫逻辑逐分支核对：
1. ws 记录（start_time_ms>0）：`!(true)`=false → 不覆写 → 保 AC-001b。承重（见 f001 复核）。
2. CDP-primary/web_request（start_time_ms null）：`!(null)`=true → 照常计算 absolute_time。主路径不变。
3. 无 event 的裸 NetworkRequestData（service_worker.ts:808、858 直调）：`typeof null?.relative_time_ms`='undefined' → 守卫 false → 不覆写，与改动前一致。
4. 上游已设 absolute_time（network_correlator.ts:135/168、body_capture_coordinator.ts:296）：首条件短路，不动。
5. start_time_ms=0：生产不产生；守卫 `>0` 与 exporter:329 `>0` 口径一致，无分叉。
6. 空值安全：handle_network_request 入口 `!current_capture` return（service_worker.ts:883），910 行访问 `current_capture.started_at` 有护栏。

### 未进表的提示

- 文件过大：`service_worker.ts` 1184 行（≥800 important 阈值）、`exporter.ts` 465 行（≥400 minor 阈值）。两者均为既有大文件：本 task 对 service_worker.ts 仅净增 6 行、exporter.ts 净增约 9 行，未达「本 task 仍堆大」标准，且未见过大直接导致可观测缺陷，按降级规则仅在此列出，不进 finding 表。
- 复杂度：`handle_network_request` 手算 CC≈5（入口守卫 + 限额 + ws_frame 分支 + T111 接线 if），低于 10 阈值，无提示。
- 测试层交叉核对（test reviewer 职责，仅提示）：AC-001b 用例 `{ start_time_ms: 1704067201500, absolute_time: undefined }` 未清空基座 `relative_time: 1500`，`started_at+1500 == start_time_ms` 恰好相等，仍无法区分「start_time_ms 按绝对走」与「相对回退生效」两分支；能捕获原双计回归（远期日期），非恒真。SW 守卫本身（service_worker.ts:908-910）无单测覆盖，属 background 模块 wiring，Round 2 已接受。建议 test reviewer 评估 AC-001b 清空 relative_time 增强隔离。
- 范围外观察：diff 仅 exporter.ts / service_worker.ts / exporter.test.ts / task.md，无越界改动。

### AC 复验披露

- AC-001：`re_verified` —— 重跑 vitest 12/12；逐分支核对 service_worker.ts:908-910 守卫（ws 保留 start_time_ms、CDP-primary/web_request 照算 absolute_time、无 event 不覆写），结合 producer 时间语义核验，三条路径均产出正确绝对时刻。ws 连接 long-lived 场景（closed 态复发）由守卫修正为创建时刻。
- AC-002：`re_verified` —— vitest AC-002 断言 + exporter.ts:336,362 encoding 分支 reading。
- AC-003：`re_verified` —— vitest AC-003 断言 + 非 'base64' 不设 encoding reading。
- coverage = 3/3（均 re_verified）。

- 前轮 4 条 finding 复核：f001/f002/f004 仍消除且守卫加强；f003 既有消除，基座字符串残留属 test 职责非代码缺陷。
- 本轮新发现：0 条。
- 系统性 follow-up：无。

verdict: PASS

## Round 4 (2026-08-11 09:51 UTC+8)

reviewed_scope: 50a9fc07d3f7a54b

本轮背景：Round 3 PASS 后生产代码（`src/`）零改动；仅 `tests/unit/exporter.test.ts` 微调 AC-001 fixture 值，消除与 relative 派生值碰撞。`check_review_status.py` 报 code review_scope=stale，属指纹漂移复核（最终同步），非代码回归复审。

复验命令：`npx vitest run tests/unit/exporter.test.ts`（12/12 通过，无 skip/only）、`npx tsc --noEmit`（exit 0）。指纹用 `render_review_prompts.py` 同口径重算：`git diff --binary aceba36f99e96e118dc042624facb366442aea4e -- .` 排除 task.md / review_*.md / handoff.json / pending / findings / archive / tasks_index / spikes / .scratch，sha1 前 16 位 = `50a9fc07d3f7a54b`，与注入值一致。

### 本轮改动核验

- diff 相对锚点仍为 exporter.ts / service_worker.ts / exporter.test.ts / task.md 四文件；与 Round 3 相比仅 test fixture 值变化。
- AC-001a：`absolute_time` `1704067201500 → 1704067202000`。基座 `started_at`（`2024-01-01T00:00:00Z` = 1704067200000）+ `relative_time:1500` = 1704067201500，与 2000 不再碰撞，absolute 分支被真实触发（Round 2/3 提示的「两分支无法区分」在测试层消除）。
- AC-001b：`start_time_ms` `1704067201500 → 1704067203000`。`started_at+1500 = 1500 ≠ 3000`，start_time_ms 绝对分支被真实触发；原双计回归（远期日期）仍会被捕获（若错误加 started_at 得 1704068704500 → 2024-01-05）。断言 `2024-01-01T00:00:03.000Z` 与解析一致。
- AC-001c：无时间字段回退 `started_at`，断言 `2024-01-01T00:00:00.000Z` 不变。

### 前轮 finding 复核（以 diff 与代码为准）

- **f001（critical，websocket start_time_ms 双计）——已修，仍消除**。`exporter.ts:326-333` 优先级链不变：absolute_time(number) → start_time_ms(绝对 epoch) → started_at_ms + relative_time → started_at_ms，无 `started_at_ms + start_time_ms`。本轮无 src 改动，AC-001b 新值仍覆盖且隔离更强。
- **f002（important，CDP-primary 主路径无绝对时间）——已修，仍消除**。`service_worker.ts:906-911` 接线与守卫（`!(request.start_time_ms && request.start_time_ms > 0)`）保持，ws 记录保留 start_time_ms、CDP-primary/web_request 照算 absolute_time。本轮无 src 改动。
- **f003（minor，absolute_time 只认 number）——已修，仍消除**。字段类型 `absolute_time?: number`（types.ts:358），生产者均填 number；AC-001a 现用 number `1704067202000`，与类型一致。基座 fixture 残留字符串 `absolute_time`（exporter.test.ts:87）仅被 AC-002/AC-003 使用，只断言 encoding 不断言时间，字符串经 `typeof number` 分支静默跳过，无观测影响，属 test reviewer 职责。
- **f004（minor，base64 content.size）——已修，仍消除**。`exporter.ts:359-361` base64 + 缺 `response_body_bytes` 时用 `base64_decoded_len`（exporter.ts:22-27），手算 `'aGVsbG8='`→5 正确。本轮无 src 改动。

### 处置表

| finding | 严重度 | 状态 |
|---------|--------|------|
| f001 | critical | 已修（Round 2，守卫加强 Round 3，仍消除） |
| f002 | important | 已修（Round 2，仍消除） |
| f003 | minor | 已修（Round 2，基座字符串残留属 test 职责） |
| f004 | minor | 已修（Round 2，仍消除） |

本轮新发现：0 条（无满足 Pre-Report Gate 的可观测缺陷）。

### 未进表的提示

- 文件过大：`service_worker.ts` 1184 行、`exporter.ts` 465 行，均为既有大文件，本 task 净增未超「仍堆大」标准，维持 Round 3 结论，不进 finding 表。
- 复杂度：`handle_network_request` CC≈5、`build_har_entry` CC≈4-5，低于 10 阈值，无提示。
- 测试层交叉核对（test reviewer 职责）：AC-001b 基座 `relative_time:1500` 未清空，但新 `start_time_ms=3000` 已使两分支可区分；SW 守卫（service_worker.ts:908-910）仍无单测覆盖，属 background wiring，Round 2 已接受。
- 范围外观察：本轮 diff 仅 test fixture 微调，无越界改动。

### AC 复验披露

- AC-001：`re_verified` —— 重跑 vitest 12/12；重算新 fixture 三分支隔离性（a/b/c 各触发 absolute/start_time_ms/回退），结合 exporter.ts:326-333 与 service_worker.ts:906-911 代码 reading，三条路径均产出正确绝对时刻。
- AC-002：`re_verified` —— vitest AC-002 断言 + exporter.ts:336,362 encoding 分支 reading。
- AC-003：`re_verified` —— vitest AC-003 断言 + 非 'base64' 不设 encoding reading。
- coverage = 3/3（均 re_verified）。

- 前轮 4 条 finding 复核：全部已修且仍消除；本轮无 src 改动，test fixture 微调增强了分支隔离。
- 本轮新发现：0 条。
- 系统性 follow-up：无。

verdict: PASS
