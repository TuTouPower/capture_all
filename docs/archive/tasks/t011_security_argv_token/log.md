# Task log - T011 security_argv_token

## 进展

- 2026-07-19：修改 `.claude/settings.json`，SessionStart 启动命令移除 `--token "$token"`，改为通过 `CAPTURE_ALL_BRIDGE_TOKEN` 环境变量继承传给子进程。

## 关键验证

- `grep -- '--token' .claude/settings.json` 无输出。
- JSON 解析有效。
- 命令逻辑保持：health check、bridge.mjs 存在性检查、`--port 17831` 不变；token 仅在环境变量非空时通过 `CAPTURE_ALL_BRIDGE_TOKEN=...` 前缀传递。

## 决策

- 不引入针对 hook 命令的自动化测试（shell 内联命令，测试成本高于价值）；通过 review 与 grep 验证。

## 验收

- [x] 启动命令不含 `--token`。
- [x] 环境变量路径仍生效（命令前缀显式注入）。
