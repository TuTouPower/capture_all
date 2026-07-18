# Record All 产品需求文档 PRD

版本：v0.3
产品阶段：Chrome Extension 可运行原型 → 专业调试工具化
文档目标：明确 Record All 的产品定位、差异化、核心用户路径、页面信息架构、功能范围、优先级、设计原则和验收标准。

------

# 1. 产品概述

## 1.1 产品名称

Record All

## 1.2 产品一句话

Record All 是一个浏览器调试黑匣子，它把一次浏览器 Session 中发生的用户操作、页面跳转、网络请求、Console 日志、DOM / Storage / Cookie 变化等结构化证据，记录成可回看、可分析、可导出、可被本地 AI Agent 查询的调试证据包。

## 1.3 产品定位

Record All 不是录屏工具，也不是 Chrome DevTools 的替代品。

它的定位是：

> 浏览器 Session Evidence Recorder
> Web Debugging Black Box
> 本地优先的浏览器问题取证与分析工具

核心价值不是“能展示多少数据”，而是：

> 把问题发生前后的所有浏览器证据，按照时间和因果关系组织起来，让人和 AI 都能快速理解发生了什么。

------

# 2. 背景与问题

Web 调试、测试复现、AI Agent 执行浏览器任务时，经常遇到以下问题：

1. 问题发生时没有提前打开 DevTools。
2. 测试人员复现了问题，但描述不清每一步发生了什么。
3. 开发者只拿到截图或口头描述，缺少网络、Console、Storage、Cookie 等证据。
4. 用户操作、请求失败、Console error、DOM 变化、Storage / Cookie 变化分散在不同地方，缺少统一时间线。
5. AI Agent 可以通过 CDP 操控浏览器，但缺少对历史 Session 的结构化记忆。
6. 导出的 HAR、JSON、日志等数据彼此割裂，难以作为完整证据包交付。

Record All 要解决的是：

> 让用户一键记录真实浏览器过程，并在事后从统一时间线中定位问题发生在哪一秒，以及那一秒前后发生了什么。

------

# 3. 产品差异化

## 3.1 与 Chrome DevTools 的差异

Chrome DevTools 是实时调试工具。

Record All 是事后分析和证据记录工具。

| 对比维度 | Chrome DevTools                     | Record All                            |
| -------- | ----------------------------------- | ------------------------------------- |
| 核心场景 | 实时 inspect / debug                | 录制真实 Session，事后分析            |
| 使用前提 | 用户知道要打开 DevTools             | 用户只需开始录制                      |
| 数据组织 | Network、Console、Elements 等分面板 | 统一时间线 + 证据 Inspector           |
| 时间维度 | 当前状态为主                        | 完整 Session 历史                     |
| 目标用户 | 开发者                              | 开发者、测试、技术支持、AI Agent 用户 |
| 产品心智 | 现场手术刀                          | 浏览器黑匣子                          |

Record All 不应该做成弱版 DevTools，而应该做成：

> DevTools 负责现场调试，Record All 负责事故黑匣子和证据包。

## 3.2 与 CDP / AI 浏览器控制工具的差异

AI Agent 可以通过 CDP 控制浏览器、读取 DOM、检查 Network 和 Console。

Record All 不主打“控制浏览器”，而主打“记录真实历史过程”。

| 对比维度 | CDP / AI Browser Agent        | Record All                 |
| -------- | ----------------------------- | -------------------------- |
| 核心能力 | 主动操作浏览器                | 被动记录真实 Session       |
| 数据形态 | 当前浏览器状态 / 工具调用结果 | 持久化 Session evidence    |
| AI 用法  | AI 控制浏览器                 | AI 查询历史录制            |
| 价值重点 | 自动化操作                    | 证据记忆、因果链、事后分析 |

Record All 给 AI 的不是浏览器控制权，而是：

> 可查询、可追溯、可复盘的真实 Session 证据。

------

# 4. 目标用户

## 4.1 开发者

需求：

- 快速知道问题发生在哪一秒。
- 找到失败请求、Console error、用户操作、Storage / Cookie / DOM 变化之间的关系。
- 导出 HAR、JSON、HTML 报告。
- 把录制数据交给 AI 辅助分析。

## 4.2 测试人员 / QA

需求：

- 一键录制复现过程。
- 不需要理解复杂 DevTools。
- 录完后能把完整证据发给开发者。
- 能清楚知道是否录到了敏感数据。

## 4.3 技术支持 / 客户成功

需求：

