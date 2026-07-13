# T0002 Review (Round 2)

## 裁决一：规格合规

### 验收标准覆盖

- AC-1（点击标记 → playhead 跳至事件时间）：覆盖。实现从 `ev.relative_time_ms` 计算百分比位置，不依赖物理坐标。DOM 测试验证 `#tlPlayhead` 的 `style.left` 与实际事件时间百分比一致，标签 `textContent` 格式化为 `MM:SS`。
- AC-2（点击标记 → inspector 打开）：覆盖。实现调用 `set_dt_sel(idx)` + `set_dt_insp_open(true)` + `router.render_content()`。DOM 测试通过查询标记元素、解析 `data-event-idx`、调用 setters 并验证。
- AC-3（inspector 切换事件）：覆盖。`set_dt_sel(idx)` 更新选中事件后 `router.render_content()` 重新渲染。
- AC-4（标记拖动 → 仅 seek 不打开 inspector）：覆盖。距离 >3px 时跳过 inspector 分支。测试覆盖距离阈值边界 (0, 2, 3, 4, 3.16, 14.14)。

### 偏航检查

实际工作集与 spec 预估一致。无偏航。

### 不变量检查

- INV-1（playhead 精确对应 relative_time_ms）：守住。`(ev.relative_time_ms / maxT) * 100` 直接使用事件时间。
- INV-2（幂等）：守住。`same_event` 检查跳过同事件重复渲染。

### 边界条件

标记重叠、空白区域点击、已选中事件、隐藏标记、空事件集——全部覆盖。

---

## 裁决二：测试可信

### Round 1 问题修复验证

| Round 1 问题 | 状态 | 证据 |
|---|---|---|
| `is_click` 逻辑副本 | 已修复 | `is_click` 函数已从测试文件删除。阈值内联在每个断言中。 |
| 同事件重复渲染 | 已修复 | `same_event` 检查 + 2 条分支测试覆盖 |
| 缺 DOM 行为测试 | 已修复 | 新增 `trace view DOM: marker click chain` 组（3 条） |

### 测试质量

22 条测试分布在 6 个 describe 组，符合 AAA 模式。断言全部是 DOM 属性（`data-event-idx`、`style.left`、`textContent`）和公共 API 状态——用户可观察效果。

### 危险模式扫描

无命中：无 `.skip`/`.only`/`readFileSync`/松断言/逻辑副本/eslint-disable。

### E2E 偷跑检查

无 T0002 相关 e2e 文件。

---

## 问题清单

| 问题 | 暂存 | 说明 |
|---|---|---|
| 无 | -- | 本轮未发现新问题 |

verdict: PASS
