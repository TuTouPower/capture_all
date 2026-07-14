# 浏览器扩展商店发布清单

**已包含所有可直接复制粘贴的字段。截图由 Playwright 脚本自动捕获到 `assets/screenshots/`。隐私政策直接指向本仓库 `PRIVACY.md`。**

隐私政策 URL：`https://github.com/TuTouPower/capture_all/blob/main/PRIVACY.md`

---

## 公共字段（两个商店通用）

| 字段 | 值 |
|------|-----|
| 扩展名 | Capture All |
| 版本 | 0.1.0 |
| 类目 | Developer Tools |
| 简短描述英文（≤132 字符） | Capture browser activity on a single timeline: clicks, navigation, network, console, errors, storage, and cookies. |
| 简短描述中文（≤132 字符） | 将浏览器活动（点击、导航、网络请求、控制台、异常、Storage、Cookie）采集到统一时间线，支持本地导出与 AI Agent 集成。 |
| 隐私政策 URL | https://github.com/TuTouPower/capture_all/blob/main/PRIVACY.md |

## 详细描述（英文，两个商店复制）

```
Capture All is a Chrome Manifest V3 extension that turns browser activity into local structured evidence. On a single, unified timeline it captures 7 data groups: user behavior, page navigation, network requests, console output, runtime exceptions, storage changes, and cookie changes.

Visualize and inspect via popup, main panel, and DevTools panel.
Export locally to JSON, JSONL, HTML, or HAR files.
Or connect the authorized local Bridge to an MCP client like Claude Code, so an AI Agent can control capture, query records, and export results on your behalf.

All captured data stays in local IndexedDB inside the browser — nothing is uploaded or shared with any server unless you explicitly export a file or run an MCP query. The local-bound Bridge listens on 127.0.0.1 only.
```

## Single purpose（Chrome 必填）

```
Capture browser activity (user actions, navigation, network, console, exceptions, storage, cookies) as structured, local-first evidence for debugging, exporting, and AI-agent querying.
```

## Notes for reviewer（Edge 必填）

```
This is a browser debugging black box extension. To test:

1. Click the extension icon to open the Capture All popup.
2. Check the capture options (user actions, network, console, storage, cookies, etc.).
3. Click "Start Capture" to begin collecting browser activity locally.
4. Click "Stop Capture".
5. Open the capture row to view the unified timeline, then expand any row to see details.
6. Click "Export" to save the capture as JSON / JSONL / HTML / HAR locally.
7. (Optional) To test AI integration: start the local Bridge with a self-generated random token, point your MCP client at http://127.0.0.1:17831, then run get_status / start_recording / stop_recording / list_captures from the agent.

All data stays in the browser's local IndexedDB — nothing is uploaded unless the user explicitly exports a file or runs an MCP query. The local Bridge listens on 127.0.0.1 only.
```

---

## Chrome Web Store 字段

Dashboard：https://chrome.google.com/webstore/devconsole

## Store Listing

- Language: English + 简体中文
- Title: Capture All
- Short description: Capture browser activity on a single timeline: clicks, navigation, network, console, errors, and cookies. Visualize, export, or query via AI Agent.
- Detailed description: 见上方"详细描述"
- Category: Developer Tools
- Store icon: `artifacts/dist/assets/icons/icon128.png`
- Screenshots: 见截图表

## Privacy practices

### Data handling

| 用途 | 使用？ |
|------|--------|
| Remote code execution | No |
| User activity data | Yes |
| Web content data | Yes |
| Sensitive data (passwords, credit cards) | Indirect only |

### Privacy policy URL

https://github.com/TuTouPower/capture_all/blob/main/PRIVACY.md

## Permission justifications

#### storage

```
Persists capture options and session metadata in chrome.storage.local.
```

#### webRequest

```
Observes HTTP/HTTPS request and response metadata: URL, method, status, timing, headers.
```

#### debugger

```
Attaches to Chrome DevTools Protocol to capture console output, runtime exceptions, and optionally request/response bodies for local debugging and export.
```

#### tabs

```
Queries active tabs to coordinate Content Script capture across all open pages.
```

#### alarms

```
Schedules periodic tasks to maintain the capture lifecycle when the Service Worker is suspended under MV3.
```

#### downloads

```
Saves exported JSON/JSONL/HAR/HTML files to local file system on demand.
```

#### cookies

```
Reads cookie creation, updates, and deletions to capture cookie behavior.
```

#### `<all_urls>`（host permission）

