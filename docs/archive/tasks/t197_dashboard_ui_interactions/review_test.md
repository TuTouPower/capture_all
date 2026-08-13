# Task review t197（reviewer_focus: 测试）

- task：`t197_dashboard_ui_interactions`
- spec：`docs/tasks/t197_dashboard_ui_interactions/spec.md`
- diff_anchor：`d188458404aafa22f7560a0e99a4c44358d18c18`
- target：`git diff d188458404aafa22f7560a0e99a4c44358d18c18`
- round：1
- reviewed_at：2026-08-14 04:45 UTC+8

## Findings

### t197_test_f001 - AC-003 network resize 测试 vacuous：`if (!handle) return;` 静默通过，`wire_network_resize` 从未执行

- 严重度：important
- 锚点：AC-003（`wire_network_resize` pointercancel/mouseleave 清理拖拽状态的 jsdom 行为测试）
- 位置：`tests/unit/dashboard_ui_interactions.test.ts:110-124`（network 测试；`if (!handle) return;` 在 :118）
- 问题：该测试 setup 下 `.dt-insp-handle` 不存在，测试无任何断言即 PASS。证据链：
  1. `render_detail()` 的 network 分支（`src/extension/dashboard/dashboard_detail.ts:100-103`）要求 `dt_tab === 'network'` 才渲染 `.dt-network-body`/`.dt-insp-handle`（`show_net_insp = !dt_net_insp_closed && detail_network.length > 0`）。
  2. 本测试文件无任何 `set_dt_tab(...)` 调用，`dt_tab` 保持默认 `'timeline'`（`dashboard_state.ts:41`），故 `render_detail()` 走 timeline 分支，`.dt-insp-handle` 为 null。
  3. 独立探针复验（`.scratch/review_probe_t197.test.ts`，同款 setup 含 `set_detail_network([...])`）：输出 `insp-handle=false rail-handle=true network-body=false`，确认 handle 缺失。
  4. 实测 `npx vitest run tests/unit/dashboard_ui_interactions.test.ts` 6/6 全绿——network 测试靠提前 return 变恒真通过。
  命中危险模式「条件跳过弱化断言」（前置不满足时无证据仍 PASS），最低 important。
- 建议：测试开头 `set_dt_tab('network')`（可加 `set_dt_net_sel(0)`）使 handle 渲染，并将 `if (!handle) return;` 替换为硬断言 `expect(handle).toBeTruthy();`。rail 测试（:102）同款守卫当前非 vacuous（rail-handle 恒渲染于 timeline 分支，`dashboard_detail.ts:112-113,144`），但该守卫会掩盖布局回归，建议一并替换为硬断言。

### t197_test_f002 - AC-002 用源码文本断言替代行为测试，批量删除中途失败路径未执行

- 严重度：important
- 锚点：AC-002（批量删除中途失败后，selected 集合不再含已删除成功的 capture）
- 位置：`tests/unit/dashboard_ui_interactions.test.ts:81-95`
- 问题：两个测试均为 `readFileSync` 读源码后的静态文本断言，不执行生产逻辑、不经界面/接口/存储效果验证：
  - `expect(batch).toMatch(/selected\.delete\(id\)/)`（:84）——`selected.delete(id)` 出现在 batchDel 块内即通过；
  - `expect(del_idx).toBeGreaterThan(fail_idx)`（:88）——源码文本中 delete 行在 fail alert 行之后；
  - `expect(src).toMatch(/get_selected\(\)\.delete\(id\)/)`（:94）——纯存在性断言，行为已被 t154 真测，属冗余静态断言。
  AC-002 的可观察行为（部分失败后 `get_selected()` 不含已删项、含未处理项）未被执行验证；源码顺序≠执行语义（如 delete 使用错误 id、循环结构重写后文本仍匹配）。行为级测试完全可行且仓库已有先例：`tests/unit/t154_dashboard_misc.test.ts:138-161` 对 `del_capture` mock `send_ui_message`（系统边界，`src/shared/message_contract`）+ `confirm` 后直接断言 `get_selected()` 状态。batchDel 同理：mock `send_ui_message` 首项 success、次项 fail，`render_captures()`+`wire_captures()`（均 export）挂 DOM 后派发 `#batchDel` click，断言 selected 集合内容。命中危险模式「纯存在性断言（当 AC 证据）」「生产逻辑不可达」。
