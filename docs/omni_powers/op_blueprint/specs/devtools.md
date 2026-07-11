# DevTools 面板

`src/devtools/`。轻量入口，提供 DevTools 集成面板。设计优先级低于 popup 和 dashboard。

## 1. 注册

`manifest.json`：

```json
{ "devtools_page": "src/devtools/devtools.html" }
```

`devtools.html` 加载 `devtools.ts`，后者通过 `chrome.devtools.panels.create` 注册一个面板，指向 `devtools_panel.html`。

## 2. 文件

| 文件 | 职责 |
|---|---|
| `devtools.html` | devtools_page 入口 |
| `devtools.ts` | 注册面板 |
| `devtools_panel.html` | 面板 UI |
| `devtools_panel.ts` | 面板逻辑 |

## 3. 与 DevTools 的互斥约束

`chrome.debugger.attach`（扩展 CDP 路径）与打开的 DevTools 互斥——DevTools 打开时扩展无法 attach，触发 External CDP Bridge 或 Fallback Hook 降级（见 `network_body_capture.md` §4）。

## 4. 测试覆盖

E2E 优先级 P2，不做强制覆盖（见 `test.md`）。
