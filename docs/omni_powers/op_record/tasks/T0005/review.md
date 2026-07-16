# T0005 Review (Round 1)

## 裁决一：规格合规

### 验收标准覆盖

- **AC-1**: ✅ — enroll 200 响应含 instance_id、instance_token（ext_ 前缀）、browser_no。可选字段 instance_id、browser_label 独立覆盖。
- **AC-2**: ✅ — heartbeat、command poll、full command cycle 三个端点均通过 instance_token 鉴权（200）。
- **AC-3**: ✅ — heartbeat、command poll、result post 三个端点错 token 均 401 TOKEN_INVALID。
- **AC-4**: ✅ — 同 browser_no 再 enroll 后旧 token 401、新 token 200；status 仅剩新实例。
- **AC-5**: ✅ — mcp/status extensions 无 token/instance_token/token_hash 字段；JSON.stringify 不包含明文。

### 边界覆盖

- browser_no 缺失/非正整数（0/-1/1.5/null/abc）→ 400
- extension_version 缺失 → 400
- 无 auth → 401
- instance_token 不可访问 /mcp/status、/mcp/command → 401
- instance_id 与 token 不匹配 → 401
- /extension/discover 无 auth → 200

### 偏航检查

- 实际工作集 vs workset 一致。config.ts / protocol.ts 无变更。server.ts 变更确属 T0005 分支工作。
- /extension/discover 为 spec 标注"可选"路由，不算偏航。
- 无 spec 外功能。

### 不变量检查

- INV-1: ✅ — 无 console.log，错误响应不含 token。
- INV-2: ✅ — sha256 hash + timingSafeEqual 恒时比较；存储仅 hex hash。
- INV-3: ✅ — enroll 仅接受 MCP token（本机 loopback）或 chrome-extension Origin。
- INV-4: ✅ — MCP 路由仅校验 config.token，不接受 instance_token。
- INV-5: ✅ — 同 browser_no 再 enroll 删除旧实例+队列。

## 裁决二：测试可信

### 测试质量

- 断言类型：HTTP 状态码、响应 JSON body、响应头、字段类型/前缀/值——全部用户可观察。
- 异步时序：轮询 + agent:false 避免串行化 + afterEach 独立启停。
- 模式与已有测试一致。

### 危险模式扫描

- .skip: 无。.only: 无。
- expect 删除/反转/放宽: 无。
- 恒假断言: 无。AC-5 的 ext.not.toHaveProperty('token_hash') 与 build_status 实现一致。

### 红灯归因
全部 62 测试通过，无红灯。

## 问题清单

| 问题 | 暂存 | 说明 |
|------|------|------|
| Report 中"未变更已就绪文件"列 server.ts，diff 显示有变更 | — | 报告描述性错误，不影响代码合规 |

verdict: PASS
