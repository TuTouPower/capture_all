# Task plan — T011 security_argv_token

## 步骤

1. 修改 `.claude/settings.json` SessionStart command：删除 `--token "$token"`。
2. `_comment` 不变（仍说明依赖环境变量）。
3. 黑盒验证：grep 确认无 `--token`；手动解析命令确保仍能从环境变量启动 Bridge。

## 风险与回退

- 风险：环境变量未设置时 Bridge 启动失败 → 由 Bridge `config.ts` 已有 fallback（生成 token）兜底；不影响主流程。
- 回退：`git revert <commit>`。
