---
status: approved
type: refactor
eval: required
---
# 纯迁移 Background 核心与 adapters

## 一句话意图
把 Service Worker、storage、logging、export 与 Agent adapters 整体迁入 `apps/extension/background`，使 Extension 完全从产品目录构建且行为不变。

## 不变量（INV）
- INV-1: `service_worker.ts`、`storage.ts`、`exporter.ts` 只移动，不拆函数或改 interface。
- INV-2: DB v3 schema、legacy stores、buffer 与 periodic/stop flush 顺序不变。
- INV-3: 大 snapshot 继续先 flush 后页面直读 IndexedDB，不通过 runtime message body 返回。
- INV-4: Agent enroll、heartbeat、poll、result 路由和 header 语义不变。

## 验收场景（AC）
- AC-1: Given 新 Extension 产品目录 When build Then manifest 所有生产入口仅来自 `apps/extension/**`。
- AC-2: Given 真机 start→capture→stop→detail→export When 执行 Then状态、记录与四格式结果符合基线。
- AC-3: Given legacy DB fixture 与 Service Worker restart When 运行 Then 历史数据可读、stale capture 恢复、停止强制 flush。
- AC-4: Given Bridge online When Extension 自动连接 Then enroll/heartbeat/command/result 闭环行为不变。

## 边界与反例
- 跨层 shared 文件允许临时放入 `runtime/legacy` 或 background 合理位置，但不设计新 seam。
- 任何 action、状态字段、stop 顺序调整都属于后续轨 B。

## 不做的事
- 不拆 MessageRouter、CaptureRuntime、StopPipeline。
- 不拆 storage implementation。
- 不改变导出格式或安全策略。

## 技术决策
### 条件强制（被 2+ task 依赖的决策）
- T0018 完成后 Extension 生产构建不得再以 `src/**` 为入口。

### 设计探索结论（命中方案先行信号时）
- 候选: 核心文件逐个迁 / 同一行为闭环整体迁。
- 推荐: 整体迁移 —— Service Worker、storage、export、Agent 调用相互耦合，单 commit 仍仅机械变化。
- 已知坑: 文件数较多，workset 必须精确列旧新路径并用产物/真机双门验证。

### 实现锚点（坐标集中地）
- `src/background/service_worker.ts`、`storage.ts`、`app_log_storage.ts`、`exporter.ts`
- `src/background/agent_*.ts`、`keepalive.ts`
- `src/shared/logger.ts`、`capture_data_reader.ts`、`agent_bridge_config.ts`、`chrome.d.ts`
- `apps/extension/background/`、`apps/extension/runtime/legacy/`

### 可测性契约（必填，无 N/A 例外）
- 应用启动方式: `npm test && npm run build && npm run test:e2e:all`
- AC-1 验收信号: entry/import scan 与 dist manifest；通道: CLI。
- AC-2 验收信号: headed core workflow；通道: CDP。
- AC-3 验收信号: IndexedDB fixture + restart tests；通道: 直驱 + CDP。
- AC-4 验收信号: Bridge HTTP request trace/status；通道: 直驱。
- 预期失败模式（建议每条 AC 1 条反例）:
  - AC-1 若旧入口残留则 migration gate 失败。
  - AC-2 若页面/消息路径错误则真机流程中断。
  - AC-3 若 flush 被跳过则事件数减少。
  - AC-4 若配置路径错则实例 offline。

## 待澄清 [NEEDS CLARIFICATION]
无