- 建议：改写为行为级测试（t154 同款 mock 模式），删除源码文本断言；del_capture 冗余断言可直接删。

### t197_test_f003 - AC-001「拖拽期间无中间 render_content」无断言，pointerdown 立即 render 回归无法捕获

- 严重度：important
- 锚点：AC-001（「2s 轮询不打断拖拽（无中间 render_content 干扰 seek）」）及 spec 范围第 1 条（「pointerdown 不再直接调 `render_content()`」）
- 位置：`tests/unit/dashboard_ui_interactions.test.ts:46-68`（AC-001 测试 1）
- 问题：`expect(render_content).toHaveBeenCalled()`（:67）在 pointercancel 之后断言，对旧行为（pointerdown 时即调用 `router.render_content()`——本 task 删除的那行，见 diff）同样通过：该断言无法区分「pointerdown 立即 render（seek 读 detached overlay 失效）」与「拖拽结束统一 render」。若回归重新在 pointerdown 加回 render_content，本测试仍全绿。`get_tl_dragging()` 生命周期断言（:63/:66）是真实验证（对修复前代码会红），但「拖拽期间无中间 render_content」这一 AC-001 明列属性无任何断言覆盖；该属性正是本 task 核心修复动机（p035 的 seek 干扰）。命中「测试存在但对该 AC 属性验证为空」的覆盖缺口。
- 建议：pointerdown 派发后加 `expect(render_content).not.toHaveBeenCalled()`，pointercancel 后改为 `expect(render_content).toHaveBeenCalledTimes(1)`。

### t197_test_f004 - rail 测试名声称「listener 解绑」但未断言解绑

- 严重度：minor
- 锚点：AC-003（覆盖扩展，非阻断）
- 位置：`tests/unit/dashboard_ui_interactions.test.ts:99-108`
- 问题：测试名「（active 移除 + listener 解绑）」，实际仅断言 `active` class 移除（:104/:107），未验证 `mousemove`/`mouseup` listener 已解绑（pointercancel 后派发 `mousemove`，若未解绑宽度会继续变化）。
- 建议：cancel 后派发 `mousemove` 断言 `body.style.gridTemplateColumns` 不变，或删除测试名中「listener 解绑」表述。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：Round 1 无前轮。
- 改测方向复核：无（本 diff 未修改任何既有测试，仅新增）。
- 本轮新发现：4 条（3 important + 1 minor）。
- 未进表的提示：
  - 既有测试 `tests/unit/dashboard_timeline_marker.test.ts:395` 注释「normal-lane 拖拽（非 marker 区域）不置标记」随 t197 语义变更已过时（空白区拖拽现置 `_tl_dragging`），断言仍通过（cancel 后为 false），建议 implementer 后续顺带更新注释（范围外，未改测试）。
  - AC-003 的四组合（rail/network × pointercancel/mouseleave）中 rail 只测 pointercancel、network 只测 mouseleave；两 handler 绑定事件一致，各测一个清理事件属可接受抽样，f001 修复后无需补齐另两个组合。
  - AC-002 源码断言的分割键 `"c.querySelector('#batchDel')"` 对选择器重命名脆弱（会假红），非 fake-green 方向，未单独出 finding。
- 总体判断：AC-003 network 侧测试 vacuous（生产逻辑未触达）、AC-002 用源码静态断言替代可行为化验证、AC-001 无中间 render 属性无断言——3 个 important 未解决，FAIL。
- 系统性 follow-up：无。

### AC 复验方式

- AC-001：`re_verified`——运行 `npx vitest run tests/unit/dashboard_ui_interactions.test.ts`（6/6 绿）并逐条读断言：flag 生命周期经真实 pointerdown/pointercancel/pointerup 事件验证；「无中间 render_content」属性缺口见 f003。
- AC-002：`re_verified`——测试运行通过且逐条读断言确认：均为 `readFileSync` 源码文本断言，中途失败行为未执行验证（f002）。
- AC-003：`re_verified`——rail 侧（pointercancel）经真实 DOM 事件验证；network 侧经 `.scratch/review_probe_t197.test.ts` 探针复验 handle 缺失、测试 vacuous（f001）。
- AC-004：`re_verified`——`npx vitest run tests/unit/` 全量 201 文件 1907 测试全绿，无回归；新增 6 测试全绿（含 1 条 vacuous，f001）。
- 覆盖率：`coverage = 4 / 4`

