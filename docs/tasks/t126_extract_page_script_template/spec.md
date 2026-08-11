# Task spec

## 背景

`network_hook.ts` 的 `build_page_script`（265 行）与 `websocket_capture.ts` 的 `build_page_script`（110 行）是同构注入脚本构造器：T121 重注入还原（`__capture_all_*_installed__` / `__capture_all_*_prev__` 守卫）、HMAC 签名发送（`post` / `sign_str(SECRET, ...)` / nonce）、`window.postMessage` 上报。`SYNC_HMAC_JS` 已在 `content_hmac.ts:150` 正确共享，但还原模板与 post 发送逻辑仍双份维护。审阅确认两处同构。

## 契约区

### 范围

- 抽取两处 `build_page_script` 的同构片段（重注入还原模板、HMAC 签名发送 post 逻辑）为共享模板。
- 共享模板落点优先 `content_hmac.ts`（HMAC 权威处）或同目录新文件，执行期定。
- `network_hook.ts` / `websocket_capture.ts` 的 `build_page_script` 改为组合共享模板，各自保留协议特有逻辑（fetch/XHR hook 与 WebSocket patch）。

### 非范围

- 不改注入脚本的可观察行为（还原、签名、nonce、postMessage 消息字段与语义）。
- 不动 `content_hmac.ts` 的 `SYNC_HMAC_JS` 本身。

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

- [ ] AC-001：`network_hook.ts` 与 `websocket_capture.ts` 的 `build_page_script` 不再各自内联同构片段，共享模板被两者引用（代码结构断言）。
- [ ] AC-002：注入脚本行为不变：network_hook / websocket_capture / content_hmac 相关测试全绿，断言覆盖还原重装、per-message HMAC 签名、nonce 动态读取。
- [ ] AC-003：`npm test` 全绿，`npx tsc --noEmit` 通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：AC-001 结构断言，AC-002/003 测试套件。

## 上下文区

- 来源：无（审阅发现，2026-08-11 核实两处同构、SYNC_HMAC_JS 已共享）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 现有 content 捕获测试（network_hook / websocket_capture / content_hmac_vectors）覆盖行为；若测试对生成脚本字符串做源码级断言，评估是否改为行为断言（字符串断言过度耦合模板拼接细节时调整）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无。

### 风险与回退

- 风险：模板抽取改变脚本拼接细节，可能影响注入脚本字符串断言类测试；行为语义不变。
- 回退：git 恢复原 build_page_script。

### 依赖与约束

- 与 t124 冲突（同改 network_hook.ts），调度时避让。建议在 t124 后执行。

### Finalization 时更新的 blueprint

- 无
