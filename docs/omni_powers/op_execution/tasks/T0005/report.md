
# T0005 Bridge Auto-Enroll Token — 实现报告

## 总体报告
| 项目 | 内容 |
|------|------|
| TID | T0005 |
| 分支 | op/task/T0005 |
| 状态 | **DONE** |
| 变更文件 | `tests/agent_bridge_server.test.ts` |
| 未变更已就绪文件 | `src/agent/bridge/server.ts`, `src/agent/bridge/config.ts`, `src/agent/shared/protocol.ts` |
| 假设 | server.ts 实现完整，仅缺 AC 单测与 report |
| spec-delta | 无 |

## 验收标准覆盖
| AC | 状态 | 测试 |
|----|------|------|
| AC-1 enroll 200 {instance_id, instance_token, browser_no} | PASS | `enroll returns 200 with instance_id, instance_token, browser_no` |
| AC-2 instance_token 可 heartbeat/command/result | PASS | `heartbeat succeeds with instance_token`, `command poll succeeds with instance_token`, `full command cycle with instance_token` |
| AC-3 错 token → 401 TOKEN_INVALID | PASS | `heartbeat fails with wrong instance_token`, `command poll fails with wrong instance_token`, `result post fails with wrong instance_token` |
| AC-4 同 browser_no 再 enroll 顶替 | PASS | `same browser_no re-enroll invalidates old token`, `status shows only new instance after re-enroll` |
| AC-5 注册表无明文 instance_token | PASS | `mcp/status extensions do not expose instance_token` |
| MCP instance_token 不能冒充 | PASS | `instance_token cannot access /mcp/status`, `instance_token cannot access /mcp/command` |
| browser_no 非法 → 400 | PASS | `enroll returns 400 for invalid browser_no: 0/-1/1.5/null/abc` |

## 边界覆盖
| 边界 | 测试 |
|------|------|
| browser_no 缺失 → 400 | `enroll returns 400 when browser_no is missing` |
| extension_version 缺失 → 400 | `enroll returns 400 when extension_version is missing` |
| instance_id 可选 | `enroll accepts optional instance_id` |
| browser_label 可选 | `enroll accepts optional browser_label` |
| 无 auth 无法 enroll | `enroll rejects without auth` |
| token 与 instance_id 不一致 → 401 | `heartbeat rejects when instance_id does not match token instance` |
| /extension/discover 无需 auth | `/extension/discover returns bridge info without auth` |

## 测试统计
- 新增测试：20 个（含 5 个参数化用例）
- 已有测试：38 个
- **总计：62 个，全部通过**

## 实现验证
server.ts 现有实现已覆盖全部 AC：
- POST /extension/enroll（L186-229）：生成 instance_token、hash 存储、browser_no 顶替
- resolve_extension_auth（L464-491）：MCP token 优先，instance_token 恒时比较
- is_mcp_path（L235-259）：仅 MCP token 通行，instance_token 禁止
- build_status（L116-146）：不暴露 token_hash，无 raw token 字段

---

## Round 1
- 运行 `op_implementer_check.sh T0005`
- 阅读 spec + 全部 workset 文件
- 分析实现：server.ts 已完整实现 AC-1..AC-5 及所有边界
- 编写 20 个测试覆盖全部 AC + 边界
- `npm test -- tests/agent_bridge_server.test.ts` → 62/62 PASS
- 撰写 report.md
- git commit
