# Task review t127（reviewer_focus: 代码）

- task：`t127_content_capture_state_factory`
- spec：`docs/tasks/t127_content_capture_state_factory/spec.md`
- diff_anchor：`5f985fbe01996d1fd8e884075d84e847261e07d7`
- target：`git diff 5f985fbe01996d1fd8e884075d84e847261e07d7`
- round：1
- reviewed_at：2026-08-11 21:30 UTC+8

## Findings

本轮 0 finding（clean review）。

## 结论

- 本轮新发现：0 条
- 未进表的提示：
  - 文件过大：无。范围内最大 `src/extension/content/content_event_utils.ts` 83 行，其余模块均 < 200 行，远低于 400 阈值。
  - 复杂度：无。`begin`/`end`/守卫均为 O(1) 单分支，无新增嵌套。
  - 范围外观察：`clipboard_capture.ts` / `dom_capture.ts` / `storage_capture.ts` / `network_hook.ts` / `websocket_capture.ts` / `content_script.ts` 仍保留同构状态样板，但 spec 范围仅约束 9 模块且「可纳入」为可选项，不构成缺陷；建议 follow-up 统一。
  - 另注：`mouse_capture` / `form_submit_capture` / `keyboard_capture` 的模块级 `config` 在 `begin` 之后赋值，安全前提为「单线程 + `addEventListener` 不同步触发 + handler 均以 `is_capturing` 前置守卫」。当前无失败场景（begin 与 config 赋值间无异步间隙，监听器注册在其后），仅依赖隐式不变量，不阻断。
  - `visibility_capture.ts` 局部变量 `state` 改名 `vis_state`：为规避遮蔽工厂新引入的 `state` 而做的必要重命名，三目表达式语义逐字保留。
- 总体判断：机械式状态样板抽取，9 模块业务逻辑逐 diff 核对保留，重入/复位语义等价，全量测试与类型检查通过。
- 系统性 follow-up：建议标题「extend create_capture_state to remaining content capture modules」，slug `extend_capture_state_factory`，阻断性：非阻断。

### AC 复验方式

- AC-001（9 模块不再各自声明重复状态变量组）：`re_verified`。`grep -rn "let is_capturing|let capture_id|let _send_event" src/extension/content/` 命中仅剩未迁移模块与工厂内部；9 目标模块（scroll/focus/resize/visibility/fullscreen/print/form_submit/mouse/keyboard）零残留。
- AC-002（重入守卫与 stop 复位行为不变）：`re_verified`。重跑 `npx vitest run tests/unit/content_capture_state.test.ts` 5/5 通过（重复 begin 不覆盖、end 复位后可再 begin、未激活 end 返回 false）；逐模块 diff 核对 start/stop 守卫等价（原 `if (is_capturing) return;` + 手工赋值 + `is_capturing = true` → `if (!state.begin(...)) return;`；原 `if (!is_capturing) return; is_capturing = false;` → `if (!state.end()) return;`）。
- AC-003（相关测试与全量测试绿、tsc 通过）：`re_verified`。`npx vitest run` 130 files / 1373 tests 全绿；`npx tsc --noEmit` exit 0。

coverage = 3 / 3

## 评审纪要（代码轴逐项）

- `create_capture_state<TData>` 工厂：泛型 sender 正确；`begin` 先守卫后写入，`is_capturing ⟹ send_event != null` 不变量成立；`end` 复位 `is_capturing` 并清 `send_event`，比原实现（仅清 is_capturing）更严格且安全；getter 均只读，`state` 为各模块私有，无外部暴露。
- keyboard 守卫重排：原（is_capturing 检查 → mode 检查）与新（mode 检查 → begin 内 is_capturing 检查）均为纯守卫、无副作用，重排行为中性；`config` 仅在两守卫均过时赋值，语义不变。
- `send_event → state.sender?.(...)`：可选调用安全。所有调用点均先过 `state.is_capturing` 守卫，捕获中 sender 必非空；`?.` 为防御冗余而非语义弱化。
- 9 模块业务逻辑（监听器、debounce/RAF、xpath/selector、redaction、数据构建）逐 diff 确认未改动，仅状态样板替换。

reviewed_scope: fabc439fd801a51d

verdict: PASS
