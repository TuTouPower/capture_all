---
status: approved
type: feat
eval: required
---
# 扩展浏览器编号设置 + 自动连接 enroll
## 一句话意图
扩展设置主路径改为用户只填「浏览器编号」（可选备注名），一键/自动向本机 Bridge enroll，并把 instance_token 存入 `chrome.storage.local`；主路径移除「必须手贴 Bridge Token」。

## 不变量（INV）
- INV-1: 用户主设置路径可见「浏览器编号」；长 token 输入降为高级/故障排查或移除主路径
- INV-2: `instance_id` 在扩展本地持久化生成（uuid），跨重启稳定
- INV-3: enroll 成功后 heartbeat/poll/result 使用 instance_token，不再依赖用户粘贴的共享 token（高级兼容可保留）
- INV-4: Bridge 未启动时 UI 明确「等待本地 Bridge」，不静默吞错
- INV-5: 国际化走 `ui_strings` / `data-i18n`，禁止硬编码中英新文案进组件逻辑

## 验收场景（验收标准 AC）
- AC-1: Given 设置页 When 查看集成分区主路径 Then 存在浏览器编号输入（正整数），不存在「必须填写才能连接」的主路径 Token 必填提示（高级区除外）
- AC-2: Given Bridge 已启动且可 enroll When 用户设置编号=2 并连接 Then storage 中出现 instance_token/instance_id/browser_no=2，且后续 heartbeat 成功（status 中该实例 online）
- AC-3: Given 已连接 When 重启扩展 service worker After 读取 storage Then 无需用户再次输入 token 即可恢复 poll（token 仍有效时）
- AC-4: Given Bridge 未启动 When 点击连接 Then UI 显示可理解错误，不写入假 online 状态
- AC-5: Given 旧配置仅有手贴 token 无 browser_no When 升级后打开设置 Then 不崩溃；引导设置编号（兼容路径）

## 边界与反例
- browser_no 重复由 Bridge 顶替策略处理；扩展侧展示「已重新绑定」类状态（若 API 返回指示）
- 401 后：自动尝试一次 re-enroll（S0）；S1 批准流由 T0009 接管，本 task 预留钩子即可

## 不做的事
- 不实现 pair 批准页（T0009）
- 不改 MCP 工具
- 不改采集核心

## 技术决策
### 条件强制
依赖 T0005 enroll API。

### 实现锚点
- `src/shared/constants.ts` / `agent_bridge_config.ts`: 配置字段 `browser_no`, `browser_label`, `instance_id`, `instance_token`；弱化 `agent_bridge_token` 主路径
- `agent_bridge_client.ts`: 启动时 discover→enroll→heartbeat 循环；Authorization 使用 instance_token
- 设置 UI: dashboard 设置集成分区
- 测试: config/client/settings 单测 + 必要 UI 源码断言

### 可测性契约
- AC-1 通道: 单元/DOM 或源码+settings 测试；行为以 UI 文案/字段存在为准
- AC-2 通道: bridge+client 集成单测（mock fetch）或 e2e（若 eval 要求真机则补 e2e/{TID}）
- 否证: 主路径不再要求用户粘贴与 MCP 相同的长 token 才能「启用 Bridge」

## 待澄清 [NEEDS CLARIFICATION]
- 旧 `agent_bridge_token` 字段：完全隐藏 vs 折叠「高级」——草案 **折叠高级兼容**。
