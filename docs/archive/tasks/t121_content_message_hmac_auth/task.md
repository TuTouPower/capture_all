# Task spec

## 背景

content 采集认证依赖存于页面 MAIN world `window.__capture_all_*_nonce__` 的 nonce，页面脚本可直读直写、伪造匹配消息使采集门控退化；后台从不校验 nonce（仅 content 侧防碰撞）。t097 曾评估「更强抗伪造需 per-message HMAC，超出本 task」。用户于 2026-08-11 确认采用 **per-message HMAC** 方案：注入脚本持 secret，每条采集消息携带签名，页面无法伪造。

## 契约区

### 范围

- 将 network_hook / websocket_capture / storage_capture 三通道的静态 nonce 门控升级为 per-message HMAC 认证。

### 非范围

- 不改变采集消息 schema 之外的结构（payload 内容不变）；不改变 content→后台写路径（扩展内部消息）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：采集消息携带 per-message HMAC 签名（注入脚本持 secret 计算）；仅读取 window nonce 的页面脚本无法构造合法签名。
- [ ] AC-002：content 侧校验签名，签名不匹配或缺失的消息被拒收（不进入采集）。
- [ ] AC-003：每次 start 旋转 secret（及 nonce），跨采集旧签名失效。
- [ ] AC-004：network / ws / storage 三通道统一采用签名认证，原「非签名消息被拒」门控语义不回归。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试（jsdom + Web Crypto HMAC；注入脚本逻辑经 mock/vi 执行验证签名构造与校验）。

## 上下文区

- 来源：p010（2026-08-11 核实仍在；用户确认 per-message HMAC 方案）

### 有意不测

- 无。

### 测试策略

- Web Crypto：jsdom 环境 mock `crypto.subtle`（HMAC-SHA256）确定性注入；签名构造与校验分开断言。
- 注入脚本与 content 隔离域共享 secret 的通道（window 属性或消息传递）按实现确定，测试覆盖 secret 不外泄给页面 MAIN world 的场景。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- ~~注入脚本与 content 隔离域共享 secret 的通道~~ → 已定：content 每次 start 生成 secret，内联进注入脚本闭包（不写 window），注入脚本持 secret 签名、content 持同一 secret 校验；每次 start 重注入（还原上次 hook 后重装）以持有最新 secret。威胁模型边界见 `docs/blueprint/decisions.md` ADR-020。

### 风险与回退

- 风险：secret 共享通道若回退到 window 全局则未解决伪造面；需保持 secret 仅注入脚本持有。
- 回退：git 回退；t097 现有 nonce 测试保留为回归基线。

### 依赖与约束

- 依赖 t097（content postMessage 全通道 nonce）实现落地；安全敏感，实施期须在 `.scratch/` 验证再落生产。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：记录 content 采集认证升级为 per-message HMAC 的取舍（若替代 t097 的 window-nonce 决策）。
