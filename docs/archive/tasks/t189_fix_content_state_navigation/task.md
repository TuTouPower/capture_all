# Task spec

## 背景

content 采集存在多处正确性缺陷：SPA 导航只监听 `popstate`/`hashchange`，`pushState`/`replaceState` 不派发事件，back/forward 又被标成 `push_state`；`all_frames` 下 iframe 事件大多 `frame_id=0`；CSS selector 生成 `:nth-child` 计数错误且未 `CSS.escape`；fallback fetch 对 `Request` 对象携带 method 时误记 `GET`；content status 轮询 one-shot 且允许 stop/in-flight 重启竞态；timeline lane 拖拽缺 `pointercancel`/`lostpointercapture` 清理导致详情轮询永久跳过刷新。

## 契约区

### 范围

- 修补 `history.pushState`/`replaceState`（MAIN world，复用既有认证 page-script channel），`RouteChangeData.route_action` 增加 back/forward 或独立触发字段。
- iframe 事件使用 `sender.frameId` 或按 content-script 实例传入 `frame_id`。
- selector 生成用 `:nth-of-type`/正确 child index 且 `CSS.escape` 标识符。
- fallback fetch 正确解析 `Request` 的 method。
- content 状态轮询改为可重启生命周期 + in-flight guard。
- timeline lane 拖拽统一 `finish_drag()` 处理 `pointerup`/`pointercancel`/`lostpointercapture`/blur。

### 非范围

- 不实现跨域 iframe 的 frame 归属（仅平台 `sender.frameId` 可用时使用）。
- 不改变 fallback hook 的 body 门控与 postMessage 认证（见 t174）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：页面调用 `history.pushState`/`replaceState` 产生 `route_change` 事件，back/forward 不再标为 `push_state`。
- [ ] AC-002：iframe 事件带真实 `frame_id`（平台可用时），不同 frame 可区分。
- [ ] AC-003：`document.querySelector(generated_selector) === target` 对含特殊字符 ID/class 与 nth 场景成立。
- [ ] AC-004：`fetch(new Request('/api',{method:'POST'}))` 的 fallback 记录 method 为 `POST`。
- [ ] AC-005：content 状态轮询在 stop 后可重启，且在 stop 与 in-flight 响应竞态下不重启 hooks/listener。
- [ ] AC-006：timeline lane 拖拽 `pointercancel`/`lostpointercapture`/blur 后清理 drag 状态并恢复详情刷新。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：jsdom/browser 行为测试 + 单测（selector round-trip、fetch method、轮询 deferred）。

## 上下文区

- 来源：EXTUI-004、EXTUI-005、EXTUI-006、EXTUI-007、EXTUI-003、EXTUI-008（2026-08-13 核实）。

### 有意不测

- 无。

### 测试策略

- selector 用 round-trip `querySelector === target`；fetch method 用 `Request` fixture；轮询/拖拽用 deferred + 事件模拟。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- `sender.frameId` 在各 target 类型下的可用性：结论=content script 经 `chrome.runtime.onMessage` 发送消息时 `sender.frameId` 恒可用（MV3 平台保证，`MessageSender.frameId: number`，主 frame=0，子 frame>0；2026-08-13 按 chrome.runtime API 文档核实——onMessage sender 携带发送 frame 的 frameId，非跨域 iframe 也适用）。background 侧 listener 直接读取；content 内部事件以 start 消息的 sender.frameId 替代现随机数。

### 风险与回退

- 风险：修补 `history.pushState` 破坏页面既有行为。
- 回退：restore patches on stop（沿用既有 page-script 恢复模式）。

### 依赖与约束

- 复用 t174 的认证 page-script channel 模式。

### Finalization 时更新的 blueprint

- `docs/blueprint/domain.md`：如扩展 `RouteChangeData.route_action` 枚举，同步。