- 帮助客户记录问题现场。
- 生成可读报告。
- 让工程团队收到完整浏览器证据。
- 避免只靠截图和文字描述问题。

## 4.4 AI Agent 用户

需求：

- 让本地 AI Agent 查询历史 Session。
- 获取统一时间线、失败请求、Console error、用户操作序列。
- 不依赖导出文件作为分析前置步骤。
- 数据本地优先、用户可控。

------

# 5. 核心用户问题

Record All 需要帮助用户回答：

1. 问题什么时候发生？
2. 问题发生前用户做了什么？
3. 哪个请求失败了？
4. 失败请求前后有没有 Console error？
5. 页面有没有跳转或 SPA route change？
6. Storage 或 Cookie 有没有异常变化？
7. DOM 有没有出现错误提示或关键节点变化？
8. 本次录制是否包含敏感数据？
9. 这次录制能否导出为调试证据包？
10. 本地 AI Agent 能否读取并分析这次 Session？

------

# 6. 产品核心原则

## 6.1 Timeline-first

Detail 页面必须以统一时间线为核心。

不要把产品做成一堆孤立表格：

- Network 表
- Console 表
- Storage 表
- Cookie 表
- DOM 表

而应该做成：

- 统一时间线
- 相关证据
- 右侧 Inspector
- 导出 / AI Handoff

## 6.2 Popup 是录制控制台，不是配置页

Popup 的核心任务：

1. 告诉用户现在是否正在录制。
2. 显示录制时长。
3. 显示当前采集模式。
4. 显示是否开启敏感采集。
5. 提供开始 / 停止录制。
6. 录制完成后引导进入详情分析。

Popup 不应该默认展示完整采集表单，也不应该像 Dashboard。

## 6.3 Evidence 不等于一堆 Tab

Storage、Cookie、DOM、Navigation、User Actions 都很有价值，但不应该全部并列成顶部一级 Tab。

Detail 顶部 Tab 建议：

- Overview
- Timeline
- Network
- Console
- Evidence

Evidence 内再包含：

- User Actions
- Navigation Flow
- Storage
- Cookies
- DOM Changes

## 6.4 数据本地优先，风险清楚可控

Record All 会记录敏感浏览器数据，因此必须让用户清楚：

- 当前采集了什么。
- 是否采集输入值。
- 是否采集 request body。
- 是否采集 response body。
- 是否记录 Cookie / Storage。
- 是否开启脱敏。
- 本地 Agent 能读取什么。

------

# 7. 当前已有能力

当前产品已具备以下基础能力：

- Chrome MV3 扩展框架。
- Popup 控制面板。
- 开始 / 停止录制。
- 基础模式 / 深度模式。
- 鼠标、键盘、滚动记录。
- DOM 变化记录。
- 页面导航、SPA 路由、DOMContentLoaded 记录。
- Tab 打开、切换、URL 变化记录。
- 网络请求 metadata、headers、request body、response body 捕获。
- Console 日志和 JS 异常捕获。
- localStorage / sessionStorage 变化记录。
- Cookie 变化记录。
- Session Detail 页面。
- JSON / JSONL / HTML / HAR 导出。
- 导出目录、文件名模板、保存位置设置。
- 系统时间字段和时区设置。
- 浅色 / 深色 / 跟随系统主题。
- 中英文界面。
- 本地 MCP / bridge / agent API 初步实现。

------

# 8. 版本目标

## 8.1 v0.3 总目标

把 Record All 从“工程原型”升级成“专业调试工具”。

具体目标：

1. Popup 从配置面板升级为录制状态控制台。
2. Detail 从数据详情页升级为 Session Analysis Workbench。
3. 统一时间线成为产品核心。
4. 多源数据通过时间和上下文建立因果关系。
5. 风险采集项清楚可控。
6. 导出成为“证据包交付”能力。
7. MCP / AI Agent 成为辅助入口，而不是主界面干扰项。

------

# 9. 产品范围

## 9.1 v0.3 做什么

### Popup

- Ready 状态。
- Deep Capture 选择状态。
- Recording 状态。
- Recording with warning 状态。
- Recording Saved 状态。
- Capture Settings 状态。
- 最近录制列表优化。
- Start / Stop 主操作收敛。
- Session ID 弱化展示。
- Standard / Deep Capture 语义替换 Basic / Advanced。
- 敏感采集提示。

### Detail

- Session Header。
- Metrics Strip。
- Timeline-first 主布局。
- 左侧 Filter Sidebar。
- 中间 Unified Timeline。
- 右侧 Inspector Panel。
- Network View 优化。
- Console View 优化。
- Evidence View 信息架构。
- Storage / Cookie / DOM / Navigation 基础详情展示。
- Export 菜单整理。
- AI Agent 次级入口。

