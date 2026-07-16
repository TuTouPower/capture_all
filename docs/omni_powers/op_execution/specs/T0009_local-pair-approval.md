---
status: approved
type: feat
eval: required
---
# 本机配对批准（S1）保护 enroll
## 一句话意图
在自动 enroll 上增加本机配对批准，防止同机任意扩展静默绑定；用户首次只需在本地 pair 页点「允许浏览器 N」或输入 6 位短码，不再粘贴长 token。

## 不变量（INV）
- INV-1: 默认安全档为 S1（批准或短码）；S0 全开 enroll 仅 dev 开关
- INV-2: pair 页/码仅 127.0.0.1 可访问
- INV-3: 批准窗口可时间限制（默认启动后 N 分钟或手动「开放配对」）
- INV-4: 不把长 token 重新引入用户主路径
- INV-5: 已批准并持有有效 instance_token 的扩展重连不需每次点批准（除非 token 失效/吊销）

## 验收场景（验收标准 AC）
- AC-1: Given S1 默认且未开放/未批准 When 扩展 enroll Then 失败码明确（如 `PAIRING_REQUIRED`），不发 token
- AC-2: Given 打开 pair 页批准 browser_no=3 When 扩展 enroll 3 Then 成功拿到 instance_token
- AC-3: Given 6 位 pairing_code 模式 When 扩展带正确 code enroll Then 成功；错误 code → 拒绝
- AC-4: Given 已持有有效 token When 仅 heartbeat Then 不要求再次批准
- AC-5: 否证: 用户主路径文档/UI 不出现「复制 40+ 字符 token」

## 边界与反例
- 批准过期后需重新开放配对
- 同 browser_no 顶替仍有效，但顶替可要求重新批准（草案：**要求**，更安全）

## 不做的事
- 不做公网配对
- 不做账号体系

## 技术决策
### 条件强制
依赖 T0005 enroll 与 T0006 扩展连接流。

### 实现锚点
- Bridge: `GET /pair` 简易页或静态 HTML；内存 `pairing_code` / allowlist
- enroll 校验 pairing 状态
- 扩展: 连接失败时展示「请在本机打开 pair 页允许」

### 可测性契约
- 直驱 server 单测覆盖 AC-1/2/3
- UI 文案单测或 e2e 可选
- 否证主路径长 token

## 待澄清 [NEEDS CLARIFICATION]
- 顶替同号是否强制再批准：草案 **是**。
