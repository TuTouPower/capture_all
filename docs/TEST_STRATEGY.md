# 测试策略改进方案

> 日期：2026-06-13
> 起因：P0.36/P0.38/P0.39/P0.40/P0.41/P0.43 共 6 个 bug 均为用户发现而非测试发现

## 1. 当前测试结构

42 个测试文件，542 个测试，全通过。但几乎全是**孤立单元测试**——每个文件测自己的函数，mock 所有依赖。

```
测试金字塔（当前）：
        /\
       /E2E\         ← 2-3 个有效的 E2E，断言松（条件跳过）
      /------\
     /        \
    / Agent单测 \    ← 100+ 个，只测 agent 协议层
   /------------\
  / 采集模块单测   \   ← 200+ 个，测 network_capture/network_correlator 等
 /----------------\
/   布局/UI 单测    \  ← 100+ 个，测 popup_layout 宽高、WCAG 对比度等
```

**缺少的是金字塔中间层——跨模块集成测试。**

## 2. 漏掉的 Bug 及根因

| Bug | 测试层面 | 为什么没发现 |
|-----|---------|-------------|
| P0.36 | `event_category.test.ts` 只覆盖 2/20+ 映射 | 没测实际 content script 上报的 type 值是否在白名单内 |
| P0.38 | `system_time.test.ts` 只断言 `*_label` 存在 | 没读一个真实的导出 JSON 验证 `started_at` 不是 UTC |
| P0.39 | `network_cdp.test.ts` 把跨 tab 假成功当正确行为 | 测试假设「一个采集周期只监听一个 tab」，与真实使用不符 |
| P0.40 | 3 个导出入口没有去重检查 | 没有「三个入口都调用同一个函数」的约束测试 |
| P0.41 | `network_capture.test.ts` 的 CDP mock 不用真实 `sendCommand` | 没有端到端验证「CDP 事件 → 完整 NetworkRequestData」 |
| P0.43 | `get_capture_data` 测试不 real Write | stats 和 events 用了不同的写入时机，但没有一致性 check |

**共同特征**：所有漏掉的 bug 都是跨模块协作问题。单模块单测测了「每个函数行为正确」，没测「两个模块协作结果正确」。

## 3. 需要新增的测试层级

### 3.1 数据管道测试（Data Pipeline Test）

**目的**：验证「写入 → 存储 → 读取」的闭环一致性。

```
给定：写入 N 条 input_event、M 条 network_request
当：stop capture → flush → get_capture_data
则：stats.user_action_count === events.filter(category=user_action).length
    stats.network_count === network_requests.length
```

**覆盖的 bug 模式**：P0.43（stats/events 不一致）、P0.36（type 过滤导致事件归类错误）。

**文件示例**：`tests/pipeline_consistency.test.ts`
- 写入事件到 storage → flush → 读取 → 验证计数匹配
- 采集配置不同组合 → 验证输出事件类型符合预期

### 3.2 导出闭环测试（Export End-to-End Test）

**目的**：验证「采集数据 → 导出 JSON → 解析 → 字段完备」的完整链路。

```
给定：一次完整的采集记录（含 events、network_requests 等）
当：调用 export_session → 生成 JSON
则：
  started_at 不含 'Z'（时区已转换）
  system_time_timezone 非空
  所有 resource_type 为小写
  有 response_body 的请求 capture_method = 'cdp_primary'
  response_body_status != 'not_enabled' 的请求数 > 总请求数的 30%
```

**覆盖的 bug 模式**：P0.38（时区字段）、P0.31（resource_type 大小写）、P0.41（not_enabled 占比）。

**文件示例**：`tests/export_integrity.test.ts`

### 3.3 入口去重测试（Entry Point Unification Test）

**目的**：确保多个导出入口共享同一段逻辑。

```
给定：popup.ts、dashboard.ts、detail.ts 三个文件
当：搜索 'download_blob' import
则：三个文件都从 '../shared/export_utils' import download_blob
    没有文件自行实现 Blob → <a>.click() 或 chrome.downloads.download
```

**覆盖的 bug 模式**：P0.40（导出代码碎片化）。

**文件示例**：已存在（`export_utils.test.ts` 的 import 检查），需推广到更多共享函数。

### 3.4 渲染数据一致性测试（Render-Data Consistency Test）

**目的**：确保 UI 统计数字和实际渲染行数匹配。

```
给定：detail_events 含 11 条 user_action 事件
当：调用 render_simple_events(events, 'user_action')
则：返回的 HTML string 包含 11 个 <tr> 或同等行元素
    不是 0 行，不是 '暂无数据'
```

**覆盖的 bug 模式**：P0.43（tab 无数据）、P0.36（type 白名单）。

**文件示例**：`tests/detail_render_consistency.test.ts`

### 3.5 回归快照测试（Snapshot Regression Test）

**目的**：每次改动后跑一套固定的回归检查清单。

```typescript
// tests/regression_smoke.test.ts
test('P0.38: started_at is not UTC', async () => { ... });
test('P0.31: no PascalCase resource_type', async () => { ... });
test('P0.41: not_enabled ratio < 50%', async () => { ... });
test('P0.43: stats count matches event array length', async () => { ... });
test('P0.40: all export entries import from export_utils', async () => { ... });
```

**覆盖的 bug 模式**：所有已修复的 P0 bug 不再复发。

## 4. 实施优先级

| 优先级 | 测试类型 | 原因 |
|--------|---------|------|
| **P0** | 回归快照测试 | 直接防止已修复 bug 复发，成本最低 |
| **P0** | 数据管道测试 | P0.43 级别 bug 影响数据可信度 |
| **P1** | 导出闭环测试 | 导出是用户最终拿到的产物 |
| **P1** | 渲染数据一致性测试 | P0.36/P0.43 类型白名单 bug |
| **P2** | 入口去重测试 | P0.40 已有部分覆盖，需推广 |

## 5. 具体改动

```
tests/
├── regression_smoke.test.ts        # 新建：每个已修复 P0 bug 一个回归测试
├── pipeline_consistency.test.ts    # 新建：写入→flush→读取→计数匹配
├── export_integrity.test.ts        # 新建：导入真实导出 JSON 验证字段完备
├── detail_render_consistency.test.ts # 新建：stats 计数 vs 渲染行数
├── entry_unification.test.ts       # 新建：跨模块共享函数使用审计
└── ... (现有测试不变)
```

每个新测试文件 5-15 个测试，预计新增 40-60 个测试。
