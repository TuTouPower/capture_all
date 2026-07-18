# 故障排查指南

## 扩展相关

### 扩展无法加载

**症状**：Chrome 提示"无法加载扩展"

**排查**：
1. 检查 `artifacts/dist/` 目录是否存在
2. 检查 `manifest.json` 格式是否正确
3. 查看 Chrome DevTools → Extensions 错误日志

**解决**：重新运行 `npm run build`

### 采集无数据

**症状**：扩展启动后无事件采集

**排查**：
1. 检查扩展图标是否显示"采集状态"为"进行中"
2. 检查 Chrome DevTools → Extensions → Service Worker 日志
3. 确认 `capture_response_body` 配置是否启用

**解决**：
- 重启采集会话
- 检查网络权限（`<all_urls>`）

## Bridge 相关

### Bridge 启动失败

**症状**：`npm run bridge` 报错

**排查**：
1. 检查端口是否被占用：`lsof -i :3000`
2. 检查 token 是否设置：`echo $CAPTURE_ALL_BRIDGE_TOKEN`
3. 查看日志：`artifacts/bridge/bridge.log`

**解决**：
- 更换端口或停止占用进程
- 设置环境变量：`export CAPTURE_ALL_BRIDGE_TOKEN='your-token'`

### Bridge 连接超时

**症状**：MCP 工具调用超时

**排查**：
1. 检查 Bridge 是否运行：`curl http://127.0.0.1:3000/health`
2. 检查扩展是否连接到 Bridge
3. 查看 Bridge 日志中的错误

**解决**：
- 重启 Bridge 服务
- 检查扩展设置中的 `browser_no` 配置

### Bridge 返回 413 错误

**症状**：导出大文件时返回 `PAYLOAD_TOO_LARGE`

**排查**：
1. 检查导出数据大小
2. 确认 `MAX_EXTENSION_RESULT_BODY_BYTES` 配置（当前 64MiB）

**解决**：
- 使用 `include_response_body: false` 减少数据量
- 使用 `output_path` 参数将数据写入文件

## MCP 相关

### MCP 工具调用失败

**症状**：AI Agent 调用工具返回错误

**排查**：
1. 检查 MCP 服务是否运行：`npm run mcp`
2. 检查 `.mcp.json` 配置
3. 查看 MCP 标准输出日志

**解决**：
- 重启 MCP 服务
- 检查 Bridge token 配置

### 大文件导出超时

**症状**：导出 30MB+ 数据时超时

**排查**：
1. 检查 `full_data_timeout_ms` 配置（默认 300s）
2. 查看 Bridge 日志中的超时错误

**解决**：
- 使用 `output_path` 参数写入文件
- 使用 `include_response_body: false` 减少数据量

## 测试相关

### E2E 测试失败

**症状**：Playwright 测试超时或断言失败

**排查**：
1. 检查扩展是否正确加载
2. 检查测试服务器是否运行：`npm run serve:e2e`
3. 查看测试报告：`artifacts/test-results/`

**解决**：
- 重新构建扩展：`npm run build`
- 增加超时时间：修改 `playwright.config.ts`

### 覆盖率报告为空

**症状**：`npm run test:coverage` 无覆盖率数据

**排查**：
1. 检查 `vitest.config.ts` 中 coverage 配置
2. 确认 `@vitest/coverage-v8` 已安装

**解决**：
- 重新安装依赖：`npm install`
- 运行：`npm run test:coverage`

## 常见错误码

| 错误码 | 含义 | 解决方案 |
|--------|------|----------|
| `BRIDGE_UNAVAILABLE` | Bridge 服务不可用 | 检查 Bridge 运行状态 |
| `PAYLOAD_TOO_LARGE` | 数据超过 64MiB | 使用 `output_path` 或 `include_response_body: false` |
| `COMMAND_TIMEOUT` | 命令超时 | 增加 `timeout_ms` 或使用 `output_path` |
| `EXPORT_FAILED` | 导出失败 | 检查 `capture_id` 是否有效 |
| `INVALID_QUERY` | 参数错误 | 检查工具参数格式 |

## 日志位置

- **扩展日志**：Chrome DevTools → Extensions → Capture All → Service Worker
- **Bridge 日志**：`artifacts/bridge/bridge.log`
- **MCP 日志**：标准输出
- **测试日志**：`artifacts/test-results/`
