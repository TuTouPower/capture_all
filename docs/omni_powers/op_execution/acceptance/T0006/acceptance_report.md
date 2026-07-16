# T0006 验收报告

## 验收结果
| AC | 结果 | 证据 |
|---|---|---|
| AC-1: 浏览器编号输入，无 Token 必填 | PASS | settings_ui.test.ts AC-1：browser_no input 存在（type=number/min=1），高级折叠区存在，无"必须填写"文案 |
| AC-2: Enroll → storage → heartbeat | PASS | agent_bridge_client.test.ts AC-2：mock enroll → storage.set 验证 → heartbeat 请求 |
| AC-3: 重启恢复 token | PASS | agent_bridge_client.test.ts AC-3：mock storage.get 返回 session → enroll 未调 → heartbeat 恢复 |
| AC-4: Bridge 未启 → 错误提示 | PASS | agent_bridge_client.test.ts AC-4：fetch 全拒 → enroll 尝试 → 错误日志 |
| AC-5: 旧配置升级不崩溃 | PASS | settings_ui + config_ui：legacy 配置渲染不抛异常 |

## 单元测试
56/56 PASS（agent_bridge_client 21 + config_ui 13 + settings_ui 14 + config 8）

verdict: PASS
