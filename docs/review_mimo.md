# Record All — 审阅报告

审阅对象：
- `docs/superpowers/specs/2026-06-03-browser-recorder-design.md`
- `docs/superpowers/specs/2026-06-03-browser-recorder-plan.md`

审阅日期：2026-06-03

---

## 总评

设计思路清晰，数据模型合理，Sprint 划分有层次。但有 **6 个高优问题** 和 **8 个中优问题** 需要在实施前解决，否则会在开发中途遇到阻塞或返工。

---

## 高优问题（H1-H6，必须在编码前解决）

### H1. chrome.debugger 互斥冲突

`chrome.debugger` 在同一 target 上只能被一个调试器 attach。如果用户已打开 DevTools（F12），扩展的 `chrome.debugger.attach()` 会失败。

设计中只提到"处理 target 已 attached 的错误、attach 失败的 fallback"，但没有定义 fallback 是什么。

**建议：**
- 轻量模式 console 采集降级为：attach 失败时静默跳过 console 采集，popup 中该功能项显示"不可用（DevTools 已打开）"
- 完整模式依赖 DevTools 面板，天然不冲突，但需要在 UI 中明确说明两者不能同时用 debugger attach

### H2. Service Worker 保活

MV3 的 Service Worker 在 30 秒无事件后会被休眠，5 分钟后被终止。录制期间如果没有频繁的 chrome API 调用，SW 可能在录制中途被杀掉，导致数据丢失。

批量写入策略（100 条或 1 秒 flush）在低活动页面可能不够频繁。

**建议：**
- 录制期间用 `chrome.alarms` 每 25 秒触发一次唤醒
- 或通过 offscreen document 保持长生命周期
- IndexedDB 写入必须用 `await` 确保在 SW 终止前完成（plan 中已提及，确认执行）

### H3. manifest.json 缺少 tabs 权限

设计文档的权限列表中有 `"tabs"`，但 plan 步骤 1.1 只说"编写 manifest.json（permissions, background, content_scripts 注册）"，没有列出具体权限清单。缺少 `tabs` 权限会导致：
- `chrome.tabs.create` 打开详情页失败
- `tab_id` 信息获取受限
- popup 中显示录制列表时拿不到 tab 信息

**建议：** 步骤 1.1 明确列出完整权限清单，与设计文档对齐。同时确认 `"activeTab"` 是否足够，还是需要完整的 `"tabs"`（读取所有 tab 的 url/title 需要 `"tabs"`）。

### H4. 测试策略完全缺失

7 个 Sprint、30+ 个文件，plan 中只有两处提到测试：
- 步骤 1.3："单元测试覆盖 CRUD + 批量写入"
- 其他步骤只有"验证：手动 xxx"

**建议：**
- 每个 Sprint 补充测试步骤（至少关键模块的单元测试）
- 明确测试框架（推荐 Vitest，与 Vite 配套）
- 关键测试点：
  - storage.ts：CRUD、批量写入、存储上限检查
  - session_manager.ts：生命周期、多 tab 场景
  - 各 capture 模块：事件采集 + 节流 + 脱敏
  - exporter.ts：JSON/HTML 生成、大数据量导出

### H5. HTML 报告 XSS 风险

HTML 报告将录制数据内嵌到 `<script>` 标签中。如果录制的页面 URL、console 输出、DOM 文本中包含 `</script>` 或恶意 HTML，可能导致：
- 导出的 HTML 报告被注入脚本
- 用户打开导出文件时执行恶意代码

**建议：**
- JSON 数据在嵌入 HTML 前必须转义 `<`, `>`, `&`, `'`, `"` 和 `</script`
- 使用 `JSON.stringify()` + Unicode 转义，或拆分 `</script>` 为 `<\/script>`
- 在步骤 6.2 中明确加入转义逻辑

### H6. crxjs/vite-plugin-chrome-extension 兼容性风险

该插件对 MV3 的支持程度需要验证。已知问题：
- 某些版本对 service worker 的 HMR 支持不完善
- DevTools panel 的打包可能需要特殊配置
- 与 TypeScript 的 source map 配置可能冲突

**建议：**
- 步骤 1.1 增加验证点：确认插件版本支持 MV3 service worker + content script + devtools panel 的完整打包
- 准备备选方案：手动配置 Vite 多入口打包（background、content、popup、detail、devtools 各自为入口）

