# 已完成任务归档 — 2026-06-12

> 提交: `64e9245` `a2c24f9` `7dca82b` `a3caef1` `ef96e0b`

---

## P0.15-R1 延迟队列多候选竞态 — cdp_only 重复残留

- **Commit**: `ef96e0b`
- **根因**: `_deferred_cdp_index: Map<string, string>` 单 key 映射，多 CDP 候选共享同一 deferred_key。第一个 CDP body 消耗 deferred 后，第二个 body 找不到 deferred → 走 orphan → 产生重复 `cdp_only` 记录
- **修复**:
  1. `_deferred_cdp_index` 改为 `Map<string, Set<string>>`，一个 cdp_id 可关联多个 deferred_key
  2. `DeferredEntry` 增加 `pending_cdp_ids: Set<string>`，追踪所有未 resolve 的 CDP 候选
  3. `try_resolve_deferred` 遍历所有关联 deferred，仅当 pending_cdp_ids 变空才 emit 合并
  4. `handle_completed` 使用 Set 构建反向索引
  5. `schedule_orphan_check` 同步清理反向索引
- **影响文件**: `src/background/network_capture.ts`、`tests/network_capture.test.ts`（+5 测试）

---

## P1.8.1 深色模式下统计数字颜色为黑色

- **Commit**: `64e9245`
- **根因**: `.dt-metric` 是 `<button>` 元素，Chrome UA 样式 `color: buttontext` 覆盖继承的 `var(--ink)`，深色模式下 `buttontext` 为黑色
- **修复**: `.dt-metric` 添加 `color: var(--ink)`
- **影响文件**: `src/dashboard/dashboard-pages.css`

---

## P1.8.2 详情页左侧标签导航宽度不可调

- **Commit**: `a2c24f9`
- **根因**: `.dt-rail` 在 grid 中宽度固定 252px，无拖拽机制
- **修复**:
  1. `.dt-rail` 添加 `position: relative` + `.dt-rail-handle` 拖拽手柄（`cursor: col-resize`）
  2. `wire_rail_resize()`: mousedown → mousemove 更新 grid-template-columns → mouseup 存 localStorage
  3. 约束 160px ~ 480px，页面加载时恢复
- **影响文件**: `src/dashboard/dashboard-pages.css`、`src/dashboard/dashboard.ts`

---

## P1.8.3 详情页标签不全 — 只显示部分数据标签

- **Commit**: `7dca82b`
- **根因**: DT_TABS 仅 7 个 tab（概览/时间线/网络/控制台/证据/存储/本次配置），缺少独立数据标签
- **修复**:
  1. DT_TABS 扩展为 10 个：概览/时间线/用户行为/页面导航/网络请求/控制台/错误异常/Storage/Cookie/本次配置
  2. `render_detail_tab()` 新增 user_action / navigation / error / storage / cookie 渲染
  3. 拆分原 evidence→用户行为+页面导航+错误异常，storage→Storage+Cookie
- **影响文件**: `src/dashboard/dashboard.ts`

---

## P1.8.4 时间线标签名与七标签不一致

- **Commit**: `a3caef1`
- **根因**: KIND_LABEL 和 quick filter 标签名与 popup 七标签口径不一致
- **修复**:
  - `用户`→`用户行为`、`导航`→`页面导航`、`网络`→`网络请求`、`错误`→`错误异常`、`存储`→`Storage`
  - Quick filter: `用户操作`→`用户行为`、`错误`→`错误异常`、`存储`→`Storage`
- **影响文件**: `src/dashboard/dashboard.ts`
