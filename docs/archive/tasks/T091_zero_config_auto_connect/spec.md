# Task spec — T091 zero_config_auto_connect

## 背景

扩展安装后用户必须手填 Bridge token，并通过 `/pair` 配对码才能首次 enroll；MCP 客户端的 `.mcp.json` 又硬编码了静态 token，与 SessionStart hook 拉起的 Bridge 自生成 token 对不上，整条链路对普通用户不可用。

目标：装上扩展即可用，用户不可见 token / pairing code；Bridge 给每个连上的浏览器自动编号（一、二、三…），用户可改备注；MCP 客户端自动读 Bridge 持久化的 token；agent 通过 `target_label` / `target_instance_id` 路由到具体浏览器（T008 已实现，本次复用）。

## 范围

代码/配置：

- `src/bridge/server.ts`：去掉「扩展 origin + 非 dev_mode 必须过 pairing」硬门槛；loopback + 允许的 chrome-extension origin 直接 enroll；label 为空时按现有在线实例序号自动分配中文默认 label（一、二、三…）；enroll 响应回传分配的 label。
- `src/bridge/label.ts`（新）：中文数字转换 + 下一可用默认 label 计算（扫描在线实例，跳过自定义 label，取最大数字序号 +1）。
- `src/extension/background/agent_bridge_client.ts`：`agent_bridge_token` 为空时走「无 Authorization header」的 enroll；保留有 token 路径作为兼容。
- `src/mcp/main.ts`：env `CAPTURE_ALL_BRIDGE_TOKEN` 缺失时从 `default_token_file_path()` 文件回退（复用 `load_bridge_token_file`），支持 `CAPTURE_ALL_BRIDGE_TOKEN_FILE` 覆盖。
- `.mcp.json`：去掉硬编码 `CAPTURE_ALL_BRIDGE_TOKEN`，让 mcp.mjs 自动从文件读。
- `.claude/settings.json`：已修（SessionStart hook 去掉 token 硬门槛）—— 本 commit 含此改动。

测试与黑盒验证：

- `tests/unit/bridge_server.test.ts`（或对应现有文件）新增：
  - loopback + 扩展 origin 直接 enroll 成功（无 token、无 pairing）
  - 非本机 / 非允许 origin enroll 拒绝 401
  - 空 label 自动分配「一」；已有「一」再 enroll 空 label 分配「二」
  - 自定义 label 优先，不参与自动编号
  - 心跳同步 label 时为空不再覆盖已有 label（保留 T047 不变量）
- `tests/unit/mcp_token_file_fallback.test.ts`（或现有 mcp main 测试）新增：env 缺失时读文件成功 / 文件不存在时启动失败明确报错。
- 黑盒：`npm test && npx tsc --noEmit`（必要时加 `npm run build`）。

文档：

- `README.md` / `README.en.md`：快速开始去掉「手填 token + 配对码」，改为「装扩展自动连」。
- `docs/guides/mcp_usage.md`：step 3 重写（Bridge 自启 + 扩展自动连 + MCP 自动读 token）。
- `docs/guides/deployment.md`：token 章节说明自生成路径与文件位置。
- `docs/guides/troubleshooting.md`：扩展连不上章节加「检查 Bridge 是否在跑 + origin 校验」。
- `docs/blueprint/architecture.md`：更新 enroll 流程描述。
- `docs/blueprint/domain.md`：术语「默认 label / 自动编号」补全。
- `docs/blueprint/decisions.md`：记录「loopback origin 直通 + 自动编号」决策。
- `SECURITY.md`：MCP token 来源补「Bridge 自生成持久化文件」路径。

## 非范围

- 不改 instance_token / MCP token 双 token 模型与路由隔离（硬约束保留）。
- 不改 IndexedDB / capture 数据流。
- 不改 CDP 采集逻辑。
- 不删 pairing code 机制（保留作为可选手动路径；跨机 / 高安全场景仍可用）。
- 不动扩展 popup UI 的 label 输入框（用户可改备注路径已存在）。

## 验收标准

- [ ] 扩展无 `agent_bridge_token` 配置时，loopback 内启动 Bridge 后扩展自动 enroll 成功 → 验证：单测模拟扩展 origin POST `/extension/enroll` 无 Authorization → 预期：200 + `instance_token` + `browser_label`。
- [ ] 三个扩展首次 enroll（均不传 label）依次得到 `一` / `二` / `三` → 验证：单测连续 enroll 断言 label → 预期：序号递增不重复。
- [ ] 扩展上报自定义 label 时 Bridge 用自定义值，不参与自动编号 → 验证：单测混合场景断言 → 预期：自定义优先。
- [ ] MCP `main.ts` 在 env 无 token 时从文件读取 → 验证：单测覆盖 → 预期：成功启动 / 缺文件明确报错。
- [ ] `.mcp.json` 不再出现明文 token → 验证：`grep CAPTURE_ALL_BRIDGE_TOKEN .mcp.json` → 预期：无硬编码值。
- [ ] 全量测试通过 → 验证：`npm test && npx tsc --noEmit` → 预期：0 fail / 0 error。

## 依赖与约束

- 前置依赖：T008（browser_label + instance_id 路由）、T047（heartbeat label sync）、T064（token 文件权限）。
- 受影响业务不变量 / 安全边界：
  - Bridge 仅绑 127.0.0.1（CLAUDE.md 硬约束）。
  - instance_token 不得访问 MCP / CDP（硬约束）—— 无认证 enroll 仅签发 instance_token，不暴露 MCP token。
  - 扩展 origin 校验保留（`is_allowed_extension_origin`），防止本机恶意页面伪造 enroll。
- 数据与向后兼容：已配置 `agent_bridge_token` 的用户保持原路径可用；pairing 端点保留。
- 平台 / 权限限制：无。

## 已确认决策

- 默认 label 用中文数字「一、二、三…」（用户指定）。
- pairing code 保留作为可选路径（不删），默认不再强制。
- 用户不审 spec / plan，直接实施。

## 待确认问题

无。
