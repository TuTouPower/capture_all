# Task spec

## 背景

生产路径 `network_capture.handle_cdp_event` 用裸 `requestId` 作 Map 键；子目标 `Network.getResponseBody` / `streamResourceContent` 只传 `{ tabId }` 不带 `sessionId`。`cdp_handler.cdp_request_key` 已存在未接线。跨 iframe/worker 会串键或 body 失败。P0-3 verified。

## 契约区

### 范围

- 生产 `network_capture` 内部 Map/Set 使用 session 复合键（与 `cdp_request_key` 语义一致）。
- 发往子目标的 CDP 命令携带对应 `sessionId`。
- 对外输出 `request_id` 仍为 CDP 原始 requestId（兼容导出/关联）。
- 单测覆盖：同 requestId 不同 session 不串；子目标 body 命令带 sessionId。

### 非范围

- 不删除 `cdp_handler` 旁路文件（可后续收敛，本 task 只保证生产路径正确）。
- 不改 webRequest 关联器算法（除复合键必需适配）。

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

- [ ] AC-001：同一 tab 内两个不同 CDP session 使用相同 `requestId` 时，元数据/body 互不覆盖，各自可完成一次网络事件写入。
- [ ] AC-002：对已登记子 session 的请求，`getResponseBody` 或 `streamResourceContent` 的 `chrome.debugger.sendCommand` target 含该 `sessionId`。
- [ ] AC-003：根 session（无 sessionId）行为与现网一致：仍能完成主文档请求 body 采集（回归）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试（mock chrome.dbg.sendCommand 记录参数）。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P0-3；src_ext_bg_cdp_net/review.md f001-f002

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 真实多 iframe 页面 E2E：有意不测，单测模拟 session 足够。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- mock debugger；注入 attachedToTarget + 双 session 同 requestId 事件序列。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无

### 风险与回退

- 风险：复合键改造可能漏改 cleanup 路径导致泄漏。
- 回退：恢复裸 requestId 键（仅紧急）。

### 依赖与约束

- 无；建议在 t103 前完成以免 timer 清理键空间不一致。

### Finalization 时更新的 blueprint

- 若架构描述仍写「生产已复合键」：`docs/blueprint/architecture.md` CDP 段对齐事实
