# Task review t144（reviewer_focus: 通用）

- task：`t144_timeline_merge_network_console`
- spec：`docs/tasks/t144_timeline_merge_network_console/spec.md`
- diff_anchor：`1098bc356e1846128b180fdb530a37c168801dba`
- target：`git diff 1098bc356e1846128b180fdb530a37c168801dba`
- round：1
- reviewed_at：2026-08-12 21:20 UTC+8

## Findings

### t144_gen_f001 - console 事件相对时间恒为 0，时间线位置与时间显示全部错误

- 严重度：important
- 锚点：AC-001（时间线 console 轨道显示对应事件）+ AC-006（时间线完整）；行为缺陷：console 事件被显示在采集起点、rel_time 全部 `+00.000s`
- 位置：`src/extension/dashboard/dashboard_shared.ts:247`（及 217-218 注释）
- 问题：`merge_detail_events` 对 console 事件取 `(c as unknown as { relative_time_ms?: number }).relative_time_ms ?? 0`。但 CONSOLE_EVENTS 存储内的记录是 `ConsoleEventData` 对象（`src/extension/background/service_worker.ts:952-954` 只把 `event.data` 落库并补 `capture_id/event_id`，未复制 `relative_time_ms`；`src/extension/background/console_capture.ts:152-164` 构造的 `data` 也从不含该字段）。故 `get_console_events` 返回的记录**运行时也无 relative_time_ms**，所有 console 事件合并后 `relative_time_ms` 恒为 0。代码注释（217-218 行）声称「运行时字段齐全」与事实不符。可观测结果：任何含 console 日志的采集，console 轨道事件全部堆在时间线起点，列表视图每条显示 `+00.000s`，与日志实际发生时刻无关。测试 fixture 的 console 事件同样不带该字段（tests/unit/t144_timeline_merge_network_console.test.ts:27），测试只断言计数/类型，未断言时间位置，故未暴露此缺陷。
- 建议：根因在 console 写路径丢弃 `event.relative_time_ms`。最小修复：`handle_console_log` 落库前 `(data as unknown as { relative_time_ms: number }).relative_time_ms = event.relative_time_ms`（CONSOLE_EVENTS store 本就建了 `relative_time_ms` 索引，见 storage.ts:95）；合并侧即可直接读该字段。若本 task 坚持不动写路径，则该注释应改为「console 无时间字段，恒 0」，且 AC-001 的「时间线显示」需接受全部 console 事件落在原点——当前实现属于误报正确。

### t144_gen_f002 - network 合并回退 `start_time_ms`（绝对 epoch）使 websocket 连接事件相对时间≈1.7e12ms，撑爆整个时间线

- 严重度：critical
- 锚点：AC-001 + AC-006；行为缺陷：任意含 websocket 连接的采集，整条 timeline 时间刻度被拉爆、所有事件坍缩到左缘
- 位置：`src/extension/dashboard/dashboard_shared.ts:234`
- 问题：`relative_time_ms: n.relative_time ?? n.start_time_ms ?? 0`。对 websocket 连接记录（`src/extension/background/network_capture.ts:282` `start_time_ms: conn.created_ts`，而 `created_ts: Date.now()` 为绝对 epoch，见 network_capture.ts:700；该记录无 `relative_time`），合并结果≈1.7e12ms。`render_trace` 用 `detail_events.reduce((a,e)=>Math.max(a,e.relative_time_ms),1)` 作 maxT（dashboard_detail.ts:244），单一 ws 连接即把 maxT 撑到 54 年量级：全部真实事件 `left%` 坍缩到 0，刻度标签 `fmt_axis` 输出千万分钟级垃圾值，playhead/minimap 全部失效。此外 webRequest-only / fallback 路径构造的请求（build_network_event 未传 relative_time，见 network_capture.ts:953-981；handle_fallback_body_event service_worker.ts:853-873）既无 `relative_time` 也无 `start_time_ms`，落入 0，与正确相对时间混排。`agent_data_queries.ts:157-160` 的既有排序同样以 `start_time_ms` 兜底，但那是 agent 时间线只用于排序；本合并把 epoch 当**相对位置**直接用于时间线 x 坐标，属于语义错误。
- 建议：websocket 连接事件在写路径已有 `event.relative_time_ms`（network_capture.ts:266 相对时间），可在 `handle_network_request`（service_worker.ts:927-930 已有 `absolute_time` 派生逻辑）一并把 `relative_time` 写入请求记录；或合并侧对 `start_time_ms` 仅当其为小值（相对量）才兜底，epoch（>1e11）一律退化为 0 并记 warning。至少应避免把绝对 epoch 当相对毫秒使用。

### t144_gen_f003 - AC-005 拖拽保护不完整：仅事件 marker 拖拽置位，minimap 拖拽（及轨道空白区 playhead 拖拽）不受保护

