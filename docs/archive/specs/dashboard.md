# Spec — dashboard

扩展管理 UI（Dashboard）。HTML/TS/CSS 三层，通过 chrome.runtime.sendMessage 与 SW 通信。

## 页面

| 页面 | 路由 | 功能 |
|------|------|------|
| captures | `#captures` | 采集列表 + 搜索/筛选/状态过滤 + 批量导出/删除 |
| detail | `#detail?capture=<id>` | 单采集详情（timeline/network/console tabs） |
| settings | `#settings` | 配置（采集选项/隐私/Bridge/主题/语言/时间/导出） |
| current | `#current` | 当前活跃采集（实时） |
| exports | `#exports` | 导出任务（按采集列表逐一导出） |

默认页：captures。DevTools 面板入口指向 dashboard。

## 轮询

2s 间隔单飞（poll_in_flight）：
- load_captures：签名含 capture_id + status + event_count + request_count。变化时 render_content。
- detail 页：活跃采集时 load_detail 增量更新。

## captures 页（T039）

搜索/筛选/重置控件：
- `#capSearch`：input debounce 300ms，按名称/URL/标签过滤。render 后恢复焦点与光标。
- 状态过滤：3 按钮（全部/采集中/已完成）。
- `#capReset`：清空搜索 + 状态过滤。

## detail 页

Tabs：
- timeline（时间线 + 事件列表 + track marker）
- network（请求列表 + 详情面板）
- console（控制台事件列表）
- overview（采集摘要 + 统计）

列表渲染用 O(n) 预计算 index（避免 indexOf O(n²)）。

## exports 页（T040）

`wire_exports()` 绑定 `[data-export]` click 复用 `export_capture(id)`。

## 侧边栏

可调整宽度（sidebar_resize）。导航：captures / current / exports / settings。

## 主题与国际化

- 主题：light / dark / follow-system。
- 语言：en / zh_CN。
- 时间显示：system / relative / absolute（system_time_timezone 配置）。
