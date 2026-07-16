# T0006: 扩展浏览器编号设置 + 自动连接 enroll — 实施报告

## 状态：DONE

## 实施摘要

- 类型扩展：UserConfig 新增 browser_no、browser_label，AgentBridgeUserConfig 扩展对应字段
- 配置标准化：normalize_agent_bridge_config 改为 browser_no>0 即可启用 Bridge（不再强依赖 token）
- 会话管理：BridgeSession 独立存储（agent_bridge_session）、generate_instance_id() 用 crypto.randomUUID()
- Bridge 客户端：resolve_token 自动 enroll → 持久化→ heartbeat；401 自动一次 re-enroll
- 设置 UI：主路径浏览器编号（正整数）+ 可选备注名；旧 Token 折叠为"高级 / 兼容"
- 国际化：新增 14 个 i18n key（zh/en），Bridge 区域使用 t() 函数
- 类型声明：chrome.d.ts 补充 storage.local.remove

## 验收标准覆盖

| AC | 状态 | 说明 |
|----|------|------|
| AC-1: 浏览器编号输入，无 Token 必填 | PASS | settings_ui.test.ts: AC-1 + config_ui 测试验证 |
| AC-2: Enroll → storage 存 token → heartbeat 成功 | PASS | agent_bridge_client.test.ts: AC-2 |
| AC-3: 重启从 storage 恢复 token | PASS | agent_bridge_client.test.ts: AC-3 |
| AC-4: Bridge 未启动 → 可理解错误 | PASS | agent_bridge_client.test.ts: AC-4 |
| AC-5: 旧配置升级不崩溃 | PASS | settings_ui.test.ts: AC-5 + config_ui 测试 |

## 测试摘要

- 测试文件 4 个，总计 56 个测试，全部通过
- agent_bridge_config_ui.test.ts: 13（+7 T0006）
- agent_bridge_client.test.ts: 21（+4 T0006）
- settings_ui.test.ts: 14（+2 T0006）
- agent_bridge_config.test.ts: 8（修复已存在的默认值测试）

## 文件清单

### 修改
- src/shared/types.ts — UserConfig 加 browser_no、browser_label
- src/shared/constants.ts — DEFAULT_USER_CONFIG 加默认值
- src/shared/i18n.ts — 新增 14 个 i18n key（中英文）
- src/shared/agent_bridge_config.ts — 类型扩展 + normalize 逻辑 + session 管理函数
- src/shared/chrome.d.ts — storage.local.remove 类型声明
- src/background/agent_bridge_client.ts — enroll 流 + 会话持久化 + 401 重试
- src/background/service_worker.ts — get_user_config_for_bridge 返回类型扩展
- src/dashboard/dashboard_settings.ts — 浏览器编号输入 + 高级折叠 + i18n
- tests/agent_bridge_client.test.ts — T0006 enroll/session/401 测试
- tests/agent_bridge_config_ui.test.ts — T0006 browser_no 配置测试
- tests/agent_bridge_config.test.ts — 修复已存在默认值断言
- tests/settings_ui.test.ts — T0006 UI AC-1/AC-5 测试

## 不变量验证

- INV-1: 用户主设置可见「浏览器编号」；长 token 折叠至高级区 ✓
- INV-2: instance_id 用 crypto.randomUUID()，跨重启通过 agent_bridge_session 持久化 ✓
- INV-3: enroll 后使用 instance_token，不再依赖手贴 token ✓
- INV-4: Bridge 未启 → 日志 enroll 阶段错误 ✓
- INV-5: 国际化走 i18n t() / 已有 data-i18n 框架 ✓