### Export

- JSON。
- JSONL。
- HTML Report。
- HAR。
- 导出格式说明。
- 导出前敏感数据提醒。

### MCP / Local Agent

- Bridge / Agent 状态展示。
- Copy MCP config。
- Agent 可读数据说明。
- 查询录制 Session 的工具方向整理。

## 9.2 v0.3 不做什么

- 不做完整 DevTools 替代。
- 不做视频录屏。
- 不做真正浏览器状态 Replay。
- 不做复杂性能 profiling。
- 不做云同步。
- 不做团队协作。
- 不做大型 Dashboard。
- 不做 AI Chat 主界面。
- 不做完整 DOM diff 工具。
- 不做自动根因分析作为主功能。

------

# 10. 信息架构

## 10.1 整体结构

Record All 由两个主要界面组成：

1. Popup：录制控制台。
2. Detail：Session 分析工作台。

辅助能力：

- Settings。
- Export。
- Local Agent / MCP。
- DevTools Panel，低优先级。

------

# 11. Popup 产品设计

## 11.1 Popup 定位

Popup 是用户启动和停止录制的入口。

它不是：

- 设置页。
- 数据分析页。
- Dashboard。
- DevTools 小面板。
- 视频录制控制器。

它是：

> Browser evidence recording controller

用户打开 Popup 后，应该立刻知道：

1. 当前是否在录制。
2. 已经录了多久。
3. 当前是标准采集还是深度采集。
4. 是否包含敏感采集。
5. 应该点击哪里开始或停止。
6. 录完后去哪里分析。

------

## 11.2 Popup 关键产品决策

### 11.2.1 Basic / Advanced 改名

不再使用 Basic / Advanced 作为主文案。

改为：

- 标准采集
- 深度采集

英文可对应：

- Standard Capture
- Deep Capture

原因：

- Basic 听起来像低配。
- Advanced 听起来像专业用户门槛。
- 标准采集 / 深度采集更符合用户理解。
- 深度采集能自然承载风险说明。

### 11.2.2 Session ID 不做主视觉展示

Popup 不展示完整 UUID。

可以展示短 ID：

- rec_x82a
- 当前录制 · rec_x82a

完整 Session ID 只在 Detail 页展示。

原因：

- Popup 空间有限。
- 普通用户不关心完整 ID。
- 完整 UUID 增加工程序感和视觉噪音。

### 11.2.3 录制中不允许切换模式

录制前可以切换：

- 标准采集
- 深度采集

录制中只展示当前模式，不提供切换。

原因：

- 录制中切换模式会造成数据语义不清。
- 用户会困惑“切换前后数据怎么算”。
- 产品上应保持一次 Session 的采集配置稳定。

------

## 11.3 Popup 状态

Popup 需要设计 6 个状态。

------

## 11.3.1 状态一：Ready / Standard Capture

目标：

让用户一眼知道当前未录制，并能马上开始。

展示内容：

- 产品名：Record All
- 状态：就绪
- 状态说明：准备记录浏览器调试证据
- 当前模式：标准采集
- 模式切换：标准采集 / 深度采集
- 标准采集说明：
  - 记录用户操作
  - 页面导航
  - 网络元数据
  - Console 日志
- 主按钮：开始录制
- 最近录制列表 2–3 条
- 查看全部录制入口
- 设置入口

设计要求：

- Ready 状态用绿色或蓝绿色。
- 开始录制按钮是最强 CTA。
- 模式切换存在，但不能比主按钮更抢眼。
- 不要默认展示完整 Capture Scope 表格。

------

## 11.3.2 状态二：Ready / Deep Capture Selected

目标：

展示用户选择深度采集后的风险提示。

展示内容：

- 状态：就绪
- 当前模式：深度采集
- 风险提示：
  - 深度采集可能记录请求体、响应体和输入值。
  - Chrome 可能显示 debugger 权限提示。
- 敏感采集 Badge：
  - 输入值
  - 请求体
  - 响应体
  - Cookie / Storage
- 脱敏状态：
  - 脱敏已开启
- 主按钮：开始深度录制

设计要求：

- 风险提示使用 warning 色，但不要恐吓用户。
- 主按钮仍然是视觉重心。
- 不把深度采集做成复杂表单。
- 高风险项要清楚，但保持简洁。

------

## 11.3.3 状态三：Recording

