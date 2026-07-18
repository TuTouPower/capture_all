---
status: approved
type: refactor
eval: required
---
# 建立统一 CaptureExporter deep module

## 一句话意图
把四格式生成、排序、body、redaction、system time 与 HTML 安全嵌入收进统一 CaptureExporter，Extension adapter 只负责一致 snapshot 与下载。

## 不变量（INV）
- INV-1: JSON、JSONL、HAR、HTML 四格式与文件命名继续支持。
- INV-2: 排序、body 处理、archive entries、redaction 与大导出策略保持兼容。
- INV-3: HTML text escape 与 script JSON embed escape 必须使用不同规则。
- INV-4: domain exporter 不依赖 Chrome download 或 UI。

## 验收场景（AC）
- AC-1: Given 同一 CaptureSnapshot When 导出四格式 Then 数据数量、顺序、关键字段与基线一致。
- AC-2: Given response body 包含、排除、截断配置 When 导出 Then 各格式遵守同一 body 规则。
- AC-3: Given `</script>`、HTML attribute、Unicode line separator 等 payload When 打开 HTML Then 无脚本执行且数据可回读。
- AC-4: Given UI/Agent export When 调用 Then adapter 只负责 flush、snapshot、用户配置、下载/文件输出，不重复格式逻辑。

## 边界与反例
- CaptureExporter interface 应隐藏排序、escape、archive 与 body 决策；若调用者仍需手工拼装则 interface 太浅。
- 不改变 MCP 大结果落盘阈值与 Bridge result-file 契约。

## 不做的事
- 不新增格式。
- 不改变导出 UI。
- 不重构 persistence 之外的查询功能。

## 技术决策
### 条件强制（被 2+ task 依赖的决策）
- 领域 implementation 生成格式结果，平台 adapter 管理 IO；两者通过小 interface 协作。

### 设计探索结论（命中方案先行信号时）
- 候选: 四个独立 exporter / 单一 exporter + 内部格式 implementations。
- 推荐: 单一外部 interface + 内部格式 implementations —— 共享排序、安全与 body 规则并保持 locality。
- 已知坑: JSON embed 不能复用普通 HTML escape，否则数据损坏或 XSS。

### 实现锚点（坐标集中地）
- `packages/capture_domain/src/export/`
- `apps/extension/background/export/`
- UI export 调用点与 Agent export adapter
- export/unit/Playwright XSS tests

### 可测性契约（必填，无 N/A 例外）
- 应用启动方式: `npm test && npm run build && npm run test:e2e:all`
- AC-1 验收信号: parsed golden fixtures；通道: 直驱。
- AC-2 验收信号: cross-format body matrix；通道: 直驱。
- AC-3 验收信号: browser sentinel 不变化且 embedded data 可解析；通道: CDP。
- AC-4 验收信号: adapter interaction tests；通道: 直驱。
- 预期失败模式（建议每条 AC 1 条反例）:
  - AC-1 若排序/字段漂移则 golden 失败。
  - AC-2 若格式各自实现规则则一致性矩阵失败。
  - AC-3 若 payload 执行则 sentinel 变化。
  - AC-4 若调用者重复格式逻辑则 duplicate rule scan/review 失败。

## 待澄清 [NEEDS CLARIFICATION]
无
