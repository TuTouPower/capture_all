# Capture All

浏览器扩展：全量捕获网络/UI/控制台等事件，Dashboard 回放与导出。MCP / Bridge 对接 Agent。

## 命令

| 命令 | 说明 |
|------|------|
| `npm run build` | tsc + vite + bridge + mcp → `artifacts/dist` 等 |
| `npm test` | Vitest 单元/集成 |
| `npm run test:e2e` | Playwright 基础 e2e 项目 |
| `npm run test:e2e:all` | 全部 Playwright 项目 |

## omni_powers（heavy）

- 文档根：`docs/omni_powers/`（`profile=heavy`）
- 导航：`docs/omni_powers/op_index.md` / `op_readme.md`
- 入口：`/opintake` → `/oprun` → `/opstatus`；skill 由 `op_bind_project_skills.sh --profile heavy` 绑到 `.claude/skills/`
- 全局仅需 `/opinit` `/oplinit`（`install.sh --set-ophome`）；业务 skill **项目级**

### 流程红线（本仓踩过的坑）

1. merge gate / task 分支不可跳过；环境错误（exit 2）硬停，不直写 main
2. 一 task 一 commit；禁止多 TID 合并
3. 行为 AC 以 evaluator 真机 + 否证断言为准，禁止「单测绿=验收过」
4. 关闭前：report + review verdict + acceptance_report 齐套
5. E2E 只提交 `e2e/{TID}/*.spec.ts`（及小 runner），不交 dist / Chrome profile

详见 `docs/omni_powers/op_blueprint/test.md` §纪律 与 `docs/archive/WORKFLOW_POSTMORTEM.md`。

### Bridge（可选）

```bash
export CAPTURE_ALL_BRIDGE_TOKEN='…'   # 本地密钥，不入库
# SessionStart hook 会用该 token 拉起 artifacts/bridge/bridge.mjs
```

## 规格入口

- 产品/架构：`docs/omni_powers/op_blueprint/`
- 当前任务：`docs/omni_powers/op_execution/`
- 历史：`docs/omni_powers/op_record/`
