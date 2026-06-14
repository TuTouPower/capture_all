# 采集能力缺口分析

> 日期：2026-06-14
> 基准：当前 7 标签 + 8 content 模块
> 实施状态：用户行为扩展 + 网络请求扩展 **实施中**

---

## 已采集能力

| 标签 | 事件类型 | 模块 |
|------|---------|------|
| 用户行为 | mouse(click/dblclick/contextmenu/wheel/drag/move), keyboard, scroll, input | mouse/keyboard/scroll/dom_capture |
| 页面导航 | page_load, dom_ready, tab_url_change, tab_switch, tab_created | content_script |
| 网络请求 | HTTP 请求 + body capture | network_hook + background/webRequest + CDP |
| 控制台 | console.log/warn/error/info | background/CDP Runtime |
| 错误异常 | runtime_exception, unhandled_rejection, resource_error | background/exception_capture |
| Storage | localStorage/sessionStorage 变更 | storage_capture |
| Cookie | cookie 变更 | background/chrome.cookies |

---

## 缺口清单

### 用户行为标签（现有标签扩展）

| ID | 缺口 | 触发事件 | 采集内容 | 优先级 | 复杂度 |
|----|------|---------|---------|--------|--------|
| GAP-U01 | 剪贴板 API | `navigator.clipboard.writeText()` / `readText()` / `document.execCommand('copy')` | 操作类型（write/read），不记录内容（隐私） | P1 | 低 |
| GAP-U02 | 表单提交 | `<form>` submit 事件 | form action, method, 元素数量 | P1 | 低 |
| GAP-U03 | 焦点切换 | focus / blur on input/textarea/select | target selector, focus/blur | P2 | 低 |
| GAP-U04 | 页面可见性 | `visibilitychange`（已监听但未生成事件） | visible/hidden 状态 | P2 | 极低 |
| GAP-U05 | 视口 resize | window resize（需防抖） | 宽高 | P3 | 低 |
| GAP-U06 | 全屏切换 | fullscreenchange | 进入/退出 + target element | P3 | 极低 |
| GAP-U07 | 打印 | beforeprint / afterprint | 事件类型 | P3 | 极低 |

### 网络请求标签（现有标签扩展）

| ID | 缺口 | 触发事件 | 采集内容 | 优先级 | 复杂度 |
|----|------|---------|---------|--------|--------|
| GAP-N01 | WebSocket 消息 | 已跟踪连接，消息内容未采集 | 方向(send/recv), size, 前 200 字符 | P2 | 中 |
| GAP-N02 | fetch/XHR 完整拦截 | content_script 层 fetch/XMLHttpRequest monkey-patch | 请求 URL, method, status, duration | P2 | 中 |

### 新标签候选

| ID | 缺口 | 数据特征 | 建议标签 | 优先级 | 复杂度 | 说明 |
|----|------|---------|---------|--------|--------|------|
| GAP-P01 | Web Vitals (LCP/FID/CLS/INP) | 低频、数值型 | `performance` | P2 | 中 | PerformanceObserver, 一页 1-4 条 |
| GAP-P02 | Long Task (>50ms) | 中频 | `performance` | P3 | 中 | 阻塞主线程的任务 |
| GAP-P03 | 资源加载性能 | 中频 | `performance` | P3 | 中 | 慢资源 TTFB/duration |
| GAP-D01 | DOM Mutation | 高频、需采样 | `dom_mutation` | P4 | 高 | MutationObserver, 必须采样否则爆炸 |
| GAP-S01 | Service Worker 通信 | 低频 | `sw_messaging` | P3 | 中 | `navigator.serviceWorker` postMessage/onmessage，SPA 离线/推送场景 |
| GAP-S02 | Payment/DRM | 极低频 | `security_event` | P4 | 低 | PaymentRequest、MediaKeySystemAccess，安全审计用途 |

---

## 剪贴板详细设计（GAP-U01）

### 归属

**用户行为** 标签。与 mouse/keyboard/scroll/input 同级。

### 实现方式

content_script 注入时，monkey-patch `navigator.clipboard` 和 `document.execCommand`：

```
拦截点：
1. navigator.clipboard.writeText(text) → 记录 type='clipboard_write'
2. navigator.clipboard.readText()      → 记录 type='clipboard_read'
3. document.execCommand('copy')         → 记录 type='clipboard_write'
4. document.execCommand('paste')        → 记录 type='clipboard_read'
```

### 事件结构

```json
{
    "category": "user_action",
    "type": "clipboard_write",
    "data": {
        "method": "navigator.clipboard",
        "url": "https://chatgpt.com/..."
    }
}
```

- `method`: `"navigator.clipboard"` 或 `"execCommand"`
- 不记录剪贴板内容（隐私安全）
- 无 clipboard 权限时静默跳过，不报错

### event_category.ts 变更

```typescript
const USER_ACTION_TYPES = new Set([
    'mouse_event', 'keyboard_event', 'scroll_event', 'input_event',
    'clipboard_write', 'clipboard_read'
]);
```

### 涉及文件

- `src/content/content_script.ts` — 注入拦截
- `src/shared/event_category.ts` — 新增 type 映射
- `src/shared/types.ts` — 如需新增 type 字面量

---

## 优先级排序建议

| 优先级 | 项目 | 理由 |
|--------|------|------|
| **P1** | GAP-U01 剪贴板 | 实际场景已遇到（ChatGPT 分享），实现简单 |
| **P1** | GAP-U02 表单提交 | 高频用户行为，缺失影响操作回放完整性 |
| **P2** | GAP-U03 焦点切换 | 表单交互链路补全 |
| **P2** | GAP-U04 可见性 | 已有监听，只差生成事件，改动极小 |
| **P2** | GAP-N01 WebSocket 消息 | 重度 SPA（ChatGPT）依赖 WS，当前只跟踪连接 |
| **P2** | GAP-P01 Web Vitals | 性能标签数据，一页 1-4 条，量级可控 |
| **P3** | GAP-U05/06/07 | 低频交互，按需加 |
| **P3** | GAP-P02/03 | 性能细化，按需加 |
| **P4** | GAP-D01 DOM Mutation | 高频、需采样、数据量大，谨慎评估 |
| **P3** | GAP-S01 SW 通信 | SPA 离线/推送场景，按需加 |
| **P4** | GAP-S02 Payment/DRM | 极低频，安全审计用途 |