目标：

让用户一眼知道正在录制，并能随时停止。

展示内容：

- 状态：录制中
- 大号计时器：00:03:27
- 当前模式：深度采集 / 标准采集
- 当前短 Session：rec_x82a
- 采集摘要：
  - 输入值
  - 请求体
  - 响应体
  - 脱敏开启
- 核心实时统计：
  - Events
  - Requests
  - Errors
- 主按钮：停止录制
- 次级链接：打开实时详情
- 当前证据摘要：
  - Network
  - Console
  - Storage
  - Errors

设计要求：

- 录制中状态必须非常明显。
- 计时器要突出。
- 停止录制按钮是最强操作。
- 统计信息紧凑，不做大型 Dashboard。
- 不使用视频播放器语义。

------

## 11.3.4 状态四：Recording with Warning

目标：

录制继续进行，但提示用户部分数据可能存在风险或异常。

触发场景示例：

- 部分响应体未捕获。
- debugger 权限异常。
- response body 过大。
- 错误数快速增加。
- 某些数据源暂时不可用。

展示内容：

- 状态：录制中
- 计时器
- 当前模式
- Warning banner：
  - 部分响应体未捕获，可能由于权限或大小限制。
- 核心统计：
  - Events
  - Requests
  - Errors
- 错误数量突出。
- 主按钮：停止录制
- 次级操作：
  - 查看详情
  - 查看警告

设计要求：

- Warning 不能抢走 Stop Recording。
- 用户必须知道录制仍在继续。
- Warning 文案要清楚具体，不要泛泛而谈。

------

## 11.3.5 状态五：Recording Saved

目标：

用户停止录制后，引导进入详情分析。

展示内容：

- 状态：录制已保存
- 成功提示
- 本次录制摘要：
  - 时长
  - Events
  - Requests
  - Console errors
  - Storage changes
- 主按钮：打开会话详情
- 次级按钮：导出
- 文本链接：开始新的录制
- 最近录制中第一条是刚保存的 Session

设计要求：

- 这是关键转化状态。
- 不要停止后直接回到 Ready。
- “打开会话详情”是主 CTA。
- 导出是次级操作。
- 用户应自然进入 Detail 页面。

------

## 11.3.6 状态六：Capture Settings / Customization

目标：

让用户调整采集配置，但不污染主界面。

展示内容：

分组一：采集范围

- 用户操作
- 页面导航
- 网络请求
- Console 日志
- Storage 变化
- Cookie 变化
- DOM 变化

分组二：深度采集

- 输入值
- 请求体
- 响应体

分组三：隐私与安全

- 脱敏
- 敏感字段提示
- Agent 可读风险提示

底部按钮：

- 保存设置
- 恢复默认

设计要求：

- 设置清晰分组。
- 不堆密集表单。
- 高风险项带 warning 图标或说明。
- Settings 可以是 Popup 内面板、抽屉或独立设置页入口。

------

# 12. Detail 产品设计

## 12.1 Detail 定位

Detail 是单次录制的 Session Analysis Workbench。

它不是普通数据详情页。

它的目标是帮助用户完成：

> 从宏观概览进入具体问题时刻，再查看问题附近所有相关证据。

------

## 12.2 Detail 顶层结构

Detail 页面结构：

1. Session Header
2. Metrics Strip
3. Main Tabs
4. 左侧 Filter Sidebar
5. 中间 Unified Timeline
6. 右侧 Inspector Panel

------

## 12.3 Session Header

展示内容：

- Record All logo
- Session Analysis
- 友好标题：
  - 今天 14:32 的录制
- 短 Session ID：
  - rec_x82a
- 完整 Session ID 复制入口，可放在更多信息里
- 时间范围
- 时长
- 采集模式：
  - 标准采集 / 深度采集
- 敏感采集 Badge
- Export 按钮
- 时间显示切换：
  - 相对时间
  - 系统时间
- 更多菜单

设计要求：

- Header 简洁。
- Export 可见但不抢主分析区。
- 敏感 Badge 清楚但不制造恐慌。

------

## 12.4 Metrics Strip

展示紧凑指标：

- Events
- Requests
- Failed
- Console Errors
- Storage Changes
- Cookie Changes
- DOM Mutations
- Navigations

示例：

- Events：1,284
- Requests：356
- Failed：7
- Console Errors：12
- Storage Changes：18
- Cookie Changes：36
- DOM Mutations：604
- Navigations：12

设计要求：

- Failed 和 Console Errors 用红色突出。
- 其他指标保持克制。
- 不做大型 Dashboard 卡片。
- 数字可用等宽字体。

