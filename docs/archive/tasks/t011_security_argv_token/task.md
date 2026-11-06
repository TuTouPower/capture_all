# Task spec — T011 security_argv_token

## 背景

`.claude/settings.json` 的 SessionStart hook 通过 `--token "$token"` 把 Bridge token 作为 CLI 参数传给 `node bridge.mjs`。argv 对同机其他用户/进程可见（`ps`/`/proc`），违背 `SECURITY.md:38` 与 `docs/blueprint/decisions.md` 的 token 秘密处理要求。

Bridge 已支持从环境变量读取 `CAPTURE_ALL_BRIDGE_TOKEN`（见 `src/bridge/config.ts`），无需走 argv。

## 范围

代码/配置：

- `.claude/settings.json`：移除 `--token "$token"`，token 仅通过环境变量继承。

测试与黑盒验证：

- 无自动测试（hook 是 shell 配置）；手动验证：解析后命令不包含 `--token`，且仍能从环境变量启动 Bridge。

文档：

- 如 `_comment` 表述需调整一并更新。

## 非范围

- Bridge 侧 token 解析逻辑不变。
- 不改 hook 的其他部分（health check、bridge.mjs 路径、port）。

## 验收标准

- [ ] `.claude/settings.json` 启动命令不含 `--token` 字符串。→ 验证：`grep -n -- '--token' .claude/settings.json` 返回空。→ 预期：grep 无输出。
- [ ] hook 仍能从 `CAPTURE_ALL_BRIDGE_TOKEN` 启动 Bridge。→ 验证：人工或脚本验证命令解析后 token 通过环境变量传递。→ 预期：环境变量路径仍生效。

## 依赖与约束

- 受影响业务不变量：Bridge token 秘密性（`docs/blueprint/decisions.md`）。
- 无数据迁移。
- 无平台限制变化。