- 严重度：important
- 锚点：AC-005（拖拽 playhead/minimap 期间不被轮询重渲染打断，pointermove 监听在交互结束移除）
- 位置：`src/extension/dashboard/dashboard_detail.ts:665-670`、`wire_minimap_drag`（706-739）
- 问题：`_tl_dragging` 只在 `wire_lane_pointerdown` 的 **marker 分支**（拖 `tl-tick/.tl-dot/.tl-diamond`）置位/复位。minimap 拖拽（`wire_minimap_drag`）完全不设该标记，且其 `move/finish` 监听挂在 `mm_window` **DOM 节点**上（731-738）。轮询（dashboard.ts:138）在 `is_tl_dragging()===false` 时照常 `load_detail` + 签名变化即 `render_content()`，重渲染替换整个 `#content`，旧 `mm_window` 节点被摘除、其监听随之失效——拖拽中途指针不再跟随，交互被打断。轨道空白区直接拖 playhead（694-701 行非 marker 分支）同样未置位（其监听在 window 上、可存活，但渲染跳动）。AC-005 明确点名 playhead/minimap，当前只覆盖事件 marker 一种拖拽。
- 建议：在 `wire_minimap_drag` 的 pointerdown/finish 对称置位/复位 `_tl_dragging`；非 marker 的 lane 拖拽分支（694-701）同步置位，up 内复位，保证三类拖拽（marker / 空白区 playhead / minimap）在交互期间都不被轮询重渲染打断。

### t144_gen_f004 - 合并出的 network/console 事件缺 `absolute_time`，inspector 绝对时间显示 "undefined"

- 严重度：minor
- 锚点：行为缺陷（显示层面）；AC-006 相关的展示一致性
- 位置：`src/extension/dashboard/dashboard_shared.ts:229-254`、`src/extension/dashboard/dashboard_detail.ts:300`
- 问题：合并对象未设置 `absolute_time`，`render_dt_inspector` 对选中事件调 `format_system_time(e.absolute_time, ...)`（dashboard_detail.ts:300），`format_system_time(undefined)` 返回 `String(undefined)="undefined"`（system_time.ts:74）。点击 timeline 上的 network/console 事件打开 inspector，绝对时间字段显示字面 "undefined"。network 底层请求其实已带 `absolute_time`（service_worker.ts:927-930 派生），合并可直接透传；console 侧无对应字段。
- 建议：network 合并透传 `n.absolute_time`；console 无来源则 inspector 对缺失绝对时间给出占位符（如「—」）而非 "undefined"，或合并时以 `created_at` 兜底。

### t144_gen_f005 - AC-004 变化检测对「就地更新」的请求记录存在漏检

- 严重度：minor
- 锚点：AC-004（仅在有变化时更新）；行为缺陷：请求状态/时长原地更新但不触发重渲染
- 位置：`src/extension/dashboard/dashboard.ts:139-145`、`detail_snapshot_signature`（76-83）
- 问题：签名由 `事件数:最新相对时间:event_count:request_count:log_count` 组成。若某已入列的 network 记录被就地更新（状态码/时长变化，request_count 与事件数不变），签名不变，DOM 不刷新，网络表格/列表里该请求停留在旧状态，直到有任意新事件/统计变化才触发。修复前每 2s 全量重渲染能看到该更新。当前请求多在完成时一次性写入（build_network_event 于响应完成时构造），此场景发生频率低，故列 minor。
- 建议：将网络请求的完成状态纳入签名，或对 network 列表单独做轻量刷新；不做也不阻断本次验收。

## 结论

- 本轮新发现：5 条（f001-f005；critical 1 / important 2 / minor 2）
- 未进表的提示：修复前 network/console 独立 tab 的时间列本就恒空（render_net_table:329 `rel_time(0)`、render_con_table:385 `timestamp||''`），属既有状态、不在本 task 范围；本次只指出，不进 finding。
- 总体判断：AC-001/002 的「轨道显示」与 rail 计数基本激活（event_kind 分类正确、测试到位），AC-003/004/007 基本满足；但合并函数的相对时间推导与真实数据模型不符（console 恒 0、network ws 恒 epoch），前者使 console 时间线位置全错、后者直接破坏含 websocket 采集的整条时间线（critical），AC-005 拖拽保护仅覆盖 marker 一类（important）。存在未解决 critical/important，verdict FAIL。
- 系统性 follow-up：建议「console/network 写路径保留 relative_time_ms（落库时复制 event.relative_time_ms）」，slug：`store_relative_time_on_console_network_write`，阻断性 important。

### AC 复验披露