------

## 12.5 Main Tabs

顶部主 Tab：

- Overview
- Timeline
- Network
- Console
- Evidence

默认选中：

- Timeline

不把 Storage、Cookie、DOM、Navigation 做成顶部一级 Tab。

------

## 12.6 Timeline 主布局

Timeline 页面采用三栏布局：

左侧：

- Filter Sidebar

中间：

- Unified Timeline

右侧：

- Inspector Panel

建议比例：

- 左侧 18%
- 中间 52%
- 右侧 30%

------

## 12.7 Filter Sidebar

内容：

搜索框：

- 搜索事件、URL、Storage key、Cookie、错误…

快速筛选：

- 全部
- 错误
- 用户操作
- Network
- Console
- Navigation
- Storage
- Cookie
- DOM

开关：

- 只看错误
- 紧凑密度

时间范围：

- 全部时间
- 问题附近
- 自定义区间

快捷入口：

- 跳到第一个错误
- 跳到失败请求
- 跳到 Console error

设计要求：

- 搜索框固定在顶部。
- 当前筛选状态明显。
- 错误筛选有红色标记。
- 筛选不应像复杂表单。

------

## 12.8 Unified Timeline

统一时间线是 Detail 页核心。

融合数据源：

- Session start / stop
- Mouse
- Keyboard
- Scroll
- Navigation
- Page load
- Tab switch
- Tab created
- Tab URL change
- DOM ready
- Network request
- Console log
- JS exception
- Storage change
- Cookie change
- DOM change

每条 Timeline item 包含：

- 相对时间
- 数据源标签 / 图标
- 事件标题
- 简短摘要
- 严重等级
- 页面 URL 简写
- 状态码 / 错误标记
- 选中状态

示例：

- +00.000s Session Recording started
- +00.840s Navigation Opened /login
- +01.120s User Click “Login”
- +01.380s Network POST /api/login 200
- +01.560s Storage localStorage auth_token changed
- +01.720s Navigation Route changed to /dashboard
- +03.410s User Click “Checkout”
- +03.680s Network POST /api/order 500
- +03.710s Console TypeError: Cannot read property
- +03.900s DOM .error-message node added
- +04.120s Cookie session_id changed

设计要求：

- 时间线要按时间排序。
- 错误事件明显突出。
- 当前选中事件高亮。
- 正常事件保持低调。
- 不同数据源使用颜色 + icon + label，不只靠颜色。
- 时间戳、URL、method、status 使用等宽字体。
- Timeline 是视觉主角。

------

## 12.9 Inspector Panel

点击任意 Timeline item 后，右侧展示详情。

默认示例选中：

- POST /api/order 500

展示内容：

### Summary

- Method
- URL
- Status
- Duration
- Resource type
- Page URL
- Relative time
- System time

### Request

- Headers
- Body captured
- Payload preview

### Response

- Headers
- Response body captured
- Error preview

### Related Nearby Events

展示当前事件附近的相关证据：

- +03.410s User Click “Checkout”
- +03.710s Console TypeError
- +03.900s DOM .error-message node added
- +04.120s Cookie session_id changed

### Actions

- Copy request
- Export HAR
- View in Network tab
- Ask local Agent

设计要求：

- Inspector 是详情面板，不是主页面。
- 大字段默认折叠。
- Headers / Body 只显示 preview。
- Related Nearby Events 是关键模块。
- Ask local Agent 是弱入口，不做聊天主界面。

------

# 13. Network View

Network View 是高频分析视图。

展示列：

- Time
- Method
- URL
- Status
- Duration
- Type
- Body captured
- Error indicator

筛选：

- Failed only
- Status code
- Method
- Resource type
- Search URL

点击请求后：

- 右侧 Inspector 展示请求详情。

设计重点：

- 快速找到失败请求。
- 快速看到慢请求。
- 和 Timeline 保持时间联动。

------

# 14. Console View

Console View 展示日志和错误。

展示列：

- Time
- Level
- Message
- Source URL
- Line
- Column

筛选：

- Error
- Warning
- Info
- Debug
- Search message

点击日志后：

- 右侧 Inspector 展示日志详情。
- 显示 stack trace。
- 显示附近 network / user action。

设计重点：

- Console error 要突出。
- 和 Timeline 保持时间联动。
- 让用户知道错误发生在什么操作之后。

------

# 15. Evidence View

Evidence 是辅助证据中心。

Evidence 子视图：

