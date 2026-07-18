---
status: approved
type: refactor
eval: required
---
# 按知识所有权规范化三个 packages

## 一句话意图
在纯迁移总门通过后，按知识所有权拆除 legacy 大杂烩，形成单向依赖且只有根公共 interface 的三个 package。

## 不变量（INV）
- INV-1: 这是轨 B 唯一入口；T0020 未通过不得开始。
- INV-2: 序列化字段、默认值、deprecated alias 与运行行为不变。
- INV-3: package 依赖严格为 `shared_kernel <- capture_domain <- agent_protocol`。
- INV-4: packages 不依赖 `apps/**`、Chrome、Node HTTP、DOM UI 或 MCP SDK。

## 验收场景（AC）
- AC-1: Given `capture_domain` legacy 类型 When 重组 Then capture、event、config、export、persistence、logging 各归明确知识所有者。
- AC-2: Given Extension-only 配置类型 When 重组 Then 移出 domain 且调用者仍保持相同行为。
- AC-3: Given 全部生产 import When 扫描 Then 只从 package 根导入，无 `packages/*/src/*` 深导入。
- AC-4: Given package dependency graph When 检查 Then 无反向依赖或平台依赖。

## 边界与反例
- 不以 `common.ts`、`misc.ts`、新 `shared/types.ts` 代替旧大杂烩。
- 类型移动不允许改 JSON 字段、枚举值或兼容 alias。

## 不做的事
- 不建立 Chrome runtime adapters。
- 不拆 Service Worker、Bridge 或 MCP implementation。
- 不移动测试目录。

## 技术决策
### 条件强制（被 2+ task 依赖的决策）
- package 根 `index.ts` 是唯一公共 interface；内部路径属于 implementation。
- 领域 interface 只表达调用者必须知道的不变量、排序、错误和性能特征。

### 设计探索结论（命中方案先行信号时）
- 候选: 按技术类型分文件 / 按知识所有权分 module。
- 推荐: 按知识所有权 —— 修改 capture/event/export 时具有 locality，避免跨文件散布。
- 已知坑: interface 过细会产生大量浅 module，优先小 interface + 深 implementation。

### 实现锚点（坐标集中地）
- `packages/shared_kernel/src/`
- `packages/capture_domain/src/legacy/`
- `packages/agent_protocol/src/`
- `apps/**/*.ts` import

### 可测性契约（必填，无 N/A 例外）
- 应用启动方式: `npm test && npm run build`
- AC-1 验收信号: public exports + behavior tests；通道: 直驱。
- AC-2 验收信号: package dependency graph 与 Extension config tests；通道: CLI + 直驱。
- AC-3 验收信号: deep-import scanner；通道: CLI。
- AC-4 验收信号: project-reference build/graph；通道: CLI。
- 预期失败模式（建议每条 AC 1 条反例）:
  - AC-1 若知识仍混杂则 legacy/misc 扫描失败。
  - AC-2 若序列化变化则 config fixture 失败。
  - AC-3 若深导入出现则静态门失败。
  - AC-4 若反向依赖出现则 package build graph 失败。

## 待澄清 [NEEDS CLARIFICATION]
无
