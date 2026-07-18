---
status: approved
type: refactor
eval: required
---
# 对齐活动文档、CI、扫描规则并删除旧树

## 一句话意图
更新全部活动配置与文档到新结构，强化依赖扫描，删除旧源码树、临时 allowlist 和兼容入口，完成整仓收口。

## 不变量（INV）
- INV-1: `artifacts/dist`、`capture_all_db` v3 与历史数据兼容永久保留。
- INV-2: 文档准确描述 Bridge token 四级 fallback 与 `0600` 持久化。
- INV-3: 文档明确 MCP token 的 Extension 数据路由 bootstrap 兼容是有意设计；instance token 仍不可访问 MCP/CDP。
- INV-4: `.mcp.json.example` 继续启动 `artifacts/mcp/mcp.mjs`。
- INV-5: 不批量改写 `docs/archive/**` 与历史 acceptance/evidence，不夹带 `.claude/settings.json` 用户修改。

## 验收场景（AC）
- AC-1: Given活动源码、配置、CI 与文档 When 扫描 Then只引用 `apps/**`、`packages/**`、`tooling/**`、新 `tests/**`，无旧产品路径。
- AC-2: Given tracked-tree scanner When 执行 Then强制 package 单向依赖、Extension runtime 硬规则、真实 secret 检测，同时合法 placeholder/fixture 不误阻塞。
- AC-3: Given最终 fresh install 与全验证矩阵 When 执行 Then scan、typecheck、unit、integration、build、artifact smoke、全部 E2E、DB upgrade、XSS、Bridge/MCP 闭环全绿。
- AC-4: Given仓库树 When 收口 Then旧 `src/**`、临时 migration allowlist、兼容转导与已替代根配置全部删除。

## 边界与反例
- 活动文档更新必须包括根文档、部署/MCP/故障排查/贡献和 omni_powers blueprint。
- scanner 修复不能通过忽略整个 `.claude/`、docs、tests 或源码目录实现；采用精确规则。
- 历史文档可保留旧路径作为历史证据，不纳入活动路径否证。

## 不做的事
- 不增加产品功能。
- 不重写历史任务证据。
- 不改变产物目录、DB schema 或 token 安全行为。

## 技术决策
### 条件强制（被 2+ task 依赖的决策）
- 新目录与 module interface 成为唯一活动真相；不保留永久兼容层。
- scanner 通过解析活动 import/entry 强制架构，不依赖易漂移人工约定。

### 设计探索结论（命中方案先行信号时）
- 候选: 保留旧路径转导 / 一次删除。
- 推荐: 全矩阵通过后一次删除 —— 避免双真相源与长期迁移债务。
- 已知坑: 历史 archive 含旧路径和测试 token，扫描需区分活动规则与历史证据，不能篡改历史。

### 实现锚点（坐标集中地）
- `CLAUDE.md`、`AGENTS.md`、`README*.md`、部署/MCP/故障排查/贡献文档
- `docs/omni_powers/op_blueprint/`
- `.github/workflows/ci.yml`、`.mcp.json.example`、`.gitignore`
- `tooling/**` scanner/build/test config
- 删除 `src/**` 与临时兼容文件

### 可测性契约（必填，无 N/A 例外）
- 应用启动方式: `npm ci && npm run scan:tracked-tree && npm run typecheck && npm run test:unit && npm run test:integration && npm run build && npm run test:e2e:all`
- AC-1 验收信号: active path/reference scan；通道: CLI。
- AC-2 验收信号: architecture scanner 正负 fixtures；通道: CLI。
- AC-3 验收信号: 最终验证矩阵与真机 acceptance；通道: CLI + CDP + HTTP。
- AC-4 验收信号: git tree negative path assertion；通道: CLI。
- 预期失败模式（建议每条 AC 1 条反例）:
  - AC-1 若旧活动引用残留则扫描失败。
  - AC-2 若依赖反向或真实 secret 被放过则负例失败。
  - AC-3 若 runner/产品漏跑则矩阵门失败。
  - AC-4 若旧树/allowlist/转导残留则收口失败。

## 待澄清 [NEEDS CLARIFICATION]
无