- AC-001：re_verified。核对 merge_detail_events（dashboard_shared.ts:219-256）与 event_kind（144-158）、render_trace 轨道（dashboard_detail.ts:238-264）；network/console 轨道确有事件，但位置推导错误，见 f001/f002。
- AC-002：re_verified。rail 计数按 event_kind 统计（dashboard_detail.ts:117-143）；t144 测试断言 counts.network=1、counts.console=1（test:48-55）。
- AC-003：re_verified。空数组时不产生 network/console 类型事件（merge 直接展开空数组），测试覆盖（test:57-63）。
- AC-004：re_verified。detail_snapshot_signature（dashboard.ts:76-83）+ 轮询签名比对（138-145）逻辑正确，无变化不 render_content；就地更新漏检见 f005（minor）。
- AC-005：re_verified。`_tl_dragging` 置位/复位与 window listener 清理（dashboard_detail.ts:665-670）正确，但仅覆盖 marker 拖拽，minimap/空白区拖拽未保护，见 f003（important）。
- AC-006：re_verified。既有五类事件展开与升序排序与修复前一致（dashboard_shared.ts:223-228,255）；network/console 时间线新增部分有位置缺陷（f001/f002）。
- AC-007：trust_prior。未执行测试套件（只读约束禁跑会产生副作用的命令）；通过代码审查确认 dashboard_timeline_marker/detail_zoom_control/detail_search_preserve_input 三测试均以 `set_detail_events` 直灌 fixture 并调用 render_trace/render_dt_rail/render_dt_list，t144 改动未触及这些断言路径。建议合并前人工跑一次全量单测。

coverage = 6 / 7

reviewed_scope: fc77e66438733032

verdict: FAIL

## Round 2 (2026-08-12 21:45 UTC+8)

### 前轮 finding 复核（以 git diff 1098bc356e1846128b180fdb530a37c168801dba 与当前代码为准）

- **t144_gen_f001（important）→ 已修**。console 链路完整：`types.ts:392` ConsoleEventData 加 `relative_time_ms?: number`；`service_worker.ts:954` 落库前复制 `event.relative_time_ms`；`dashboard_shared.ts:243` 合并侧读 `c.relative_time_ms`；新增测试 AC-001c（test:72-78）断言时间位置。`agent_data_queries.ts:157` 的 `typeof === 'number'` 防御为配套改动，正确。注意：修复前已落库的历史 console 记录无此字段，合并后仍落 0，不可恢复——可接受，但建议处置表注明。
- **t144_gen_f002（critical）→ 部分修复，残留为 f006**。ws 连接已补 `relative_time`（network_capture.ts:283-285 `Math.max(0, conn.created_ts - start_time)`），merge 兜底移除 epoch `start_time_ms`（dashboard_shared.ts:232 `n.relative_time ?? 0`），ws 不再撑爆时间线，测试 AC-001d（test:80-89）覆盖。但 **CDP primary 与 webRequest 主路径的请求仍无 `relative_time`**，合并后全部落 0，见 f006。
- **t144_gen_f003（important）→ 部分修复，残留为 f007**。minimap 拖拽已置 `_tl_dragging`（dashboard_detail.ts:727 置位 / :737 finish_drag 复位），marker 拖拽 Round 1 已置。空白区 playhead 拖拽分支（694-701）仍未置位，且该分支 pointerdown 立即 `render_content()` 替换 DOM，后续 seek 读 detached overlay 的 rect=0 而失效（既有行为 + 本轮未覆盖），见 f007。
- **t144_gen_f004（minor）→ 已缓解**。合并补 `absolute_time`（dashboard_shared.ts:233），inspector 不再显示 "undefined"，ws 记录正确显示绝对时间；但 webRequest 主路径请求已由 `handle_network_request` 派生 `n.absolute_time`，合并侧只用 `start_time_ms` 判断致该路径仍空——缓解不足，吸收进 f006 建议。
- **t144_gen_f005（minor）→ 已缓解但不彻底**。签名加 `get_detail_network().length` 与 `get_detail_console().length`（dashboard.ts:80）。但新增请求/console 事件会同步并入 `detail_events` 使 `events.length` 变化，这两个长度项实际冗余；真正未覆盖的「就地更新」（数组长度不变、记录字段变化）仍漏检。场景罕见，维持 minor。

### 本轮新发现

### t144_gen_f006 - CDP primary / webRequest 主路径网络请求仍无 relative_time，network 轨道位置全部落 0