reviewed_scope: 8a5760f2b72fd55c

verdict: FAIL


## Round 2 (2026-08-14 05:00 UTC+8)

- task：`t197_dashboard_ui_interactions`
- spec：`docs/tasks/t197_dashboard_ui_interactions/spec.md`
- diff_anchor：`d188458404aafa22f7560a0e99a4c44358d18c18`
- target：`git diff d188458404aafa22f7560a0e99a4c44358d18c18`
- round：2
- reviewed_at：2026-08-14 05:00 UTC+8

## Findings

### t197_test_f005 - f004 修复取值落 MIN_W 钳制区，jsdom 下「listener 解绑」断言对解绑不敏感

- 严重度：minor
- 锚点：AC-003 覆盖增强未达最优（非阻断；前轮 f004 修复质量复核产出）
- 位置：`tests/unit/dashboard_ui_interactions.test.ts:186-191`
- 问题：f004 要求的「cancel 后派发 mousemove 断言宽度不变」已加上（方向正确），但取值落入宽度钳制区使断言对「解绑」属性不敏感。证据链（探针 `.scratch/probe_f004_round2.test.ts` 实证，用后已删）：
  1. jsdom 下 `rail.getBoundingClientRect().width = 0`（探针打印 `rail rect width = 0`），mousedown 闭包 `startWidth = 0`、`startX = 100`。
  2. 拖拽中 mousemove(150)：`w = clamp(0 + 50, 160, 480) = 160` → `gridTemplateColumns = '160px 1fr'`（探针确认）；after_cancel 同为 `160px 1fr`。
  3. cancel 后 mousemove(200)：若 listener **未解绑**，按生产 onMove 公式 `clamp(0 + 100) = 160` → 仍输出 `160px 1fr`，与 after_cancel 相同（探针输出 `未解绑时 mousemove(200) 应输出 -> 160px`）。
  4. 即当前断言 `expect(body.style.gridTemplateColumns).toBe(after_cancel)`（:191）在 jsdom 下无论 mousemove listener 是否解绑都绿——对「解绑」属性验证为空。
  active class 移除断言（:188）仍真实覆盖 AC-003 核心「清理拖拽状态」；真实浏览器下 rail rect 非 0、断言有效，故不满足 blocking 硬阈值，定 minor。
- 建议：cancel 后 mousemove 的 clientX 取超出钳制区的值（如 `clientX: 100 + 400`，dx=400 → 输出 `400px 1fr` ≠ after_cancel `160px 1fr`，未解绑即红），或先用显式宽度（如 `480px 1fr`）再测。

## 结论

