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

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：`src/extension/background/ws_handler.ts` 不存在。
- [ ] AC-002：`network_capture.ts` 无 `ws_handler` 相关 import 语句，头部注释不再声称委托给 ws_handler。
- [ ] AC-003：`npm test` 全绿，`npx tsc --noEmit` 通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：AC-001/002 文件与内容断言，AC-003 测试套件与 tsc。

## 上下文区

- 来源：无（审阅发现，2026-08-11 核实：ws_handler 全部导出在 src+tests 零引用，network_capture.ts:20 空导入）

### 有意不测

- 无。

### 测试策略

- 按项目默认。删除后跑全量 vitest + tsc 验证无引用残留；另以 grep 断言无文件引用 `ws_handler`。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：极低。ws_handler 无任何生产或测试消费者。
- 回退：git 恢复被删文件。

### 依赖与约束

- 无。

### Finalization 时更新的 blueprint

- 无