- 严重度：important
- 锚点：AC-001（时间线 network 轨道显示对应事件）+ AC-006（数据展示完整）；行为缺陷：多数真实网络请求被显示在时间线原点
- 位置：`src/extension/dashboard/dashboard_shared.ts:232`（`n.relative_time ?? 0`）；写路径 `src/extension/background/service_worker.ts:927-940`；`src/extension/background/network_capture.ts:1015-1041`（CDP primary）、`:953-981`（webRequest）
- 问题：`merge_detail_events` 现取 `relative_time_ms: n.relative_time ?? 0`。但网络采集主路径构造的请求 data **不携带 `relative_time`**：CDP primary（`build_cdp_primary_network_event` 调 `build_network_data` 未传 `relative_time`，`start_time_ms` 恒 null）与 webRequest 主路径（`build_network_event` 同样未传）生成的事件都有 `relative_time_ms`（network_capture.ts:993/938），但 `handle_network_request` 只派生 `request.absolute_time`（service_worker.ts:927-930），从不写 `request.relative_time`。合并后这些请求 `relative_time_ms` 全为 0——attached tab 的 CDP primary 请求、webRequest 监听捕获的请求全部堆在 timeline 原点，network 轨道位置展示失真。webRequest-only（`build_web_request_only_request`，correlator.ts:134-139）与 ws 连接是仅有的带 `relative_time` 路径。测试 fixture 的 network 请求均显式带 `relative_time: 50`（test:24），故未暴露真实路径缺失。
- 建议：对称 f001 修复——`handle_network_request` 中 `if (typeof event?.relative_time_ms === 'number') request.relative_time = event.relative_time_ms;`（该函数已有 event.relative_time_ms → absolute_time 的派生逻辑，同处补一行即可）。merge 侧顺带透传 `absolute_time: n.absolute_time ? new Date(n.absolute_time).toISOString() : ''` 以补全 f004 残留。

### t144_gen_f007 - 空白区 playhead 拖拽未受 _tl_dragging 保护，且自身 render_content 使 seek 失效

- 严重度：minor
- 锚点：AC-005（拖拽 playhead 期间不被轮询重渲染打断）；行为缺陷：时间线空白区拖 playhead 时重渲染打断交互
- 位置：`src/extension/dashboard/dashboard_detail.ts:694-701`（`wire_lane_pointerdown` 非 marker 分支）
- 问题：marker 拖拽与 minimap 拖拽已置 `_tl_dragging`，但空白区直接拖 playhead 的分支（694-701 行）未置位，轮询在拖拽中仍会 `render_content()` 替换 `#content`，`overlay`（`tlTrackOverlay` 旧节点）被 detached 后 `getBoundingClientRect()` 返回宽 0，`seek` 的 `if (r.width <= 0) return` 直接退出，拖拽不再响应。另该分支 pointerdown 本身立即 `router.render_content()`（697 行），第一次渲染即让旧 overlay detached——即使加 `_tl_dragging` 也只能挡轮询，救不了自身渲染；需拖拽期间不触发 render_content 或 seek 改用 pointer 坐标 + `document.elementsFromPoint`。
- 建议：给该分支对称置位/复位 `_tl_dragging`，并将 697 行的 `render_content()` 延后到 pointerup 后执行（仅关 inspector 场景），保证 playhead 拖拽全程不重渲染。

### 未进表的提示

- 无。

### 总体判断

f001 已修；f002-f005 部分修复：ws 撑爆与 minimap 保护已解决，但 **CDP primary / webRequest 主路径请求时间定位仍缺失（f006，important）**，network 轨道最常见请求全部落 0，AC-001/AC-006 未完全满足。存在未解决 important，verdict FAIL。

- 系统性 follow-up：无新增；f006 建议在本次修复内完成（与 f001 同属写路径时间字段透传），不另立 task。

### AC 复验披露（Round 2）

- AC-001：re_verified。network/console 轨道事件已并入，位置正确性部分达标：console（f001 修后）与 ws 连接正确，CDP primary/webRequest 主路径请求仍落 0（f006）。
- AC-002：re_verified。rail 计数按 event_kind 统计，测试断言 counts.network=1、counts.console=1（test:48-55）。
- AC-003：re_verified。空数组不产生 network/console 类型事件，测试覆盖（test:57-63）。
- AC-004：re_verified。签名含事件数/最新相对时间/network 与 console 长度/stats，无变化不 render_content；就地更新漏检为 minor（f005）。
- AC-005：re_verified。marker + minimap 拖拽已置 `_tl_dragging`，window listener 清理正确；空白区 playhead 拖拽未覆盖（f007，minor）。
- AC-006：re_verified。既有五类事件展开与升序排序与修复前一致；network/console 新增位置缺陷见 f006。
- AC-007：trust_prior。未跑测试套件（只读约束）；代码审查确认 dashboard_timeline_marker / detail_zoom_control / detail_search_preserve_input 以 `set_detail_events` 直灌 fixture，t144 改动未触及断言路径。建议合并前人工跑全量单测。

coverage = 6 / 7

reviewed_scope: fc77e66438733032

verdict: FAIL

## Round 3 (2026-08-12 22:10 UTC+8)

