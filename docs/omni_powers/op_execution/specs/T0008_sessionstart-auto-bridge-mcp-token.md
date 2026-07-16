---
status: approved
type: feat
eval: required
---
# SessionStart 自动拉起 Bridge 并注入 mcp 通道 token
## 一句话意图
Claude Code 启动本项目会话时自动确保 Bridge 在跑，并自动注入 MCP 所需的 `CAPTURE_ALL_BRIDGE_URL` / `CAPTURE_ALL_BRIDGE_TOKEN`（mcp 通道 token），用户无需再把 token 复制进 `.mcp.json`。

## 不变量（INV）
- INV-1: 任何 secret **不入仓库**；example 文件不含真实 token
- INV-2: 自动注入的是 **mcp 通道 token**，不是各浏览器 instance_token
- INV-3: Bridge 已在跑且健康则不重复起冲突端口进程
- INV-4: 仅绑定 127.0.0.1
- INV-5: 失败时给出可操作错误（端口占用/权限），不静默

## 验收场景（验收标准 AC）
- AC-1: Given 本机无 bridge When 执行项目 SessionStart/启动脚本 Then bridge 监听配置端口且 `/health` 200
- AC-2: Given 启动完成 When 检查 MCP 进程环境 Then 存在 URL 与 token，且 MCP `get_status` 可调通（扩展未 online 时至少 bridge 字段有效）
- AC-3: Given bridge 已运行 When 再次 SessionStart Then 不产生第二个占用同端口失败的僵尸逻辑（复用或明确跳过）
- AC-4: 仓库检索否证: 无新增硬编码真实 token 字符串提交

## 边界与反例
- 用户已手动配置环境变量时：尊重已有值，不覆盖用户显式 export（需写清优先级）
- Windows/WSL 路径：脚本以本仓 WSL 环境为准

## 不做的事
- 不实现扩展 enroll UI
- 不实现 pair 页
- 不把 instance 注册表塞进 MCP

## 技术决策
### 条件强制
依赖 T0005 明确 mcp_token 与 instance_token 分离；若 T0005 未完成则本 task 至少生成/注入单一通道 token 并文档标注过渡。

### 实现锚点
- 现有 SessionStart hook / 启动 bridge 方式（CLAUDE.md 与 `.claude` 配置）
- `bridge/main.ts` / `config.ts`: 支持生成或读取 mcp token 文件到用户态路径（0600）
- `.mcp.json.example`: 展示 env 占位，不写 secret
- `docs/mcp_usage.md`: 更新「无需手抄 token 到 Claude」主路径

### 可测性契约
- 通道: 脚本级/集成（启动→health→env）；尽量自动化
- 否证: README/mcp_usage 主路径不再要求「复制扩展 token 到 .mcp.json」作为唯一方式

## 待澄清 [NEEDS CLARIFICATION]
- mcp_token 持久化位置: 草案 `XDG/运行时目录或项目 .local 忽略文件`；闸门 A 确认路径约定。
