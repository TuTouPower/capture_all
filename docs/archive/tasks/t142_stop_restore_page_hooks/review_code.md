# Task review t142（reviewer_focus: 代码）

- task：`t142_stop_restore_page_hooks`
- spec：`docs/tasks/t142_stop_restore_page_hooks/spec.md`
- diff_anchor：`51e0843c0bff79665b8d2e166edc584b7da11f22`
- target：`git diff 51e0843c0bff79665b8d2e166edc584b7da11f22`
- round：1
- reviewed_at：2026-08-12 19:20 UTC+8

## Findings

### t142_code_f001 - restore 与 content 侧 state.end() 耦合：状态丢失路径下 stop 不还原 MAIN world hook

- 严重度：minor
- 锚点：AC-001 边缘路径；行为缺陷——扩展/内容脚本状态丢失而 MAIN world hook 残留时，stop 不还原，fetch/XHR/ws 持续读 body（H-13 危害未消除）
- 位置：`network_hook.ts:407`、`websocket_capture.ts:234`、`storage_capture.ts:203`（三个 stop 内 `if (!state.end()) return;` 均先于 `restore_page_script()`）；触发侧 `content_script.ts:132-135`
- 问题：MAIN world 的 hook 存在性与 content 侧 `is_capturing` 状态是两个独立域，但 restore 的执行被绑死在 `state.end()` 返回 true（即「本 content 实例曾 begin」）上。失败场景：扩展刷新/内容脚本重注入后（page script 生命周期独立于 content script，MAIN world hook 仍残留），此时对 network 模块调 stop（如 `content_script.ts:133-134` 的 `capture_network=false` 分支显式调 `stop_network_hook()`），`state.end()` 返回 false → 提前 return → 不执行 restore，hook 继续 clone/读 body 且无 consumer。restore 脚本本身已有 `installed` 标记守卫，未安装时是 no-op，故无条件调用不会引入副作用。
- 建议：将 `restore_page_script()` 与 `state.end()` 解耦——stop 入口无条件调用（置于状态判断之前或 after removeEventListener），依赖 MAIN world `installed` 标记自守卫。

### t142_code_f002 - storage_capture restore 手写整段模板，未复用 page_script_restore 公共助手

- 严重度：minor
- 锚点：DRY——同一 restore 模板两份实现已产生行为分叉（storage 版带 per-prop 守卫，共享模板版无）
- 位置：`storage_capture.ts:124-136` vs `content_page_script.ts:29-38`；对照 `network_hook.ts:323`、`websocket_capture.ts:165` 均走 `page_script_restore(signal, restore_body)`
- 问题：network_hook/websocket 复用 `page_script_restore` 助手，storage 却把整段 `if(installed){var prev...delete...}` 模板内联复制。两处已分叉：storage 版对 6 个方法逐一 `if (prev.xxx)` 守卫（更保守），助手版仅 `if (prev)`。共享模板将来若增删通用守卫/清理逻辑，storage 副本不会跟随，形成修复遗漏点。storage 完全可用 `page_script_restore('storage', '<6 行带 per-prop 守卫的 restore_body>')` 收敛到单一模板。
- 建议：storage_capture 改用 `page_script_restore` 助手，把 6 行守卫语句作为 `restore_body` 传入。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（Round 1）
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
  - 文件过大：`network_hook.ts` 413 行 ≥ 实现源码 minor 阈值 400（本 task 净增 16 行），未超 important 800；建议后续拆分，非本 task 阻塞。
  - 范围外观察（预存在 T121 代码，非本 diff）：`storage_capture.ts:30-40` 的 reinstall guard 直接赋 `prev_hook.local_setItem` 等，无 per-prop 守卫——若某次 `wrap()` 部分失败（如 sessionStorage 访问抛 SecurityError），reinstall 会向 API 属性赋 `undefined`。本 task 新增的 restore 反而带守卫，形成不对称；建议 follow-up 补守卫或复用同一守卫模式。
  - `tests/unit/t142_stop_restore_page_hooks.test.ts` 为 untracked（不在 `git diff 51e0843` 范围内）；测试层评审属 test reviewer 职责，仅提示。