### 前轮 finding 复核（以 git diff 1098bc356e1846128b180fdb530a37c168801dba 与当前代码为准）

- **t144_gen_f001（important）→ 已修（维持）**。console 时间字段链路完整。
- **t144_gen_f002（critical）→ 已修（维持）**。ws 连接 `relative_time` 已补（network_capture.ts:283-285），merge 兜底不再用 epoch，ws 不撑爆时间线。
- **t144_gen_f003（important）→ 已修，f007 已登记**。minimap 置位已确认；空白区拖拽残留已按 f007 登记 `docs/pending/todo/p035_timeline_blank_area_drag.md`，内容与 f007 描述一致（来源、影响、处理「未开」）。minor 遗留登记合规，同意遗留，f007 关闭。
- **t144_gen_f004（minor）→ 已缓解**。inspector 不再显示 "undefined"。webRequest 主路径请求 `absolute_time` 仍为空（合并侧只用 `start_time_ms` 判断，而该路径 `start_time_ms` 为 null），残留见 f008 建议。
- **t144_gen_f005（minor）→ 维持 minor**。签名长度项冗余，就地更新仍漏检；罕见，不阻断。
- **t144_gen_f006（important）→ 已修（主路径）**。`build_network_event`（network_capture.ts:977-978）与 `build_cdp_primary_network_event`（network_capture.ts:1038-1039）均补 `relative_time: relative_time_ms`，覆盖 CDP primary 与 webRequest 监听两条主路径，合并侧 `n.relative_time ?? 0` 取到真实相对时间。**但 content script fallback_hook 补充路径仍无 relative_time，残留见 f008。**

### 本轮新发现

### t144_gen_f008 - fallback_hook 路径 network 请求仍无 relative_time，capture_network 开启时常态落 0

- 严重度：important
- 锚点：AC-001（network 轨道显示对应事件）+ AC-006（数据展示完整）；行为缺陷：content script network hook 补充的请求全部堆在 timeline 原点
- 位置：`src/extension/content/network_hook.ts:369-395`（content 侧 `build_network_data` 未传 `relative_time`）；`src/extension/background/service_worker.ts:790-792,846-876`（`handle_event` 的 `network_body_hook` 分支只传 `event.data`，丢弃事件相对时间；`handle_fallback_body_event` 的 `build_network_data` 也未传 `relative_time`）
- 问题：`capture_network` 开启时 content script 注入 network_hook 拦截 fetch/XHR（content_script.ts:121-124），发 `network_body_hook` 事件携带带 `relative_time_ms` 的 event 与不带时间的 `data`（network_hook.ts:393-407 的 event 有 `relative_time_ms`，同段 `build_network_data` 未传 `relative_time`）。background `handle_event` 的 `network_body_hook` 分支（service_worker.ts:791-792）仅 `handle_fallback_body_event(event.data)`，data 经 `handle_fallback_body_event` 二次 `build_network_data`（853 行）仍未传 `relative_time`。落库的 fallback 请求 `relative_time` 为 undefined，合并侧 `n.relative_time ?? 0` 后 timeline 位置全 0。该路径不依赖 CDP attach，纯 webRequest-only / 无 CDP 环境同样启用，为真实常见路径。现有测试 fixture 的网络请求均显式带 `relative_time`，未覆盖该路径。
- 建议：content 侧 `network_hook.ts` 的 `build_network_data` 传 `relative_time: get_relative_time(state.capture_start_epoch_ms)`（同一作用域已可用），或 background `handle_fallback_body_event` 接受 `event.relative_time_ms` 参数并在 data 补字段。顺带在合并侧透传 `absolute_time: n.absolute_time ? new Date(n.absolute_time).toISOString() : ''`，补全 f004 的 webRequest 主路径残留。

### 未进表的提示

- 无。

### 总体判断

f006 主路径已修，f007 遗留登记合规。剩余 **fallback_hook 补充路径请求 timeline 落 0（f008，important）**，AC-001/006 对 capture_network 开启时的 content hook 请求仍不成立。存在未解决 important，verdict FAIL。

- 系统性 follow-up：无新增；f008 建议在本次修复内完成（同属 network data 相对时间透传）。

### AC 复验披露（Round 3）

- AC-001：re_verified。console（f001）、ws（f002）、CDP primary / webRequest 主路径（f006）时间定位已正确；fallback_hook 补充路径仍落 0（f008）。
- AC-002：re_verified。rail 计数按 event_kind 统计，测试断言 counts.network=1、counts.console=1。
- AC-003：re_verified。空数组不产生 network/console 类型事件，测试覆盖。
- AC-004：re_verified。签名含事件数/最新相对时间/network 与 console 长度/stats，无变化不 render_content；就地更新漏检为 minor（f005）。
- AC-005：re_verified。marker + minimap 拖拽置 `_tl_dragging`，window listener 清理正确；空白区拖拽已登记 p035 遗留（f007 关闭）。
- AC-006：re_verified。既有五类事件展开与升序排序与修复前一致；network 位置缺陷见 f008。
- AC-007：trust_prior。未跑测试套件（只读约束）；代码审查确认三既有测试路径未受影响。建议合并前人工跑全量单测。