---

## 中优问题（M1-M8，建议在设计阶段补充）

### M1. 事件模型缺少关键类型

`RecordEvent.type` 只有 5 种：mouse、keyboard、scroll、dom_change、navigation。缺少：
- `page_load`：页面加载完成事件（含 load 时间）
- `resize`：窗口大小变化
- `focus/blur`：tab 切换事件
- `clipboard`：复制粘贴（可选，但对调试有价值）

**建议：** 至少加上 `page_load` 和 `tab_switch`，否则回放时无法还原页面加载和 tab 切换场景。

### M2. 时间戳格式不统一

- `RecordEvent.timestamp` 说是"epoch ms，相对 session start 的偏移"，矛盾——epoch ms 是绝对时间，相对偏移是相对时间。
- `NetworkRequest.timestamp` 没有说是相对还是绝对。

**建议：** 统一为：
- `timestamp`：相对 session start 的偏移（ms），用于回放排序
- `absolute_time`：epoch ms，用于跨 session 查询和导出显示

### M3. Content Script 注入策略不明确

设计说"使用 `chrome.scripting.registerContentScripts` 在所有页面自动注入"，但：
- 是扩展安装时注册，还是录制开始时注册？
- 如果是录制开始时注册，已打开的页面不会被注入（除非用 `executeScript` 补注入）
- 如果是安装时注册，不录制时也在每个页面运行 content script，浪费资源

**建议：** 采用混合策略：
- manifest.json 中声明 content_scripts（`"matches": ["<all_urls>"]`, `"run_at": "document_start"`），但 content script 启动后只注册消息监听，不采集
- 录制开始时通过消息通知 content script 激活采集
- 录制停止时通知停止采集
- 新打开的 tab 由 manifest 自动注入，无需手动处理

### M4. 跨 iframe 数据采集的复杂度

plan 步骤 7.2 提到 `all_frames: true`，但没有考虑：
- 多个 iframe 同时产生事件，session_id 和 tab_id 如何关联？
- iframe 的 url 可能与主页面不同，是否需要记录 frame_id？
- 跨域 iframe 的 content script 注入受限

**建议：** 在 `RecordEvent` 中增加 `frame_id` 字段。步骤 2.1 增加 iframe 场景的验证。

### M5. 存储管理不够完善

500MB 上限只在"每次 flush 时检查"，但：
- 没有定义如何计算 IndexedDB 占用大小（`navigator.storage.estimate()` 是估算，不精确）
- 没有定义旧 session 的清理策略（用户手动删除？自动 LRU？）
- 没有 IndexedDB compaction 策略（删除数据后空间不自动释放）

**建议：**
- 用 `navigator.storage.estimate()` 做粗略检查，同时维护一个内存中的 `bytes_written` 计数器
- 添加"存储管理"UI：显示总占用、单 session 占用、一键清理
- 删除 session 时使用 `transaction.objectStore().delete()` 逐条删除（不是 `clear()`，避免大事务锁）

### M6. 大数据量详情页性能

plan 步骤 5.1 提到"虚拟滚动（数据量大时性能）"，但：
- 5 分钟录制 + full_trajectory 模式可能产生 10 万+ 事件
- 虚拟滚动实现复杂度高，是否有现成库推荐？
- 网络面板和 console 面板也需要虚拟滚动

**建议：**
- 推荐使用成熟库（如 `@tanstack/react-virtual` 或原生 `virtual-scroller`）
- 或改为分页加载（更简单，但体验稍差）
- 在步骤 5.1 中明确技术选型

### M7. 完整模式 DevTools 面板实现细节不足

步骤 3.3 描述较粗：
- "通过 `chrome.devtools.inspectedWindow` 和 CDP 获取 console log"——具体用哪个 CDP method？
- DevTools 面板如何与 Background 通信？`chrome.runtime.sendMessage` 在 DevTools context 中的限制？
- 如果用户关闭 DevTools 面板但继续浏览，完整模式是否降级为轻量模式？

**建议：** 补充 DevTools 面板的通信架构和降级策略。

### M8. 导出文件大小预估

5 分钟 full_trajectory 录制可能产生：
- 鼠标事件：~6000 条（50ms 采样）
- 网络请求：数百条
- console log：数百条