- 总体判断：核心还原语义正确（prev 还原点与 hook 逐项对应、MAIN world 注入方案必要且非过度设计、installed/prev 清理后重 start 重存 prev 正常、注入 try/catch 保证静默降级），仅 2 条 minor，无未解决 critical/important，PASS。
- 系统性 follow-up：建议「storage_capture reinstall guard 补 per-prop 守卫」标题与 slug `storage_reinstall_guard_per_prop`；非阻断。
- AC 复验方式：
  - AC-001（stop 后还原为原始实现）：`re_verified` — 代码追踪：三模块 stop 均调 `restore_page_script()`，network 还原 fetch/open/send、ws 还原 WebSocket、storage 还原 6 方法，还原目标即注入时保存的 prev，restore 后 API 等于捕获前原实现；正常 stop 路径（`state.end()`==true）下执行。边缘状态丢失路径见 f001。
  - AC-002（采集进行中 hook 行为不变）：`re_verified` — diff 对 start/注入路径仅增 import，hook 本体未改；行为变更只落在 stop 侧。
  - AC-003（还原失败静默降级）：`re_verified` — `restore_page_script` 整体 try/catch 吞错；注入脚本内 `installed`/`prev` 守卫 + 赋值/`delete` 不抛错，注入失败静默。
  - coverage = 3/3

verdict: PASS

reviewed_scope: 887c1f6f687bb8dc

## Round 2 (2026-08-12 19:22 UTC+8)

- 前轮 finding 复核（以 `git diff 51e0843c` 为准，非采信 implementer 自述）：
  - **t142_code_f001 — 已消除**。三模块 stop 中 `restore_page_script()` 均已移至 `state.end()` 之前无条件调用（diff 确认：`network_hook.ts:407`、`websocket_capture.ts:234`、`storage_capture.ts:198`，restore 均先于 `if (!state.end()) return;`）。状态丢失路径下 stop 现能还原 MAIN world 残留 hook；restore 脚本自带 `installed` 守卫，无条件调用对未安装场景为 no-op，无副作用。stop→start 连续性不受影响：stop 还原并删 installed/prev，start 的 reinstall guard 见 installed=false 直接重装重存 prev。
  - **t142_code_f002 — 已消除**。`storage_capture.ts` 现 `import { page_script_restore }`（diff 确认新增 import 行），restore 用 `page_script_restore('storage', '<6 行 per-prop 守卫 restore_body>')` 收敛到共享模板，与 network_hook/websocket 一致；per-prop 守卫语义保留。
- 修复引入的新问题扫描：restore 置于 removeEventListener 之前执行，restore 后 hook 已还原、无 postMessage 源，随后移除 listener，顺序无关；restore 与 content 侧 state 无依赖、幂等，无新缺陷。
- 独立验证：`npx tsc --noEmit` EXIT=0，类型干净（无副作用命令）。
- 本轮新发现：0
- 未进表的提示：
  - 范围外观察（预存在 T121 代码，非本 diff）：`storage_capture.ts:31-40` 的 reinstall guard 仍为无 per-prop 守卫版本，与新 restore 的守卫版本不对称；若某次 `wrap()` 部分失败（如 sessionStorage 访问抛 SecurityError），reinstall 会向 API 属性赋 `undefined`。建议 follow-up，非本 task 阻塞。
  - 测试 `tests/unit/t142_stop_restore_page_hooks.test.ts` 仍为 untracked（不在 `git diff 51e0843c` 范围），全量 passed 系 implementer 自述，未独立重跑（read-only 边界），测试层归 test reviewer。
- 总体判断：前轮 2 条 minor 均已按建议修复且未引入新问题，无未解决 critical/important，PASS。
- AC 复验方式（本轮 diff 确认修复未改 AC 覆盖）：AC-001/002/003 均 `re_verified`，coverage = 3/3。
- 指纹更新：test 轴补 stop 接线断言后 diff 变化，`check_review_status.py` 判 review_scope=stale。当前指纹范围内 diff（4 个 src 文件，exclude task.md/review_*/handoff.json）与本轮代码复核所见完全一致（f001/f002 修复后状态，65 insertions/2 deletions），代码轴复核结论仍成立，verdict 维持 PASS。reviewed_scope 用脚本同口径重算为 `cde15ef869363513`。

verdict: PASS

reviewed_scope: cde15ef869363513