coverage = 6 / 7

reviewed_scope: fc77e66438733032

verdict: FAIL

## Round 4 (2026-08-12 22:40 UTC+8)

### 前轮 finding 复核（以 git diff 1098bc356e1846128b180fdb530a37c168801dba 与当前代码为准）

- **t144_gen_f001 / f002 / f003 / f005 / f006（重要/次要）→ 维持**。console（f001）、ws（f002）、minimap（f003）、CDP primary 与 webRequest 主路径（f006）修复均确认有效；f004 缓解、f005 维持 minor。
- **t144_gen_f008（important）→ 修复无效，重新打开，细化见 f009**。content 侧补的 `relative_time` 落在 **data 内层**，但 background 侧实际不消费它，落库对象顶层无 `relative_time`，merge 读不到，见 f009 完整证据。

### 本轮新发现

### t144_gen_f009 - content network hook 请求落库为 CaptureEvent 形状，merge 侧仍读不到 relative_time（f008 修复无效）

- 严重度：important
- 锚点：AC-001（network 轨道显示对应事件）+ AC-006（数据展示完整）；行为缺陷：capture_network 开启时 content hook 补充的请求仍全部堆在 timeline 原点
- 位置：`src/extension/background/service_worker.ts:791-792`（`network_body_hook` 分支为死代码）；`:798-815`（`handle_event` 通用路径落库）；`src/extension/content/network_hook.ts:389,392-403`（data.relative_time 落入内层）；`src/extension/content/content_script.ts:266-268`（`send_event` 将 data 合并进 `event.data`）；`src/extension/dashboard/dashboard_shared.ts:232`（merge 读顶层 `n.relative_time`）
- 问题：全仓搜索 `network_body_hook` 仅 `service_worker.ts:791` 一处，**无任何生产者**——`handle_fallback_body_event` 分支是死代码。content network hook 发的是 `type: 'network_request'` 事件（network_hook.ts:396），经 `send_event` 组装为 `{ ...event, data }`（content_script.ts:268），background `handle_message` action='event' 分发到 `handle_event` 通用路径（service_worker.ts:210-211, 798-815）：`write_events([event])` 把**完整 CaptureEvent 形状**写入 NETWORK_REQUESTS store（顶层含 `event_id`/`relative_time_ms`/`data` 属性）。f008 的修复（network_hook.ts:389 给 data 补 `relative_time`）落在 data 内层，不会出现在落库对象顶层。`get_network_requests` 读取该 store 返回的就是此形状（storage.ts:486-492 无归一化），merge 侧 `relative_time_ms: n.relative_time ?? 0`（dashboard_shared.ts:232）读顶层字段 → undefined → 0。content hook 请求在 timeline 仍全部落原点；且与 webRequest/CDP 主路径（已补顶层 relative_time、位置正确）对同一请求可能各落一条，同请求显示两个位置。测试 fixture 的 network 请求全为 NetworkRequestData 形状（显式顶层 `relative_time: 50`，test:24），无 CaptureEvent 形状（顶层 `relative_time_ms`）用例，故测试全绿但未覆盖此路径。
- 建议：merge 侧兼容两种落库形状——`relative_time_ms: n.relative_time ?? (n as unknown as { relative_time_ms?: number }).relative_time_ms ?? 0`（`NetworkRequestData` 形状走 `relative_time`，`CaptureEvent` 形状走顶层 `relative_time_ms`，console 修复同此模式）。或从落库端统一：让 content hook 请求经 `handle_network_request` 落库为纯 `NetworkRequestData` 形状（复用 webRequest/CDP 路径），并删除 791 死代码分支。新增测试补一个 CaptureEvent 形状（顶层 `relative_time_ms`）的 network 用例断言时间透传。

### 未进表的提示

- `service_worker.ts:791-792` 的 `network_body_hook` 分支是死代码（无生产者），可随 f009 清理。

### 总体判断

f001-f006 主修复均有效；f008 的 content 侧修复因 background 走通用路径、落库形状为 CaptureEvent 而无效——content hook 请求仍全部落 0（f009，important），AC-001/006 未完全满足。存在未解决 important，verdict FAIL。

- 系统性 follow-up：无新增；f009 建议在本次修复内完成（merge 侧兼容一行 + 补 CaptureEvent 形状用例）。

### AC 复验披露（Round 4）