- 前轮 finding 复核（以 diff 与代码/运行为准，不采信处置表自述）：
  - t197_test_f001（important）：**已消除**。network 测试加 `set_dt_tab('network')`（`tests/unit/dashboard_ui_interactions.test.ts:195`）+ `set_detail_network([...])`（:197），`if (!handle) return;` 替换为硬断言 `expect(handle).toBeTruthy()`（:203，且位于 `wire_detail()` 之前、直接断言渲染产物）；rail 测试同加硬断言（:178）。生产渲染条件核查通过：`dashboard_detail.ts:101-103` 要求 `dt_tab==='network' && !dt_net_insp_closed && detail_network.length > 0`，`dt_net_insp_closed` 默认 false（`dashboard_state.ts:50`），测试三项全满足。反向性：handle 若缺失，toBeTruthy 红 + `handle.dispatchEvent`（:205）在 null 上抛 TypeError，非 vacuous。事件目标与生产一致（document mouseleave，`dashboard_detail.ts:622`）。
  - t197_test_f002（important）：**已消除**。源码文本断言已删，改写为行为级（:124-150 部分失败 / :152-171 全成功）：mock 通道核实为系统边界——生产 batchDel（`dashboard_captures.ts:175-189`）调 `send_ui_message('delete_capture', {capture_id})`，`send_ui_message`（`message_contract.ts:109-114`）内部即 `chrome.runtime.sendMessage({action, payload})`，与测试 mock 的 `send_message_mock` 形态一致。生产逻辑真实触达：`for (const id of selected)` 循环、`resp?.success` 判断、成功项即时 `selected.delete(id)`（:186）、失败项 alert + 提前 return；断言存储效果 `get_selected().has('a')=false`（:147）/ `has('b')=true`（:148）/ alert（:149）。`expect(send_message_mock).toHaveBeenCalledWith(objectContaining({action:'delete_capture'}))`（:146）作 mock 命中 guard。反向性：若生产 :186 缺失（旧行为），:147 红。非假绿。
  - t197_test_f003（important）：**已消除**。pointerdown 后新增 `expect(render_content).not.toHaveBeenCalled()`（:106），pointercancel 后改为 `toHaveBeenCalledTimes(1)`（:110，比旧 `toHaveBeenCalled` 更严格，同时防 finish 重复触发）。生产核查：`dashboard_detail.ts:743-756` pointerdown 分支仅 seek + set_dt_insp_open（无 render_content），finish_lane 单次 render_content。反向性：回归在 pointerdown 加回 render_content 则 :106 红。
  - t197_test_f004（minor）：**修不彻底**——方向正确（cancel 后派发 mousemove 断言宽度不变，:189-191）但取值落 MIN_W 钳制区，jsdom 下对「解绑」属性不敏感，见 f005。
- 改测方向复核：无「迁就实现」的改测。本轮测试修改全部为响应 finding 的强化（硬断言、行为化、加属性断言、加解绑验证），方向与 Round 1 建议一致；本 diff 未触碰任何既有测试。
- 本轮新发现：1 条（minor，f005）。
- 未进表的提示：
  - 状态隔离脆弱：`beforeEach`（:80-84）不清 `get_selected()`（Set 跨测试残留）与 `dt_tab`/`detail_network` 等模块状态；当前文件内顺序下无碍（AC-002 全成功测试重新 add 后清空、network 测试最后运行），后续新增测试有隐性耦合风险。
  - AC-001 轮询侧：测试均传 `is_tl_dragging: () => false`（:66/:91/:138/:162），未用 fake timers 直接驱动 2s 轮询验证「轮询周期内跳过 render」；但轮询判断（`dashboard.ts:145`）为既有代码，t197 仅置位 `_tl_dragging`（已由 `get_tl_dragging()` 断言验证置位/清理），覆盖可辩护，属「可再加 case」。
  - `as never`（:197）类型断言绕过 NetworkRequestData 校验，运行时无碍。
  - AC-003 四组合抽样（rail×pointercancel / network×mouseleave）维持 Round 1 判定：两 handler 事件绑定一致，各测一个清理事件可接受。
- 总体判断：3 个 important（f001/f002/f003）经代码核查、运行验证与反向性推理确认真实消除，无未解决 critical/important；仅 1 条 minor（f005，f004 修复取值不敏感），PASS。
- 系统性 follow-up：无。

### AC 复验方式（Round 2）

- AC-001：`re_verified`——重跑 `npx vitest run tests/unit/dashboard_ui_interactions.test.ts` 6/6 绿；逐条核对断言与生产 `wire_lane_pointerdown`（:741-756）；反向性推理（回归加回 pointerdown render 则 :106 红）。
- AC-002：`re_verified`——重跑绿；通道链核查（`#batchDel` handler → `send_ui_message` → `chrome.runtime.sendMessage` mock）；断言存储效果；mock 命中 guard（:146）。
- AC-003：`re_verified`——重跑绿；生产渲染条件核查（`dashboard_detail.ts:101-103`）；rail/network 两测试真实 DOM 事件验证 active 清理；f004 解绑断言经 `.scratch` 探针实证 jsdom 下不敏感（f005）。
- AC-004：`re_verified`——`npx vitest run tests/unit/` 201 文件 1907 测试全绿，与 Round 1 基线一致，无回归。
- 覆盖率：`coverage = 4 / 4`

reviewed_scope: 5bd6d493a4d5e42a

verdict: PASS
