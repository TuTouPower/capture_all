# Task spec

## 背景

content 每次 start 生成 per-start secret，`page_script_preamble()` 把它拼进字符串字面量 `var SECRET = '${secret}'`，经 `<script>` 元素 `textContent` 注入页面 DOM。对抗页面可 hook `appendChild` 或 MutationObserver 读取 secret，配合 page-visible nonce 生成合法 `sig` 伪造采集事件。代码注释「页面脚本无法读取」只成立于不观察注入过程的页面；ADR-020 明确把对抗页面排除在威胁模型外。同时 `docs/specs/content_postmessage_nonce.md` 仍以 nonce 相等为认证检查，与 t121 引入的 per-message HMAC 实现不符。

## 契约区

### 范围

- 纠正文档/代码注释，不再把该 HMAC 描述为可对抗页面。
- 尽可能避免 secret 明文经过页面 DOM（如 `chrome.scripting.executeScript({ world:'MAIN', func, args })` 或静态 web-accessible script）。
- 更新生效 spec 定义 combined nonce + per-start secret + per-message HMAC 契约（secret 生成与非 `window` 暴露、canonical payload 与签名覆盖、缺失/畸形/失配/过期签名拒绝、stop/start 生命周期、三通道实现与测试）。

### 非范围

- 不实现页面级对抗恶意页面的完整威胁模型（若产品需要，另立 task）。
- 不改变现有 HMAC 算法与密钥派生（除非为达成「不经过 DOM」而必要）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：`docs/specs/content_postmessage_nonce.md` 定义 nonce + per-start secret + per-message HMAC 的完整契约，包含 secret 非 `window` 暴露、canonical payload、拒绝缺失/畸形/失配/过期签名。
- [ ] AC-002：secret 不再以可被页面同步读取的字符串字面量出现在 DOM 注入脚本文本中（或注释明确说明残余风险）。
- [ ] AC-003：三通道（network/storage/WebSocket）实现与 HMAC/nonce 测试套件仍通过。
- [ ] AC-004：代码注释与 ADR 对威胁模型边界的描述一致，不宣称可对抗观察注入过程的页面。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001 为文档/spec 变更，用 spec 一致性静态检查可测；AC-002/003/004 用内容脚本注入测试 + 既有 HMAC/nonce 测试。

## 上下文区

- 来源：SEC-005、TD-006（2026-08-13 核实，`849b739` t121 引入 HMAC，`4cf960b` 抽取模板，ADR-020 记录威胁模型排除）。

### 有意不测

- 无。

### 测试策略

- 断言注入脚本文本不含明文 secret；复用既有 HMAC 向量测试保证签名契约不变。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- `chrome.scripting.executeScript` MAIN world `func,args` 传递 secret 的暴露面：结论=不落 DOM 文本但需新增 `scripting` 权限，且页面级对抗仍可观察（s007 spike + d009 findings，2026-08-13 已核实）；t174 采用注释残余风险 + spec combined 契约路径，executeScript 迁移不采纳。

### 风险与回退

- 风险：迁移注入方式破坏现有 HMAC 签名兼容。
- 回退：保留算法，仅改传输方式；若不可行则明确残余风险并更新注释/spec，不宣称对抗。

### 依赖与约束

- 依赖 t121 既有 HMAC 实现，保持签名契约向后兼容。

### Finalization 时更新的 blueprint

- `docs/specs/content_postmessage_nonce.md`：更新为 combined 契约。
- `docs/blueprint/decisions.md`：如调整 ADR-020 边界，同步。
