---
status: approved
type: refactor
eval: required
---
# 纯迁移 capture_domain 遗留模块

## 一句话意图
把采集类型、常量、统计、事件、脱敏和导出纯逻辑整体迁入 `capture_domain` legacy 区，先形成单一真相源而不拆分知识所有权。

## 不变量（INV）
- INV-1: `types.ts` 整体机械迁移，字段、序列化名和 deprecated alias 均不变。
- INV-2: `DB_NAME='capture_all_db'`、`DB_VERSION=3`、store 名和默认配置不变。
- INV-3: redaction、event category、archive entry、system time 行为不变。
- INV-4: `capture_domain` 不依赖 Chrome、Node HTTP 或 MCP SDK。

## 验收场景（AC）
- AC-1: Given 全部生产调用点 When typecheck Then 均从 `capture_domain` 根导出解析且无旧共享类型 import。
- AC-2: Given 现有统计、事件、脱敏、archive 与 export 测试 When 执行 Then 结果与基线一致。
- AC-3: Given package dependency scan When 执行 Then 不出现平台依赖或 `apps/**` 反向依赖。

## 边界与反例
- UserConfig 等 Extension-only 类型暂时留在 legacy export，T0021 再按知识所有权拆分。
- 不允许同时维护旧 `src/shared/types.ts` 和新 package 两份声明。

## 不做的事
- 不设计 persistence/logging interface。
- 不移动 Extension 生产目录。
- 不改变 export 安全逻辑或数据格式。

## 技术决策
### 条件强制（被 2+ task 依赖的决策）
- 先机械迁移再深化，保证后续路径问题与 interface 改造问题可独立归因。

### 设计探索结论（命中方案先行信号时）
- 候选: 立即拆 `types.ts` / 整体 legacy 迁移。
- 推荐: 整体 legacy 迁移 —— 轨 A 禁止行为与 interface 变化。
- 已知坑: legacy 目录是临时形态，必须由 T0021 删除而非长期保留。

### 实现锚点（坐标集中地）
- `src/shared/types.ts`、`constants.ts`、`redaction.ts`
- `src/shared/event_*.ts`、`capture_stats.ts`
- `src/shared/archive_builder.ts`、`export_*.ts`、`system_time.ts`
- `packages/capture_domain/src/legacy/`

### 可测性契约（必填，无 N/A 例外）
- 应用启动方式: `npm test && npm run build`
- AC-1 验收信号: typecheck + import scan；通道: CLI。
- AC-2 验收信号: 相关 Vitest 行为结果；通道: 直驱。
- AC-3 验收信号: package dependency scanner；通道: CLI。
- 预期失败模式（建议每条 AC 1 条反例）:
  - AC-1 若双真相源存在则旧 import 扫描失败。
  - AC-2 若常量或序列化字段变化则 fixture 失败。
  - AC-3 若引入平台依赖则 package build/scan 失败。

## 待澄清 [NEEDS CLARIFICATION]
无