1. User Actions
2. Navigation Flow
3. Storage
4. Cookies
5. DOM Changes

------

## 15.1 User Actions

展示用户操作序列：

- Click
- Input
- Keyboard
- Scroll
- Mouse movement summary

展示字段：

- Time
- Action
- Target selector
- Target text
- Input captured / redacted
- Page URL

注意：

- 不叫 Replay。
- 不使用播放图标。
- 不承诺真实视频回放。

------

## 15.2 Navigation Flow

展示页面路径和标签页流：

- Page open
- Page load
- DOM ready
- SPA route change
- Tab switch
- Tab created
- URL change

目标：

- 帮助用户理解本次 Session 的页面路径。
- 找到问题发生在哪个页面阶段。

------

## 15.3 Storage View

展示 localStorage / sessionStorage 变化。

字段：

- Time
- Storage type
- Key
- Operation
- Value preview
- Page URL

支持：

- 按 key 搜索
- 按 storage type 筛选
- 查看 old value / new value

------

## 15.4 Cookie View

展示 Cookie 增删改。

字段：

- Time
- Cookie name
- Domain
- Operation
- Value preview
- Attributes

支持：

- 按 name 搜索
- 按 domain 筛选
- 查看 old value / new value

可展示属性：

- Domain
- Path
- Expires
- Secure
- SameSite
- HttpOnly if available

------

## 15.5 DOM Changes View

展示 DOM 变化摘要。

第一版不做完整 DOM diff。

字段：

- Time
- Mutation type
- Target selector
- Summary
- Page URL

详情：

- Selector
- Mutation type
- Attribute name
- Old value
- New value
- Text preview
- OuterHTML preview if available
- Nearby user action

设计原则：

- DOM 数据量大，默认摘要化。
- 不让用户被 mutation 噪音淹没。

------

# 16. Export

## 16.1 支持格式

### JSON

完整结构化数据。

适合：

- 开发者分析。
- 程序化处理。
- 备份完整 Session。

### JSONL

逐行事件数据。

适合：

- AI ingest。
- 流式处理。
- 本地 Agent 分析。

### HTML Report

自包含可读报告。

适合：

- 发给开发者。
- 发给测试人员。
- 问题归档。
- 非技术用户查看。

### HAR

网络请求归档。

适合：

- DevTools。
- Charles。
- Fiddler。
- 网络问题分析。

## 16.2 Export 菜单要求

Export 菜单需要解释每种格式用途。

示例：

- JSON：完整结构化数据
- JSONL：适合 AI 分析
- HTML：可读调试报告
- HAR：网络请求归档

## 16.3 导出风险提示

如果本次 Session 包含敏感采集，导出前提示：

- 可能包含输入值。
- 可能包含 request body。
- 可能包含 response body。
- 可能包含 Cookie / Storage。
- 建议确认脱敏状态。

------

# 17. MCP / Local Agent

## 17.1 产品定位

MCP / Local Agent 是辅助分析入口，不是主界面。

它的作用是：

> 让本地 AI Agent 查询已记录的真实 Session，而不是控制浏览器。

## 17.2 UI 入口

入口位置：

- Settings → Local Agent
- Detail Header 辅助状态
- Inspector 底部弱入口

展示内容：

- Bridge status
- MCP server status
- Local Agent connection
- Copy MCP config
- Agent can read
- Risk explanation

## 17.3 MCP 工具方向

建议工具：

- list_sessions
- get_session
- get_timeline
- get_failed_requests
- get_console_errors
- get_user_actions
- get_navigation_flow
- get_storage_changes
- get_cookie_changes
- get_dom_changes
- get_events_around
- export_session

## 17.4 MCP 原则

- MCP 查询已记录 Session。
- 不主打浏览器操控。
- 数据保留在浏览器 IndexedDB。
- Bridge 只做本地命令转发、鉴权、状态、超时。
- 工具层默认不替用户删除、过滤、摘要或判断隐私。
- 用户和模型决定读取哪些数据、如何处理。

------

# 18. 数据模型建议

## 18.1 TimelineItem

前端可将不同原始数据统一聚合为 TimelineItem。

```ts
type TimelineItem = {
  id: string;
  sessionId: string;

  source:
    | 'session'
    | 'user'
    | 'network'
    | 'console'
    | 'navigation'
    | 'storage'
    | 'cookie'
    | 'dom';

  type: string;

  relativeTime: number;
  absoluteTime: number;
  systemTime?: string;

  severity?: 'info' | 'warning' | 'error';

  title: string;
  summary: string;

  pageUrl?: string;
  tabId?: number;

  rawRef: {
    collection: string;
    id: string;
  };

  raw?: unknown;
};
```

