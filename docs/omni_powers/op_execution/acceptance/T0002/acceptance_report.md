# 时间线标记点击跳转 验收报告

## 验收结果

| 验收标准 | 结果 | 证据 |
|---|---|---|
| AC-1: 点击标记后 playhead 跳到事件时间 | PASS | playhead 从 49.5% 跳至 10.2718%（对应标记事件） |
| AC-2: 点击标记后 inspector 面板打开 | PASS | `.dt-insp` 可见，含 156 字符事件详情内容 |
| AC-3: inspector 切换事件 | FAIL | 点击 idx=0 标记再点 idx=15 标记，inspector 文本完全一致（均为 "tab_switch · 页面导航"）。不同事件索引展示相同内容 |
| AC-4: 拖动标记不打开 inspector | FAIL | 在标记上 drag 100px（远超 3px 阈值），inspector 仍然打开。playhead 移动到鼠标终点而非事件时间 |

## 验收裁决: FAIL

2 of 4 AC fail. AC-3（事件切换）和 AC-4（拖动不打开 inspector）未通过。

## 失败详情

### AC-3 失败根因

点击两个不同 `data-event-idx`（0 vs 15）的标记后，inspector 显示的文本完全一致：

```
类型页面导航 · tab_switch
时间+00.514s
绝对时间2026-07-12 19:34:22
来源background
```

两个不同事件索引展示相同的事件详情，说明 `set_dt_sel(idx)` 未正确按 idx 切换 inspector 内容。

### AC-4 失败根因

在标记上 mousedown → 右移 100px → mouseup 后 inspector 仍然打开。playhead 移动到 80.2394%（鼠标终点位置），而非事件时间。说明：

1. 标记 pointerdown 后的 stopPropagation 未防止 pointer 事件进入 lanes seek 流程（playhead 跳到鼠标物理坐标）
2. 位移阈值检查失败——100px 位移应判为 drag 而非 click，但仍触发了 inspector 打开

## 固化清单

| 测试文件 | 对应验收标准 | 破坏检查 |
|---|---|---|
| e2e-final-t0002.cjs | AC-1 ~ AC-4 | 待 FAIL 修复后补做 |

> E2E 脚本已在 worktree 中验证可运行。AC-1/AC-2 的 PASS 通道已验证脚本能正确检测行为。待 AC-3/AC-4 修复后，破坏检查在固化时执行。

## 对抗探索发现

- 点击 lanes 空白区域行为正常（仅 seek，不打开 inspector）
- 快速连续点击不同标记不会导致崩溃或重复渲染
- 所有可见标记的 `data-event-idx` 属性已正确注入（值 0, 1, 2, 10, 11, 15, 27）
- 重叠位置标记（idx=0/1/2 均在 x≈734，2px 宽区间内重叠）——点击任一可能命中同一 DOM 元素，边界与反例"标记重叠"未满足

## 可用性判断

AC-1 和 AC-2 通过说明核心交互路径（点击→seek+打开面板）可工作。但 AC-3 失败意味着用户查看不同事件时 inspector 内容不更新——严重影响可用性。AC-4 失败导致拖动体验异常（inspector 意外弹出）。

## 范围外发现

- 标记重叠问题：idx=0/1/2 三个标记位置几乎完全重叠（left 差值 < 0.12%，对应 <1px），用户无法区分点击。虽未列入 AC，但影响实际可用性。建议在标记重叠时增加 lane 间距或视觉区分。
