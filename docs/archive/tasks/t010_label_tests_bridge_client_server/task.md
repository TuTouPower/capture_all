# Task spec — T010 label_tests_bridge_client_server

## 背景

T008 改动后 `agent_bridge_client.test.ts`（~700 行，17 测试）与 `agent_bridge_server.test.ts`（~1300 行，30+ 测试）整体 `describe.skip`。两者围绕 browser_no 旧语义构建，重写工程量大。T009 已处理较简单的配置/UI 测试。

## 范围

### `tests/unit/agent_bridge_client.test.ts`

- 配置字面量：移除 `browser_no`，enroll 触发条件改为 `agent_bridge_token > 0`
- enroll mock 返回：`browser_label` 替换 `browser_no`
- fetch 期望：enroll 调用次数与 URL 不变；enroll 函数新签名 `(url, browser_label, version, instance_id, bridge_token)`
- 401 recovery 测试：触发条件改为 token > 0（不是 browser_no > 0）
- session 保存/恢复：测试不变（基于 instance_id + instance_token）

### `tests/unit/agent_bridge_server.test.ts`

- ExtensionInstance 类型：drop browser_no
- enroll body 测试：用 `browser_label` 替换 `browser_no`；enroll 不再要求 browser_no 必填
- `/pair/approve` 测试：整段删除（端点已移除）
- `/pair/open` + pairing_code 流程测试：保留并适配
- 路由测试：`target_instance_id` + `target_label` 替换 `browser_no`；多实例匿名时 `TARGET_AMBIGUOUS` / `TARGET_REQUIRED`
- 同 label 顶替测试：替换 same browser_no 顶替
- 命令路由测试：按 instance_id（已是主键）

## 验收标准

- [ ] `agent_bridge_client.test.ts` 全绿（去 .skip）
- [ ] `agent_bridge_server.test.ts` 全绿（去 .skip）
- [ ] 新增覆盖：`TARGET_AMBIGUOUS`、`LABEL_DUPLICATE`（如保留）、`browser_label` 唯一性、空 label 不顶替、同 label 顶替
- [ ] `npm test` 整体 1079 全绿（0 skip）

## 依赖与约束

- T008 代码层已完成（commit `a408f24`）。
- 不变量：测试不削弱断言（§6.2）。