```
Runs declarative Content Script and observes user behavior and network activity across origins the user visits.
```

## Distribution

- Visibility: Public
- Countries: All countries

---

## Microsoft Edge Add-ons 字段

Dashboard：https://partner.microsoft.com/dashboard/microsoftedge/overview

## Store Listing

- Language: English / 中文
- Name: Capture All
- Description: 见"详细描述"
- Category: Developer tools
- Icon: `artifacts/dist/assets/icons/icon128.png`
- Screenshots: 见截图表

## Notes for reviewer

见上方"Notes for reviewer"。

## Permission Justification

#### storage
```
Persists capture options and session metadata in chrome.storage.local.
```

#### webRequest
```
Observes HTTP request/response metadata for capture.
```

#### debugger
```
Attaches to Chrome DevTools Protocol to capture console output, runtime exceptions, and optionally request/response bodies.
```

#### tabs
```
Needed to coordinate capture across multiple open tabs.
```

#### alarms
```
MV3 Service Worker needs periodic wake to keep the capture lifecycle running.
```

#### downloads
```
Saves exported evidence files to the local file system.
```

#### cookies
```
Reads cookie creation, updates, and deletions for capture.
```

#### host permission（<all_urls>）
```
Runs declarative Content Script and observes user behavior and network activity on visited origins.
```

## Data usage certification

| 选项 | 选择 |
|------|------|
| Does your extension collect or use personal data? | Yes |
| Is all personal data encrypted in transit? | Yes (HTTPS / 127.0.0.1 only) |
| Does your extension sell user data? | No |
| Required privacy policy? | Yes |

## Remote code disclosure

| 问题 | 答案 |
|------|------|
| Does your extension load remote code? | No |
| Is all code packaged in the .zip? | Yes |
| Content Security Policy | script-src 'self' |

## Account requirements

- Microsoft Partner Center 开发者账号（免费）
- Primary Owner 需 Microsoft account (MSA)
- 需通过 Microsoft Edge App Developer Agreement

---

## 截图自动化

脚本：`scripts/capture_store_screenshots.mjs`（Playwright + `chromium.launchPersistentContext`）。

步骤：
1. `chromium.launchPersistentContext` 以 `--load-extension=artifacts/dist --window-size=1280,800 --lang=zh-CN` 启动 headless Chromium（需在脚本启动前已有 E2E fixture server 监听 `127.0.0.1:17832`）
2. 通过 service worker URL 解析扩展 ID，打开扩展内部页面 `chrome-extension://<id>/src/popup/popup.html` 与 `…/src/dashboard/dashboard.html`
3. 从 popup 触发真实 capture，点击本地 fixture `#btn-click` / `#input-text` / `#btn-error`，并显式 fetch `/api/test?store_screenshot=1` 以确保网络行可确定性定位
4. 采集中切回 popup，注入 CSS 放大并居中，截图 `02-live-capture.png`
5. 将 capture 导回 Dashboard，按 tab/region 切换显示：时间线总览、请求检查器（点击目标网络行并激活 inspector）、隐私设置、导出任务
6. 5 张 PNG 落地 `assets/screenshots/`，均为 1280×800、真实扩展画面，非占位数据

运行：
```
node scripts/capture_store_screenshots.mjs
```

截图文件名：
- `01-timeline-overview.png`
- `02-live-capture.png`
- `03-request-inspector.png`
- `04-privacy-settings.png`
- `05-export-tasks.png`

---

## 发布操作清单

### 准备

- [ ] `npm run build` 完成 `artifacts/extension.zip`
- [ ] 执行 Playwright 截图脚本生成 `assets/screenshots/`
- [ ] Chrome 开发者账号 2-Step Verification 已开启
- [ ] Marquee promo tile (1400×560, 可选)

### Chrome Web Store

- [ ] New item → Upload `artifacts/extension.zip`
- [ ] Store Listing → 粘贴上方字段
- [ ] Privacy practices → 勾选 + justification
- [ ] Single purpose → 粘贴
- [ ] Visibility = Public → Submit

### Edge Add-ons

- [ ] New extension → Upload `artifacts/extension.zip`
- [ ] Store Listing → 粘贴
- [ ] Notes for reviewer / Permission justification / Data usage → 粘贴/勾选
- [ ] Remote code disclosure → No
- [ ] Submit

---

## 参考

- https://developer.chrome.com/docs/webstore/publish
- https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension
- https://developer.chrome.com/docs/extensions/migrating/

---

生成时间：2026-07-15