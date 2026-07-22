# 部署指南

## 概述

Capture All 是 Chrome MV3 浏览器扩展，支持多浏览器实例通过 Bridge + MCP 对接 AI Agent。

## 前置条件

- Node.js ^20.19.0 || >=22.12.0
- Chrome 浏览器（支持 MV3）
- npm 或 pnpm

## 构建

```bash
npm ci
npm run build
```

构建产物位于 `artifacts/dist/`（扩展）和 `artifacts/bridge/`（Bridge 服务）。

## 安装扩展

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `artifacts/dist/` 目录

## Bridge 服务部署

### 本地运行

```bash
# 先用密码管理器或 openssl 生成随机 token
export CAPTURE_ALL_BRIDGE_TOKEN="$(openssl rand -hex 32)"
npm run bridge -- --port 17831
```

Bridge 默认绑定 `127.0.0.1`。`--port` 必须显式指定（入口无默认端口）。

### systemd 服务（Linux）

创建 `/etc/systemd/system/capture-all-bridge.service`：

```ini
[Unit]
Description=Capture All Bridge Service
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/capture_all
# Token 从 EnvironmentFile 注入（不要在 unit 文件中硬编码）
EnvironmentFile=/etc/capture-all-bridge.env
ExecStart=/usr/bin/node artifacts/bridge/bridge.mjs --port 17831
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable capture-all-bridge
sudo systemctl start capture-all-bridge
```

## 多浏览器配置

每个浏览器实例可填入唯一 `browser_label`（备注，如 "work" / "personal"）：

1. **默认零配置**：扩展装上自动 enroll，Bridge 按到达顺序自动编号（`1 号` / `2 号` / `3 号` …）。单浏览器无需任何配置。
2. **自定义备注**：在扩展设置中改 `browser_label`，Bridge 用自定义值；未设的实例继续用自动编号。
3. Bridge 自动路由：单实例默认；多实例按 `target_label`（"1 号"/"2 号"或自定义）或 `target_instance_id` 路由。
4. MCP 工具调用时指定 `target_label` 或 `target_instance_id` 参数；多实例未指定时返回 `TARGET_AMBIGUOUS`。

## 安全加固

1. **Token 管理**：默认零配置（Bridge 自生成并持久化到 `$XDG_RUNTIME_DIR/capture-all/bridge_token`，mode 0600）；如需固定 Token 用 `openssl rand -hex 32` 生成，定期轮换
2. **网络限制**：Bridge 仅绑定 `127.0.0.1`，不暴露公网
3. **权限控制**：限制扩展权限，仅授权必要站点
4. **数据脱敏**：启用 `redact_data` 配置，脱敏敏感 headers/URL/body

## 监控

- Bridge 日志：前台运行看 stdout/stderr；systemd 用 `journalctl -u capture-all-bridge`；需文件日志请自行配置日志重定向/轮转
- 扩展日志：Chrome DevTools → Extensions → Capture All → Service Worker
- MCP 日志：标准输出

## 故障排查

常见问题见 [troubleshooting.md](troubleshooting.md)。