## 18.2 Severity 规则

### Network

- status >= 500：error
- status >= 400：warning
- timeout / failed：error

### Console

- error：error
- warning：warning
- info / log：info

### Storage / Cookie

- 删除 auth、session、token 类 key：warning
- 修改敏感 key：warning

### DOM

- 大量 mutation：warning
- error-message 类节点增加：warning

------

# 19. 视觉与交互原则

## 19.1 产品性格

Record All 应该像：

- DevTools
- Tracing tool
- Observability tool
- Flight recorder
- Local debugging utility

不应该像：

- 普通 SaaS Dashboard
- 营销 landing page
- 视频录屏软件
- AI 聊天工具
- 卡片堆叠模板

## 19.2 视觉方向

推荐：

- 专业工具风
- 深色 inspector 或干净浅色 technical UI
- 高信息密度
- 清晰分割线
- 状态色明确
- 数字、时间、URL、method、status 使用等宽字体

## 19.3 数据源颜色

建议：

- User：蓝色
- Network：紫色
- Console：琥珀色
- Error：红色
- Storage：绿色
- Cookie：黄色
- DOM：青色
- Navigation：靛蓝
- Session：灰色

要求：

- 颜色必须配合 label / icon。
- 不只靠颜色区分。
- 错误和警告要明显。
- 正常事件保持克制。

------

# 20. 隐私与安全

## 20.1 高风险采集项

以下项目必须有明确提示：

- Input values
- Request body
- Response body
- Cookies
- Storage
- MCP / Agent access

## 20.2 用户控制

用户必须可以：

- 开启 / 关闭输入值采集。
- 开启 / 关闭 request body 采集。
- 开启 / 关闭 response body 采集。
- 开启 / 关闭脱敏。
- 删除 Session。
- 导出前理解导出内容。
- 查看 Agent 可读数据范围。

## 20.3 风险提示文案

深度采集提示：

> 深度采集可能记录请求体、响应体和输入值，Chrome 可能显示 debugger 权限提示。仅在需要深度调试证据时使用。

导出提示：

> 本次录制包含敏感采集数据，导出内容可能包含输入值、请求体、响应体、Cookie 或 Storage 数据。请确认后继续。

Agent 提示：

> 本地 Agent 可读取已授权的录制 Session 数据，用于分析时间线、失败请求、Console error 和状态变化。数据默认保留在本地。

------

# 21. 技术约束

当前技术栈：

- Chrome MV3 Extension
- 原生 HTML / CSS / TypeScript
- Vite
- IndexedDB
- chrome.storage.local.user_config
- data-i18n
- shared i18n module
- shared theme module

实现要求：

1. 不引入大型 UI 框架。
2. 不依赖远程 CDN。
3. 不使用违反 Chrome Extension CSP 的 inline script。
4. 避免不安全动态 HTML。
5. 尽量保留现有 DOM id。
6. 修改 DOM id 时必须同步修改 TypeScript。
7. 新增文案进入 i18n。
8. 支持中文、英文。
9. 支持浅色、深色、跟随系统。
10. 大量数据渲染需要考虑性能。
11. Timeline 后续需要虚拟滚动或分批渲染。
12. DOM mutation 默认摘要化，避免性能和噪音问题。

------

# 22. 优先级规划

## 22.1 P0：核心产品成型

### Popup

- Ready 状态。
- Deep Capture 选择状态。
- Recording 状态。
- Recording Saved 状态。
- Start / Stop 主按钮。
- 模式名称改为标准采集 / 深度采集。
- Session ID 弱化。
- 最近录制列表优化。
- 高风险采集提示。

### Detail

- Session Header。
- Metrics Strip。
- Unified Timeline。
- Timeline Filter。
- Inspector Panel。
- Failed request / Console error 高亮。
- Related Nearby Events。
- Network View 基础优化。
- Console View 基础优化。
- Export 菜单整理。

## 22.2 P1：Evidence 完整化

- Evidence Tab。
- User Actions View。
- Navigation Flow。
- Storage View。
- Cookie View。
- DOM Mutation Summary。
- Timeline 与 Evidence 联动。
- Recording with warning 状态。
- Capture Settings 状态。

## 22.3 P2：AI-ready 与报告交付

- MCP Bridge 状态 UI。
- Copy MCP config。
- Agent 可读数据说明。
- MCP 查询工具完善。
- HTML Report 优化。
- JSONL 针对 AI ingest 优化。
- Analyze with local Agent 弱入口。