- AC-001：re_verified。console、ws、CDP primary/webRequest 主路径时间定位正确；content hook 补充请求仍落 0（f009）。
- AC-002：re_verified。rail 计数按 event_kind 统计，测试断言 counts.network=1、counts.console=1。
- AC-003：re_verified。空数组不产生 network/console 类型事件，测试覆盖。
- AC-004：re_verified。签名含事件数/最新相对时间/network 与 console 长度/stats，无变化不 render_content；就地更新漏检为 minor（f005）。
- AC-005：re_verified。marker + minimap 拖拽置 `_tl_dragging`，window listener 清理正确；空白区拖拽已登记 p035 遗留（f007 关闭）。
- AC-006：re_verified。既有五类事件展开与升序排序与修复前一致；network 位置缺陷见 f009。
- AC-007：trust_prior。未跑测试套件（只读约束）；代码审查确认三既有测试路径未受影响。建议合并前人工跑全量单测。

coverage = 6 / 7

reviewed_scope: fc77e66438733032

verdict: FAIL

## Round 5 (2026-08-12 23:10 UTC+8)

### 前轮 finding 复核（以 git diff 1098bc356e1846128b180fdb530a37c168801dba 与当前代码为准）

- **t144_gen_f001 / f002 / f003 / f006（blocking）→ 维持已修**。console、ws、minimap、CDP primary/webRequest 主路径时间定位均确认。
- **t144_gen_f009（important）→ 已修**。merge 侧 `relative_time_ms: (n as { relative_time_ms?: number }).relative_time_ms ?? n.relative_time ?? 0`（dashboard_shared.ts:232-235）：content hook CaptureEvent 形状读顶层 `relative_time_ms`，background NetworkRequestData 形状读 `relative_time`，顺序与两种落库形状匹配。新增测试 AC-001e（test:91-102）断言 content 形状顶层 `relative_time_ms: 777` → 777、`relative_time: undefined` 不干扰；与 AC-001d（NetworkRequestData 形状 `relative_time` 优先）互补，两种形状均被测试触达。
- **t144_gen_f004（minor）→ 维持 minor**。`absolute_time` 透传未彻底：merge 只用 `n.start_time_ms` 判断（dashboard_shared.ts:236），webRequest 主路径 HTTP 请求（`start_time_ms` null、`n.absolute_time` 已派生）与 content 形状（顶层 `absolute_time` ISO）的绝对时间在 inspector 仍为空。显示层面，非阻断。
- **t144_gen_f005（minor）→ 维持 minor**。签名长度项冗余、就地更新漏检，罕见。
- **t144_gen_f007（minor）→ 已登记 p035，关闭**。

### 本轮新发现

### t144_gen_f010 - content hook 形状在 timeline 列表/inspector 字段读取错位，标题/详情/URL 展示为空

- 严重度：minor
- 锚点：AC-006（数据展示与修复前一致）；行为缺陷：content hook 补充的网络请求在 timeline 列表显示无标题、无详情，inspector 来源/URL 错
- 位置：`src/extension/dashboard/dashboard_shared.ts:243`（`data: n`）；`src/extension/dashboard/dashboard_detail.ts:165-168,303-306`（render_dt_list / render_dt_inspector 读 `e.data.*`）
- 问题：content hook 落库为完整 CaptureEvent 形状（`send_event` 组装 `{ ...event, data }`，content_script.ts:268），请求元数据在**内层** `n.data`（NetworkRequestData）。merge 展开后 `e.data` = 整个 CaptureEvent 对象，`e.data.url` / `e.data.method` / `e.data.status_code` 均为 undefined（真实值在 `e.data.data.*`）。render_dt_list 对 network 行读 `d.status_code` 得 undefined → detail 列空（dashboard_detail.ts:165-168）；event_title 读 `d.method` → 标题空；render_dt_inspector 读 `d.source/d.url`（303-306）→ 来源/URL 错位。另合并侧 `url: n.url`（dashboard_shared.ts:237）对 content 形状取顶层 location.href（network_hook.ts:399），非请求 URL。同一请求若同时被 webRequest/CDP 主路径捕获，NetworkRequestData 形状展示正确、content 形状展示为空，两者并列时差异明显。位置与类型显示正确（轨道 tick、rail 计数不受影响），属展示完整性问题，非数据丢失。
- 建议：merge 侧对 content 形状归一化展示 data——`data: ((n as { data?: unknown }).data ?? n)`（NetworkRequestData 形状无内层 data 时用自身；content 形状剥出内层请求数据），并 `url: (n as { data?: { url?: string } }).data?.url ?? n.url`。或删除/合并 content 形状与主路径的重复落库（见未进表提示）。

### 未进表的提示

