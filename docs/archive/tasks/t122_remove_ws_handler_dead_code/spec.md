# Task spec

## 背景

t119 将网络捕获事件路径统一到 network_capture 后，`src/extension/background/ws_handler.ts` 整文件无消费者：7 个导出函数全部 0 引用，唯一残留是 `network_capture.ts` 的 `import {} from './ws_handler'` 空导入；其功能（WebSocket 连接/帧事件）已由 network_capture 本地实现（`send_ws_connection_event` / `send_ws_frame`，带脱敏增强）完全取代。审阅确认 tests 对 ws_handler 零引用。

## 契约区

### 范围

- 删除 `src/extension/background/ws_handler.ts` 整文件。
- 删除 `src/extension/background/network_capture.ts` 中 `import {} from './ws_handler'` 空导入。
- 修正 `network_capture.ts` 头部过时注释（不再声称委托给 ws_handler）。

### 非范围

- 不改 network_capture 本地 WebSocket 实现逻辑。
- 不动 `webrequest_handler.ts`（归 t123）。

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

- [ ] AC-001：`src/extension/background/ws_handler.ts` 不存在。
- [ ] AC-002：`network_capture.ts` 无 `ws_handler` 相关 import 语句，头部注释不再声称委托给 ws_handler。
- [ ] AC-003：`npm test` 全绿，`npx tsc --noEmit` 通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：AC-001/002 文件与内容断言，AC-003 测试套件与 tsc。

## 上下文区

- 来源：无（审阅发现，2026-08-11 核实：ws_handler 全部导出在 src+tests 零引用，network_capture.ts:20 空导入）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 按项目默认。删除后跑全量 vitest + tsc 验证无引用残留；另以 grep 断言无文件引用 `ws_handler`。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无。

### 风险与回退

- 风险：极低。ws_handler 无任何生产或测试消费者。
- 回退：git 恢复被删文件。

### 依赖与约束

- 无。

### Finalization 时更新的 blueprint

- 无