JSON 导出可能 10-50MB。HTML 报告内嵌全部数据会更大。

**建议：**
- 导出时提供"精简"选项（排除 mousemove，只保留 clicks）
- HTML 报告默认只嵌入摘要数据，完整数据用 JSON 单独导出
- 大文件导出时显示进度

---

## 低优建议（L1-L4）

### L1. 图标方案太简陋
步骤 7.1 说"创建 icon16/48/128.png（简洁的录制图标，如红色圆点）"。建议用 SVG 源文件 + 构建时自动生成各尺寸 PNG。

### L2. 缺少版本管理
manifest.json 的 `version` 字段没有提及。建议从 `"0.1.0"` 开始，语义化版本。

### L3. 缺少错误上报/日志
SW 和 content script 的运行时错误没有采集方案。建议至少在 SW 中添加 `chrome.runtime.onError` 监听，写入 IndexedDB 的一个 error_log store。

### L4. 可考虑增加的快捷功能
- 录制中添加"标记"（bookmark），方便回放时定位关键时刻
- 快捷键开始/停止录制（`chrome.commands`）

---

## Plan 依赖关系审查

```
Sprint 1 → Sprint 2 (✓ content script 依赖 types + storage)
Sprint 1 → Sprint 3 (✓ background 依赖 types + storage)
Sprint 2 ∥ Sprint 3 (✓ 可并行)
Sprint 3 → Sprint 4 (✓ popup 依赖 session_manager)
Sprint 1.3 → Sprint 5 (✓ detail 依赖 storage 层)
Sprint 5 → Sprint 6 (✓ 导出依赖数据读取)
Sprint 6 → Sprint 7 (✓ 收尾)
```

依赖关系合理，无环。

**但有一个遗漏：** Sprint 4 (Popup) 依赖 Sprint 3.4 (session_manager)，而 session_manager 依赖 Sprint 3.1-3.3（采集模块）。这意味着 Sprint 4 必须等 Sprint 3 全部完成。建议将 session_manager 的骨架（start/stop/list，不含采集模块）提前到 Sprint 1，这样 Popup 可以更早开始开发和联调。

---

## 问题汇总

| 编号 | 严重度 | 问题 | 建议动作 |
|------|--------|------|---------|
| H1 | 高 | debugger 互斥冲突无 fallback | 定义降级方案 |
| H2 | 高 | Service Worker 可能被杀 | 添加保活机制 |
| H3 | 高 | tabs 权限可能遗漏 | 对齐权限清单 |
| H4 | 高 | 测试策略缺失 | 每 Sprint 补测试步骤 |
| H5 | 高 | HTML 报告 XSS 风险 | 添加转义逻辑 |
| H6 | 高 | crxjs 插件兼容性未验证 | 增加验证点 + 备选方案 |
| M1 | 中 | 事件类型不全 | 补 page_load/tab_switch |
| M2 | 中 | 时间戳定义矛盾 | 统一为相对+绝对双字段 |
| M3 | 中 | Content Script 注入策略不明 | 采用 manifest 声明 + 按需激活 |
| M4 | 中 | iframe 场景未设计 | 增加 frame_id |
| M5 | 中 | 存储管理粗糙 | 补清理策略 + 精确计量 |
| M6 | 中 | 大数据量性能未定方案 | 明确虚拟滚动技术选型 |
| M7 | 中 | DevTools 面板细节不足 | 补充通信架构 |
| M8 | 中 | 导出文件可能过大 | 添加精简导出选项 |
| L1 | 低 | 图标方案简陋 | SVG 源 + 自动生成 |
| L2 | 低 | 无版本管理 | 添加版本号 |
| L3 | 低 | 无运行时错误采集 | 添加 error_log |
| L4 | 低 | 缺快捷标记/快捷键 | 后续迭代考虑 |

---

## 结论

设计文档质量不错，数据模型和架构清晰。主要风险在 **MV3 Service Worker 生命周期管理** 和 **chrome.debugger 互斥** 这两个平台限制上——这两个问题不提前解决，开发中途会大面积返工。

建议：先解决 H1-H3，更新设计文档后再开始编码。H4-H6 可在对应 Sprint 开始前解决。
