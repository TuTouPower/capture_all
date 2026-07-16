# T0009: 本机配对批准（S1）保护 enroll — 实施报告

## 状态：DONE

## 实施摘要

- 配对状态机：PairingState（open / code / expires_at / allowlist），内存管理
- 默认安全档 S1：扩展 enroll 需通过配对批准或 6 位短码；MCP token 可绕过
- S0 开关：`AgentBridgeConfig.dev_mode = true` 恢复旧行为（dev 用）
- Bridge 路由：`GET /pair`（HTML 页）、`GET /pair/status`、`POST /pair/open`、`POST /pair/close`、`POST /pair/approve`
- Pair 页功能：展示配对码 + 过期时间，Approve 按钮按 browser_no 授权
- Enroll 校验：S1 模式下检查 allowlist 或 pairing_code（600000 范围随机码）

## 验收标准覆盖

| AC | 状态 | 说明 |
|----|------|------|
| AC-1: S1 默认未开放 → enroll 被拒 `PAIRING_REQUIRED` | PASS | server 测试验证 403 + PAIRING_REQUIRED |
| AC-1: MCP token enroll 绕过 S1 检查 | PASS | server 测试，MCP auth → 200 |
| AC-1: S0 dev_mode 允许无配对 enroll | PASS | server 测试，dev_mode=true → 200 |
| AC-2: Pair 页批准 browser_no=3 → enroll 3 成功 | PASS | server 测试，approve → enroll 200 |
| AC-2: 只批准 browser_no=3，其他号仍被拒 | PASS | server 测试，browser_no=4 → 403 |
| AC-3: 扩展带正确 pairing_code enroll → 成功 | PASS | server 测试，code 匹配 → 200 |
| AC-3: 错误 pairing_code → 拒绝 | PASS | server 测试，wrong code → 403 |
| AC-3: 配对过期后 code 失效 | PASS | server 测试，duration_minutes=0 到期后 → 403 |
| AC-4: 已持有 token 心跳不需要再批准 | PASS | server 测试，MCP enroll 后 heartbeat 200 |
| AC-5: 否证主路径不出现长 token | PASS | pair 页用 6 位码 + approve 按钮，无 token 复制 |

## 测试摘要

- agent_bridge_server.test.ts：78 测试（+10 T0009），全部通过
- 全量测试：89 文件 1072 测试，全部通过

## 文件清单

### 修改
- src/agent/shared/protocol.ts — AgentBridgeConfig 加 dev_mode?: boolean
- src/agent/bridge/server.ts — PairingState + /pair/* 路由 + enroll S1 校验 + pair HTML 页
- tests/agent_bridge_server.test.ts — T0009 10 个测试（AC-1/2/3/4） + start_test_server 支持 overrides

## 不变量验证

- INV-1: 默认 S1（dev_mode 默认 false），S0 仅 dev 开关 ✓
- INV-2: pair 页/码仅 127.0.0.1 可访问（bridge 绑定本地，无外网暴露）✓
- INV-3: 批准窗口可时间限制（默认 5 分钟，/pair/open 支持 duration_minutes）✓
- INV-4: 用户主路径无长 token（pair 页用 6 位码 + 按钮，不复制 token）✓
- INV-5: 已批准 token 重连不需再批准（heartbeat/command 用 instance_token，不走 enroll）✓

## Round

### Round 1: RED → GREEN

- 先写 10 个测试（T0009 AC-1/2/3/4 覆盖），确认 RED（10 fail）
- 实现 PairingState + /pair/* 路由 + enroll S1 校验
- 运行全部测试 → 89 文件 1072 测试 GREEN
