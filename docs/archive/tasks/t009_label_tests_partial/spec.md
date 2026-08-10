# Task spec — T009 label_tests_partial

## 背景

T008 改动后，4 个测试文件涉及 `browser_no` 旧语义，整体 skip。T009 重写其中较简单的 2 个；复杂的 2 个（agent_bridge_client + agent_bridge_server）留 T010。

## 范围

- `tests/unit/agent_bridge_config_ui.test.ts`：重写
  - 第一个 describe（agent bridge user config）：去 .skip；`toEqual` 期望去掉 browser_no，保留 browser_label
  - 第二个 describe（原 T0006: browser_no auto-enroll config）：整段删除；用新 describe `browser_label handling` 替代（trim、empty、undefined、enabled 不依赖 label）
- `tests/unit/settings_ui.test.ts`：T0006 describe 重写
  - 改为 `browser_label settings UI`
  - 断言 browser_label input 存在；browser_no input 不存在（移除校验）
  - 保留 Legacy token 渲染不崩溃测试

## 验收标准

- [x] `agent_bridge_config_ui.test.ts` 10 测试全绿
- [x] `settings_ui.test.ts` 全绿
- [x] `npm test` 整体绿（含 T010 仍 skip 的两个文件）

## 非范围

- `agent_bridge_client.test.ts` 与 `agent_bridge_server.test.ts` 重写（T010）
