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
只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。
<!-- /规范 -->

- [ ] AC-001：`docs/specs/content_postmessage_nonce.md` 定义 nonce + per-start secret + per-message HMAC 的完整契约，包含 secret 非 `window` 暴露、canonical payload、拒绝缺失/畸形/失配/过期签名。
- [ ] AC-002：secret 不再以可被页面同步读取的字符串字面量出现在 DOM 注入脚本文本中（或注释明确说明残余风险）。
- [ ] AC-003：三通道（network/storage/WebSocket）实现与 HMAC/nonce 测试套件仍通过。
- [ ] AC-004：代码注释与 ADR 对威胁模型边界的描述一致，不宣称可对抗观察注入过程的页面。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- AC-001 为文档/spec 变更，用 spec 一致性静态检查可测；AC-002/003/004 用内容脚本注入测试 + 既有 HMAC/nonce 测试。

## 上下文区

- 来源：SEC-005、TD-006（2026-08-13 核实，`849b739` t121 引入 HMAC，`4cf960b` 抽取模板，ADR-020 记录威胁模型排除）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 断言注入脚本文本不含明文 secret；复用既有 HMAC 向量测试保证签名契约不变。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
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