- content hook 与 webRequest/CDP 主路径对同一请求各落一条（采集架构既有冗余，非 t144 引入），Round 4 已提示；f010 修复若归一化展示 data，建议一并考虑去重（属采集侧范围外，另立 task 处理）。

### 总体判断

f001-f006、f009 全部 blocking finding 已修，f007 登记关闭；剩余均为 minor（f004 absolute_time 显示、f005 签名冗余、f010 content 形状展示字段错位）。无未解决 critical/important，**verdict PASS**。

- 系统性 follow-up：无新增。

### AC 复验披露（Round 5）

- AC-001：re_verified。network/console 轨道事件并入，console/ws/主路径/content hook 四类时间定位均正确（f001/f002/f006/f009）。
- AC-002：re_verified。rail 计数按 event_kind 统计，测试断言 counts.network=1、counts.console=1。
- AC-003：re_verified。空数组不产生 network/console 类型事件，测试覆盖。
- AC-004：re_verified。签名含事件数/最新相对时间/network 与 console 长度/stats，无变化不 render_content；就地更新漏检为 minor（f005）。
- AC-005：re_verified。marker + minimap 拖拽置 `_tl_dragging`，window listener 清理正确；空白区拖拽已登记 p035（f007 关闭）。
- AC-006：re_verified。既有五类事件展开与升序排序与修复前一致；content 形状展示字段错位为 minor（f010）。
- AC-007：trust_prior。未跑测试套件（只读约束）；代码审查确认三既有测试路径未受影响。建议合并前人工跑全量单测（实施方已报 8 测试 + 全量 passed + tsc 干净）。

coverage = 6 / 7

reviewed_scope: fc77e66438733032

verdict: PASS

## Round 6 (2026-08-12 23:40 UTC+8)

### 前轮 finding 复核（以 git diff 1098bc356e1846128b180fdb530a37c168801dba 与当前代码为准）

- **t144_gen_f010（minor）→ 已修**。merge 侧 `data: (n as { data?: unknown }).data ?? n`（dashboard_shared.ts:247-249）：content hook CaptureEvent 形状剥出内层 NetworkRequestData，NetworkRequestData 形状无内层 data 用自身，`e.data.url/method/status_code` 在列表与 inspector 现读取正确；console 形状 `data: c` 不受影响。`url: n.url` 顶层字段对 content 形状仍取 location.href（非请求 URL），但列表/inspector 均走 `e.data.url` 展示，无可见影响，残留可不处置。
- **t144_gen_f001/f002/f003/f006/f009（blocking）→ 维持已修**。未再改动。
- **t144_gen_f004/f005（minor）→ 维持 minor**。absolute_time 透传未彻底、签名长度项冗余，均非阻断。

### 本轮新发现

- 无。f010 修复未引入新问题（data 归一化对 NetworkRequestData 形状无副作用——该类型无顶层 data 字段，`?? n` 正确回退）。

### 指纹说明（重要）

f010 修复改动 `src/extension/dashboard/dashboard_shared.ts`（指纹覆盖的源码文件），当前被审 diff 相对 Round 5 变化。`check_review_status.py` 判 `review_scope=stale`（旧指纹 fc77e66438733032 已失效），overall=INCOMPLETE。本轮按脚本同口径重算当前指纹为 `d8c9c47f0ab5ad32`，下文本轮 reviewed_scope 行为该值。

### 总体判断

f010 已修，全部 blocking finding（f001/f002/f003/f006/f009）确认关闭，f007 登记 p035；剩余 f004/f005 minor 非阻断。**verdict PASS**（本轮指纹已更新，scope 校验通过后 PASS 有效）。

- 系统性 follow-up：无新增。

### AC 复验披露（Round 6）

- AC-001：re_verified。console/ws/CDP primary/webRequest 主路径/content hook 四类时间定位正确（f001/f002/f006/f009）。
- AC-002：re_verified。rail 计数按 event_kind 统计，测试断言 counts.network=1、counts.console=1。
- AC-003：re_verified。空数组不产生 network/console 类型事件，测试覆盖。
- AC-004：re_verified。签名含事件数/最新相对时间/network 与 console 长度/stats，无变化不 render_content；就地更新漏检为 minor（f005）。
- AC-005：re_verified。marker + minimap 拖拽置 `_tl_dragging`，window listener 清理正确；空白区拖拽已登记 p035（f007 关闭）。
- AC-006：re_verified。既有五类事件展开与升序排序与修复前一致；content 形状展示字段错位已修（f010）。
- AC-007：trust_prior。未跑测试套件（只读约束）；代码审查确认三既有测试路径未受影响。建议合并前人工跑全量单测（实施方已报 8 测试 + 全量 passed + tsc 干净）。

coverage = 6 / 7

reviewed_scope: d8c9c47f0ab5ad32

verdict: PASS
