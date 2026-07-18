# DevTools 面板

`src/devtools/`。提供 DevTools panel 注册入口。**设计优先级低于 popup 和 dashboard，目前无独立 UI 资产**。

## 1. 注册

`manifest.json`:

```json
{ "devtools_page": "src/devtools/devtools.html" }
```

`devtools.html` 加载 `devtools.ts`，后者通过 `chrome.devtools.panels.create` 注册一个面板，**指向 Dashboard**（`src/dashboard/dashboard.html`）。此举复用 Dashboard 能力，避免维护空白 `devtools_panel.html`。

## 2. 文件

| 文件 | 职责 |
|---|---|
| `devtools.html` | devtools_page 入口 |
| `devtools.ts` | 注册面板（指向 dashboard） |

`devtools_panel.html` / `devtools_panel.ts` 已删除：面板复用 dashboard 全量能力，无需单独内容。

## 3. 与 DevTools 的互斥约束

`chrome.debugger.attach`（扩展 CDP 路径）与打开的 DevTools 互斥——DevTools 打开时扩展无法 attach，触发 External CDP Bridge 或 Fallback Hook 降级（见 `network_body_capture.md` §4）。

## 4. 测试覆盖

行为 mock 测试（`tests/devtools_panel.test.ts`）：直接断言 `chrome.devtools.panels.create` 调用参数，不依赖源码字符串。
