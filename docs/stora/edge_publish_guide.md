# Edge Add-ons 发布指南

Dashboard：https://partner.microsoft.com/dashboard/microsoftedge/overview

---

## Packages

- **Upload package**（上传扩展包）：上传 `artifacts/extension.zip`。

---

## Availability

- **Visibility**：

  - **Public** ：任何人可在 Microsoft Store 搜索安装。
  - **Hidden**： 只有知道 URL 的人才能安装。
    - **Public**
- **Markets**

  - **Change markets**：默认全选 / 逐市场勾选 / 排除特定市场。
    - **默认全选**。

  - [X] **Make my extension available in any future market**（新增市场自动可用：勾选后，未来 Microsoft Store 新增的市场将自动向本扩展开放，无需手动更新）

---

## Properties

- **Category**
  - **Accessibility** （无障碍/辅助功能）
  - **Blogging** （博客）
  - **Developer Tools** （开发者工具）
  - **Entertainment** （娱乐）
  - **News And Weather** （新闻与天气）
  - **Photos** （照片）
  - **Productivity** （生产力/工作效率）
  - **Search Tools** （搜索工具）
  - **Shopping** （购物）
  - **Social** （社交）
  - **Communication** （通信/沟通）
  - **Sports** （体育）
    - **Developer Tools**
- **Support details**
  - **Website**（产品网站）：`https://github.com/TuTouPower/capture_all`
  - **Support contact detail**（支持联系方式）：`https://github.com/TuTouPower/capture_all/issues`
- **Mature content**
  - [ ] **This item contains content that might not be suitable for all ages**（包含不适于所有年龄段的内容：如果扩展含色情/暗示、强烈语言、暴力、或涉及烟酒毒品消费等内容，则必须勾选。纯开发者工具无需勾选）

## Privacy

### Single purpose description / 单一用途描述

```
Capture browser activity (user actions, navigation, network, console, exceptions, storage, cookies) as structured, local-first evidence for debugging, exporting, and AI-agent querying.
```

### Permission justification / 权限说明

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

#### Host permission justification / 主机权限说明

```
Runs declarative Content Script and observes user behavior and network activity across origins the user visits.
```

### Are you using remote code? / 是否使用远程代码？

- **No**（不使用远程代码。选 No 无需填写 Justification，仅选 Yes 时需要说明）

### Data usage / 数据使用

**What user data do you plan to collect from users now or in the future? / 当前或未来计划采集哪些用户数据？**

逐项勾选，非自由文本：

- [ ] Personally identifiable information（个人身份信息）
- [ ] Health information（健康信息）
- [ ] Financial and payment information（金融与支付信息）
- [ ] Authentication information（身份验证信息）
- [ ] Personal communications（个人通信内容）
- [ ] Location（位置信息）
- [X] Web history（网页浏览记录 — 页面导航、URL 变更）
- [X] User activity（用户活动 — 点击、滚动、键盘、输入值）
- [X] Website content（网站内容 — 网络请求/响应、控制台输出、异常、Storage、Cookie）

未勾选的项本扩展均不采集。

### Privacy policy URL / 隐私政策 URL

`https://github.com/TuTouPower/capture_all/blob/main/PRIVACY.md`（隐私政策页面 URL。如果扩展收集用户数据，必须有隐私政策）

### Certification / 声明认证

- **I certify that the following disclosures are true**（本人证明以下声明属实）：三项全部勾选。

  - [X] **The data collection and usage disclosures are accurate and reflect the most up-to-date content of my privacy policy.**
    （数据采集和使用声明准确，且反映隐私政策最新内容。确认你在本页填写的采集范围与隐私政策一致，无遗漏或误导。）
  - [X] **My extension does not sell user data.**
    （扩展不出售用户数据。确认不会将任何采集数据出售、交易或转让给第三方。）
  - [X] **My extension does not transfer user data for purposes unrelated to the extension's single purpose.**
    （扩展不会将用户数据用于与扩展单一用途无关的目的。确认所有数据传输仅服务于扩展声明功能，不做他用。）

---

## Store Listings

每种语言需要填写 Extension name、Description、Search terms、Extension logo。至少完成一个语言才能继续。

公共字段：

- **Extension name**（扩展名称）：自动从 manifest 读取。
- **Extension logo**（扩展图标）：推荐 300×300，最小 128×128，宽高比 1:1。上传 `artifacts/dist/assets/icons/icon300.png` 或 `icon128.png`。

---

### English

#### Description

```
Capture All is a local-first browser debugging black box. It captures 7 data groups on a unified timeline: user actions, page navigation, network requests, console output, runtime errors, storage changes, and cookie changes.

Inspect captures via popup, main panel, and DevTools panel. Export to JSON, JSONL, HTML, or HAR. Or connect the local Bridge to an MCP client like Claude Code so an AI Agent can control capture, query records, and export results.

All data stays in local IndexedDB. Nothing is uploaded or shared unless you explicitly export a file or run an MCP query. The Bridge binds to 127.0.0.1 only.
```

#### Search terms

```
browser activity capture
network request logger
HAR export
developer debugging
MCP AI agent
console error capture
cookie storage monitor
```

---

### 中文

#### Description / 描述

```
Capture All 是本地优先的浏览器调试黑盒。在统一时间线上采集 7 组数据：用户行为、页面导航、网络请求、控制台输出、运行时异常、Storage 变更和 Cookie 变更。

通过 popup、主面板和 DevTools 面板检查采集结果。导出 JSON、JSONL、HTML 或 HAR。也可将本地 Bridge 连接到 Claude Code 等 MCP 客户端，由 AI Agent 控制采集、查询记录、导出结果。

所有数据仅保存在浏览器本地 IndexedDB。除非主动导出文件或运行 MCP 查询，否则不会上传或共享。Bridge 仅监听 127.0.0.1。
```

#### Search terms / 搜索词

```
浏览器活动采集
网络请求抓包
HAR导出
开发者调试
MCP智能体
控制台日志
Cookie监控
```
