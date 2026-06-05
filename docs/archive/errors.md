# 错误记录

## 2026-06-03：误杀用户浏览器进程

**错误：** 多次执行 `taskkill /F /IM chrome.exe`，杀掉了用户在 9223 端口上运行的个人浏览器。

**原因：** 错误地认为需要重启用户的 Chrome 来加载扩展，实际上应该用 Playwright 启动独立的浏览器实例做 E2E 测试。

**后果：** 用户浏览器会话被销毁。

**正确做法：**
- E2E 测试用 `chromium.launchPersistentContext` + `--load-extension` 启动 Playwright 自己的浏览器
- 不碰用户已有的浏览器（9223 等）
- 不执行 `taskkill /F /IM chrome.exe`