## 22.4 P3：增强能力

- 轻量 Timeline Playback。
- Session Summary。
- 自动异常摘要。
- 更强筛选和搜索。
- 大 Session 虚拟滚动。
- 多 Session 对比。

------

# 23. 成功指标

## 23.1 可用性指标

1. 用户 3 秒内能判断当前是否录制中。
2. 用户 1 秒内能找到 Start / Stop。
3. 用户录制停止后能自然进入 Detail。
4. 用户能在 Timeline 中找到第一个失败请求。
5. 用户能理解失败请求前后的相关事件。
6. 用户能区分标准采集和深度采集。
7. 用户能理解敏感采集风险。

## 23.2 产品指标

1. Start Recording 点击率。
2. Stop Recording 后打开 Detail 的比例。
3. Timeline 筛选使用率。
4. Failed request 点击率。
5. Console error 点击率。
6. Export 使用率。
7. HTML / HAR / JSONL 各格式导出比例。
8. Deep Capture 使用率。
9. Recording Saved 状态下打开详情的比例。
10. MCP config 复制次数。

## 23.3 质量指标

1. Popup 状态切换稳定。
2. Detail 大数据渲染不卡顿。
3. Timeline 排序准确。
4. Inspector 数据完整。
5. Export 成功率高。
6. 中英文文案完整。
7. 明暗主题一致。
8. 敏感采集提示完整。
9. Chrome extension CSP 合规。

------

# 24. 验收标准

## 24.1 Popup 验收

1. Ready 状态清楚。
2. Recording 状态强烈。
3. 计时器明显。
4. Start / Stop 是最强主操作。
5. 深度采集风险提示清楚。
6. 完整 Session ID 不出现在主视觉。
7. 最近录制可快速进入详情。
8. 停止录制后出现 Recording Saved 状态。
9. Capture Settings 分组清晰。
10. 不像配置表单或 Dashboard。

## 24.2 Detail 验收

1. Header 展示 Session 基础信息。
2. Metrics Strip 展示关键异常指标。
3. Timeline 是默认主视图。
4. Timeline 融合多数据源。
5. Failed request 和 Console error 明显突出。
6. 点击事件后 Inspector 展示详情。
7. Inspector 展示 Related Nearby Events。
8. Network / Console 可独立筛选查看。
9. Evidence 包含 User Actions、Navigation、Storage、Cookie、DOM。
10. Export 菜单清楚。
11. AI Agent 入口是次级入口，不干扰主流程。

## 24.3 产品验收

1. 产品不像普通 SaaS Dashboard。
2. 产品不像弱版 DevTools。
3. 产品不像录屏工具。
4. 用户能理解这是浏览器调试黑匣子。
5. 用户能完成“开始录制 → 停止录制 → 进入详情 → 找到问题 → 导出 / 交给 AI”的完整路径。
6. 产品能通过统一时间线回答“问题发生在哪一秒，以及那一秒前后发生了什么”。

------

# 25. 推荐产品文案

## 25.1 英文

Not another DevTools panel.
A browser black box for real user sessions.

Capture what happened.
Inspect why it happened.
Hand it off to humans or AI.

## 25.2 中文

不是另一个 DevTools 面板。
而是浏览器问题现场的黑匣子。

记录发生了什么。
分析为什么发生。
交给人或 AI 继续处理。

## 25.3 Popup 文案

Ready：

- 就绪
- 准备记录浏览器调试证据
- 开始录制

Standard Capture：

- 标准采集
- 记录用户操作、页面导航、网络元数据和 Console 日志

Deep Capture：

- 深度采集
- 记录请求体、响应体和输入值，适合深度调试

Recording：

- 录制中
- 停止录制
- 打开实时详情

Saved：

- 录制已保存
- 打开会话详情
- 导出
- 开始新的录制

Warning：

- 部分数据未捕获
- 查看警告
- 查看详情

------

# 26. 最终产品结论

Record All 的核心机会不是“替代 DevTools”，也不是“让 AI 操控浏览器”。

它真正的机会是：

> 把真实浏览器 Session 变成一份完整、可信、可分析、可导出、可被 AI 查询的结构化证据包。

Popup 负责让录制开始得足够简单、状态足够清楚。

Detail 负责让问题分析足够高效、时间线足够有因果感。

Export 和 MCP 负责把证据交给人或 AI。

Record All 的核心产品原则是：

> 不展示更多孤立数据，而是组织更清楚的证据链。