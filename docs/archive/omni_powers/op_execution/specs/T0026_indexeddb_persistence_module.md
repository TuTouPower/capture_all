---
status: approved
type: refactor
eval: required
---
# 深化 IndexedDB persistence module

## 一句话意图
把 IndexedDB schema、capture/event store、buffer、size 与 legacy decode 收入深 persistence implementation，对外只保留 CaptureReader/CaptureWriter interface。

## 不变量（INV）
- INV-1: DB 名严格保持 `capture_all_db`，版本严格保持 `3`。
- INV-2: v1 legacy stores 和 v2/v3 现行 stores、keyPath、indexes 均不得删除或改变。
- INV-3: periodic flush 间隔、batch size、最大 capture size 与 stop 强制 flush 行为不变。
- INV-4: 升级不得清空或重建用户数据库。

## 验收场景（AC）
- AC-1: Given v1/v2 DB fixture When v3 adapter 打开 Then原 store/data 保留且现行 schema 完整。
- AC-2: Given buffered writes When batch/interval/stop 条件触发 Then commit 顺序、事件数量和 size 统计正确。
- AC-3: Given capture CRUD 与分页/snapshot 查询 When 经 interface 调用 Then结果与基线一致。
- AC-4: Given transaction/write 失败 When flush Then未提交 batch 不静默丢失，并返回明确错误。

## 边界与反例
- 内部可拆 schema、capture_store、event_store、buffered_writer、size_tracker、legacy_decoder；它们不是全部公共 interface。
- 不为每个 object store 暴露一个调用者必须学习的浅 repository。

## 不做的事
- 不升级 DB_VERSION。
- 不迁移或删除 legacy store 数据。
- 不重构 export 格式。

## 技术决策
### 条件强制（被 2+ task 依赖的决策）
- 调用者只学习 CaptureReader/CaptureWriter 的一致性、flush 与错误契约，不知道 object store 路由。

### 设计探索结论（命中方案先行信号时）
- 候选: per-store repositories / 单一深 persistence module。
- 推荐: 单一深 module + 内部 seams —— store 路由、事务、buffer 和 size 高度协同。
- 已知坑: transaction failure 后 buffer 生命周期必须明确定义，避免重复或丢失。

### 实现锚点（坐标集中地）
- `apps/extension/background/persistence/`
- `packages/capture_domain/src/persistence/`
- `apps/extension/runtime/capture_snapshot_gateway.ts`
- DB upgrade fixtures

### 可测性契约（必填，无 N/A 例外）
- 应用启动方式: `npm test && npm run build && npm run test:e2e:all`
- AC-1 验收信号: store/index/data matrix；通道: 直驱。
- AC-2 验收信号: fake clock + transaction records；通道: 直驱。
- AC-3 验收信号: shared reader/writer contract suite；通道: 直驱。
- AC-4 验收信号: forced transaction abort + retry/error assertion；通道: 直驱。
- 预期失败模式（建议每条 AC 1 条反例）:
  - AC-1 若 version/store/index 漂移则 fixture 失败。
  - AC-2 若 stop 未 flush 则事件数减少。
  - AC-3 若 implementation 泄漏则 fake contract 无法运行。
  - AC-4 若 batch 被清空则 retry 数据缺失。

## 待澄清 [NEEDS CLARIFICATION]
无
