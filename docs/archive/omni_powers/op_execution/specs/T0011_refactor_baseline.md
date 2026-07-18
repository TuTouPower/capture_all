---
status: approved
type: test
eval: required
---
# 冻结重构行为与产物基线

## 一句话意图
用可执行行为测试和机器可读 fixture 固化目录改造前 Extension、IndexedDB、Bridge、MCP、导出与构建产物契约。

## 不变量（INV）
- INV-1: 不修改生产实现，只增加基线测试、fixture 与扫描器误报治理。
- INV-2: `capture_all_db` 保持 v3，现行 store 与 legacy store 均不得删除。
- INV-3: Bridge token 来源保持 `CLI > env > persisted file > generated`，生成文件权限保持 `0600`。
- INV-4: MCP token 继续允许访问 Extension 数据路由；instance token 不能访问 MCP/CDP 路由。
- INV-5: 构建产物仍位于 `artifacts/dist`、`artifacts/bridge`、`artifacts/mcp`。

## 验收场景（AC）
- AC-1: Given 当前仓库 When 运行基线测试 Then 固化 Vitest、基础 Playwright、manifest 入口和三类产物 smoke，测试发现数非零。
- AC-2: Given v1/v2/v3 IndexedDB fixture When 打开数据库 Then store、keyPath、index 与旧数据保留矩阵符合 v3 契约。
- AC-3: Given public、MCP token、instance token 与错误 token When 请求全部 Bridge 路由 Then 200/401/403/413 行为匹配当前权限矩阵。
- AC-4: Given 恶意 HTML/JSON payload When 导出四种格式 Then JSON/JSONL/HAR 数据完整，HTML 打开后 payload 不执行。
- AC-5: Given tracked tree 含合法配置、文档 placeholder、测试 token 与动态随机 token When 扫描 Then 真 secret 仍失败，已登记合法样本不阻塞 CI。

## 边界与反例
- 交换 CLI/env token 优先级、删除 legacy store、将 DB 升至 v4、拒绝 MCP token 访问 Extension 数据路由，均必须触发失败。
- 扫描器 allowlist 只能精确到已确认文件/模式，不能跳过整个源码或测试目录。
- 不把当前未提交 `.claude/settings.json` 用户修改纳入 task commit。

## 不做的事
- 不移动源码、配置、测试目录。
- 不设计 workspace、package 或新 module interface。
- 不修复与目录改造无关的历史行为。

## 技术决策
### 条件强制（被 2+ task 依赖的决策）
- 基线 fixture 作为 T0012–T0032 迁移门，后续 task 必须解释预期差异。
- Bridge bootstrap 兼容按当前代码冻结，不在本批次收紧。

### 设计探索结论（命中方案先行信号时）
- 候选: 文档记录 / source-string 断言 / 行为 fixture。
- 推荐: 行为 fixture + 产物 smoke —— 可在文件移动后继续验证，不绑定实现坐标。
- 已知坑: bundle hash 会受源码路径影响，比较稳定入口、文件集合和行为，不把全部 bundle 字节相等设为唯一门。

### 实现锚点（坐标集中地）
- `tests/fixtures/refactor_baseline/`
- `tests/storage.test.ts`、`tests/agent_bridge_server.test.ts`、`tests/agent_bridge_config.test.ts`
- `tests/exporter.test.ts`、`tests/e2e-xss.spec.ts`
- `scripts/scan_tracked_tree.mjs`

### 可测性契约（必填，无 N/A 例外）
- 应用启动方式: `npm test && npm run build && npm run test:e2e`
- AC-1 验收信号: runner summary 与 artifact smoke 断言；通道: 直驱 + Playwright。
- AC-2 验收信号: fake IndexedDB schema/data 查询；通道: 直驱。
- AC-3 验收信号: HTTP status/JSON body 矩阵；通道: 直驱。
- AC-4 验收信号: 导出解析结果与浏览器无执行副作用；通道: 直驱 + Playwright。
- AC-5 验收信号: scanner exit code 与 finding 分类；通道: CLI。
- 预期失败模式（建议每条 AC 1 条反例）:
  - AC-1 若入口或产物目录漂移则 smoke 失败。
  - AC-2 若 store/index/数据丢失则矩阵失败。
  - AC-3 若权限扩大或兼容路径消失则状态码失败。
  - AC-4 若 payload 执行则浏览器全局哨兵变化。
  - AC-5 若硬编码真实 token 被放过则负例扫描失败。

## 待澄清 [NEEDS CLARIFICATION]
无
