# T0005 Bridge Auto-Enroll Token 验收报告

## 验收结果

| AC | 描述 | 结果 | 证据 |
|----|------|------|------|
| AC-1 | POST /extension/enroll 200，返回 instance_id/instance_token/browser_no，token 仅响应一次可见 | PASS | 单测 `AC-1: enroll returns 200`（行979）；真机返回 `{"ok":true,"data":{"instance_id":"inst_059c793dbf4d9b16","instance_token":"ext_2F0rdbd61keiaAv2v3GnaxjIoFo2c_cG","browser_no":1}}` |
| AC-2 | instance_token 可 heartbeat/command/result 鉴权 | PASS | 单测 `AC-2: heartbeat succeeds`（行1045）、`command poll succeeds`（行1073）、`full command cycle`（行1109）；真机 heartbeat 200、command poll 200 |
| AC-3 | 错 token → 401 TOKEN_INVALID | PASS | 单测 `AC-3: heartbeat/command/result fails`（行1165/1196/1217）；真机 401 `{"code":"TOKEN_INVALID"}` |
| AC-4 | 同 browser_no 再 enroll 顶替，旧 token 失效 | PASS | 单测 `AC-4: re-enroll invalidates old token`（行1235）、`status shows only new instance`（行1304）；真机旧 token 401、新 token 200、status 仅 1 个 browser_no=7 实例 |
| AC-5 | mcp/status extensions 无明文 instance_token | PASS | 单测 `AC-5: mcp/status extensions do not expose instance_token`（行1351）；真机 extensions 数组无 token/instance_token/token_hash 字段，JSON stringify 不含 token 明文 |
| — | instance_token 不能访问 /mcp/* | PASS | 单测 `instance_token cannot access /mcp/status`（行1390）、`/mcp/command`（行1408）；真机均 401 |
| — | browser_no 非法 → 400 INVALID_QUERY | PASS | 单测 `enroll returns 400`（行934/948/965）；真机 0/-1/1.5/"abc"/缺失均 400 `browser_no must be a positive integer` |

## 单元测试证据

```
npm test -- tests/agent_bridge_server.test.ts --run

✓ tests/agent_bridge_server.test.ts (62 tests) 1358ms
  Test Files  1 passed (1)
       Tests  62 passed (62)
```

T0005 相关单测方法 16 个（行932-1483），覆盖：
- enroll 参数校验（缺失 browser_no、非法值 0/-1/1.5/null/"abc"、缺失 extension_version）
- AC-1~AC-5 全部场景
- instance_token vs mcp_token 隔离
- cross-instance 越权检测（heartbeat rejects when instance_id does not match token instance）
- /extension/discover 无需认证
- enroll 支持可选 browser_label、instance_id

## 真机验证

**环境**：`CAPTURE_ALL_BRIDGE_TOKEN=verify_token_789`，端口 19999

### AC-1 enroll 正常
```
POST /extension/enroll {"browser_no":1,"extension_version":"1.0.0"}
→ 200 {"ok":true,"data":{"instance_id":"inst_059c793dbf4d9b16","instance_token":"ext_2F0rdbd61...","browser_no":1}}
```

### AC-2 heartbeat/command 用 instance_token
- `POST /extension/heartbeat` + `Authorization: Bearer ext_...` → 200 `{"ok":true}`
- `GET /extension/command` + `Authorization: Bearer ext_...` → 200 `null`（无待处理命令）

### AC-3 错误 token
- `Authorization: Bearer ext_wrong_fake_token_12345` → 401 `{"code":"TOKEN_INVALID"}`

### AC-4 同 browser_no 再 enroll 顶替
- 旧 token `ext_2F0rdbd61...` 再 heartbeat → 401
- 新 token `ext_81qp9n9i...` heartbeat → 200
- browser_no=7 重复 enroll 后 status 仅保留最新实例 `inst_f55f6f59b4cd3df4 ver=4.0.0`

### AC-5 status 无 token 泄露
- `GET /mcp/status` extensions 数组项无 `token`/`instance_token`/`token_hash` 字段
- `JSON.stringify(status)` 不含 instance_token 明文

### MCP 隔离
- `instance_token` 访问 `/mcp/status` → 401
- `instance_token` 访问 `/mcp/command` → 401

### browser_no 边界
- 缺失/0/-1/1.5/"abc" → 400 `INVALID_QUERY` `browser_no must be a positive integer`

### 可选字段 & discover
- `browser_label` 可选：正常 enroll
- `instance_id` 可选：自定义 `my-custom-inst` 正常返回
- `GET /extension/discover` 无需认证 → 200 含 `pairable:true`

## 对抗探索

- **chrome-extension origin 免 mcp token enroll**：`Origin: chrome-extension://aaaa...` + 无 Authorization → 200 成功，符合 INV-3 本机信任模型
- **web origin 被拒绝**：`Origin: https://example.com` → 403 `ORIGIN_NOT_ALLOWED`
- **跨实例 token 攻击**：instance1 的 token 用于 claim instance2 的 instance_id → 401 `TOKEN_INVALID`
- **无 auth enroll**：无 Authorization 也无 chrome-extension origin → 401
- **enroll 仅返回一次 token**：响应包含 token 明文（符合设计），后续 status/heartbeat 无 token 回显

verdict: PASS
