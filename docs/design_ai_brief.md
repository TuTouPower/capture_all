# Record All 前端设计交接文档

## 目的

这份文档给专门的前端设计 AI 使用。目标是让设计 AI 快速理解 Record All 的产品背景、功能范围、当前状态、信息架构和设计约束，然后为项目重做或优化前端界面。

## 项目一句话

Record All 是一个 Chrome MV3 浏览器扩展，用来录制浏览器操作、网络请求、控制台日志、DOM/Storage/Cookie 变化，并把数据保存在浏览器本地，供用户导出或供本地 AI Agent 通过 MCP 查询分析。

## 背景

这个项目面向网页调试、复现问题、AI 辅助分析和浏览器行为取证。用户希望在浏览网页或调试 Web 应用时，一键开始录制，把关键操作和运行时数据收集下来。

核心诉求不是“屏幕录像”，而是结构化记录：

- 用户做了什么操作
- 页面发生了什么跳转、DOM、Storage、Cookie 变化
- 浏览器发出了哪些网络请求
- 控制台和 JS 异常出现了什么信息
- 每条数据在录制时间线上的相对位置和真实系统时间
- 后续可以导出，也可以让本地 AI Agent 直接读取扩展内数据分析

## 当前项目状态

当前是可运行的 Chrome 扩展原型，已有完整基础功能，但 UI 仍偏工程化，需要前端设计 AI 重做视觉和交互。

已完成能力：

- Chrome MV3 扩展框架
- Popup 控制面板
- 录制开始 / 停止
- 基础模式 / 深度模式
- 鼠标、键盘、滚动、DOM 变化记录
- 页面导航、SPA 路由、DOMContentLoaded 记录
- Tab 打开、切换、URL 变化记录
- 网络请求元数据、headers、request body、response body 捕获
- Console 日志和 JS 异常捕获
- localStorage / sessionStorage 变化记录
- Cookie 变化记录
- 详情页查看录制 session
- JSON / JSONL / HTML / HAR 导出
- 导出保存位置选择、导出目录、文件名模板
- 系统时间字段和时区设置
- 浅色 / 深色 / 跟随系统主题
- 中英文界面文本
- 本地 MCP / bridge / agent API 初步实现

当前待下一轮整理：

- 新的剩余任务列表还未重新规划
- 前端视觉和信息架构还没有产品级设计
- MCP 相关 UI 是否需要单独入口尚未设计

## 用户画像

主要用户是开发者、调试人员、测试人员、AI Agent 使用者。

他们关心：

- 快速开始录制
- 明确知道正在录什么
- 录制后能快速定位问题时间点
- 能浏览大量结构化数据而不迷路
- 能导出或交给 AI 分析
- 敏感数据选项清楚可控
- 深度录制会触发 Chrome debugger 权限提示，需要明确解释

## 产品定位

Record All 更像“浏览器调试黑匣子”，不是普通录屏工具。

设计应表达：

- 专业
- 可控
- 数据密集但不混乱
- 面向调试和分析
- 本地优先
- AI-ready

不要做成普通模板 Dashboard。不要默认卡片堆叠、灰白蓝通用后台风。需要有明确产品性格。

## 现有前端页面

### 1. Popup 面板

文件：

- `popup/popup.html`
- `popup/popup.ts`
- `popup/popup.css`

当前职责：

- 顶部设置入口
- 录制状态显示
- 当前 session ID 和录制时长
- 模式选择：Basic / Advanced
- 录制配置：鼠标精度、键盘、输入值、请求体、响应体
- 开始 / 停止按钮
- 最近录制列表
- View / Delete 操作
- 设置面板：语言、主题、系统时间时区、详情页时间模式、导出目录、导出文件名模板、保存位置询问、脱敏开关

设计重点：

- Popup 空间小，信息必须分层。
- “开始录制”必须是最强主操作。
- “正在录制”状态必须明显、有持续反馈。
- Basic / Advanced 的差异要清楚，Advanced 需要风险/权限提示。
- 设置很多，不能把主界面压垮。
- 最近录制要便于快速打开，但不能喧宾夺主。

### 2. Session Detail 详情页

文件：

- `detail/detail.html`
- `detail/detail.ts`
- `detail/detail.css`

当前职责：

- 展示单次录制 session
- 顶部导出按钮：JSON / JSONL / HTML / HAR
- Overview：session ID、开始时间、时长、模式、事件数、网络请求数、控制台日志数
- Tabs：Timeline / Network / Console / Events
- Timeline 支持类型过滤和搜索
- Network 支持类型过滤、URL 搜索
- Console 支持级别过滤、搜索
- Events 展示用户操作类事件
- 时间显示支持系统时间或相对时间

设计重点：

- 这是最需要重设计的主分析页面。
- 应让用户能从宏观概览进入具体记录。
- Timeline 是核心，应突出“时间线 + 多数据源融合”的概念。
- Network / Console / Events 是分析视图，不只是普通表格。
- 数据量可能很大，需要考虑滚动、筛选、密度、空状态。
- 导出按钮应可见但不抢核心分析视图。

### 3. DevTools 页面

文件：

- `devtools/devtools.html`
- `devtools/devtools_panel.html`
- `devtools/devtools.ts`
- `devtools/devtools_panel.ts`

当前较轻，主要是扩展和 DevTools 集成入口。设计优先级低于 Popup 和 Detail。

## 核心数据类型

### Session

一次录制容器。

关键字段：

- `id`
- `start_time`
- `end_time`
- `config`
- `stats.event_count`
- `stats.request_count`
- `stats.log_count`
- `stats.dom_changes`

### RecordEvent

浏览器行为和页面事件。

类型包括：

- mouse
- keyboard
- scroll
- dom_change
- navigation
- page_load
- tab_switch
- tab_created
- tab_url_change
- dom_ready
- storage_change
- cookie_change
- fetch_request
- xhr_request

### NetworkRequest

网络请求记录。

关键字段：

- method
- url
- status_code
- request_headers
- response_headers
- request_body
- response_body
- duration_ms
- resource_type
- absolute_time
- relative_time

### ConsoleLog

控制台日志。

关键字段：

- level
- args
- stack_trace
- url
- line
- column
- absolute_time
- relative_time

## 导出能力

支持格式：

- JSON：完整结构化数据
- JSONL：逐行记录，方便流式处理和 AI ingest
- HTML：自包含报告
- HAR：Chrome DevTools / Fiddler / Charles 可识别的网络归档格式

导出设置：

- 选择保存位置：默认使用 Chrome 下载保存对话框
- 导出目录：只能是 Chrome Downloads 下的相对目录
- 文件名模板：支持 `{session_id}`、`{date}`、`{ext}`
- 系统时间字段：保留原始时间戳，同时追加可读系统时间
- 时区：跟随浏览器 / UTC / Asia/Shanghai

## MCP / AI Agent 方向

项目正在把扩展做成本地 AI Agent 工具。

架构：

- 浏览器扩展：采集、存储、导出，数据源在 IndexedDB
- 本地 HTTP bridge：监听 `127.0.0.1`，只做命令转发、鉴权、状态、超时
- MCP server：暴露工具给 Claude Code、Codex 等 Agent
- Agent skill：说明 API 使用方式和风险

设计原则：

- 数据保留在浏览器扩展 IndexedDB
- MCP 分析直接通过扩展 API 取数据，不依赖导出文件
- MCP 可以触发导出，但导出不是分析前置步骤
- 工具层默认不替模型过滤、删除、摘要或隐私判断
- 用户和模型决定取哪些数据、如何处理

这部分目前偏后端/协议。前端设计 AI 可考虑是否需要在 UI 中体现：

- MCP bridge 状态
- 扩展是否连接本地 Agent
- 当前 Agent 是否可读数据
- 用户授权/风险提示
- “复制 MCP 配置” 或 “连接本地 Agent” 入口

但这些不是当前 UI 已完成项，可作为下一版设计建议。

## 设计目标

### Popup

目标：让用户 3 秒内知道状态，1 秒内开始/停止录制。

建议设计目标：

- 强状态：Ready / Recording / Error
- 主 CTA：Start / Stop
- 模式选择清楚：Basic 安全轻量，Advanced 更强但有 Chrome debugger 提示
- 设置分组：语言/主题、时间/导出、隐私/采集
- 最近记录可快速进入详情页
- 小窗口内避免过多表单直接铺开

### Detail

目标：让用户像看 DevTools + 时间线一样分析一次录制。

建议设计目标：

- 顶部 session 概览简洁，但有数据密度
- 时间线是主心智模型
- 多数据源用颜色/图标区分
- 网络请求、控制台日志、用户事件能快速筛选和搜索
- 对错误、失败请求、异常日志有视觉突出
- 大量数据时保持可读
- 导出动作清楚但次于分析

## 视觉方向建议

推荐方向：专业调试工具 + 数据时间线。

可选风格：

1. Dark inspector
   - 类似 DevTools / tracing 工具
   - 深色基底，状态色明确
   - 适合网络、控制台、错误数据

2. Light technical editorial
   - 浅色基底，高密度表格和清晰分割
   - 适合长期阅读和报告导出

3. Bento + timeline hybrid
   - Popup 用紧凑 bento 卡片
   - Detail 用时间线 + 数据表双栏
   - 更现代，但要避免模板感

不建议：

- 普通 SaaS 营销风
- 默认 Tailwind/shadcn 灰白卡片
- 大面积渐变装饰
- 过多圆角和统一卡片导致无层级

## 交互重点

### 录制状态

需要明确：

- 当前是否录制中
- 录制多久
- 当前 session ID
- 是否高级模式
- 是否捕获敏感数据类型

### 风险提示

需要清楚提示：

- Advanced 可能触发 Chrome debugger 警告
- 捕获输入值 / 请求体 / 响应体可能包含敏感数据
- 脱敏开关影响记录内容
- MCP/Agent 读取数据需要用户理解风险

### 时间表达

有两种时间：

- 相对时间：从录制开始计算，适合分析顺序
- 系统时间：真实时间，按用户时区设置显示

Detail 页应让用户理解这两者，而不是只显示一个模糊时间。

### 数据密度

Detail 页会有很多记录。设计应支持：

- compact density
- search/filter 固定在顶部
- 错误优先突出
- 详情展开/抽屉/侧栏
- 表格列不要太多，必要信息优先

## 现有技术约束

- Chrome MV3 扩展
- 前端是原生 HTML/CSS/TypeScript，不是 React
- 构建工具：Vite
- 样式文件：`popup/popup.css`、`detail/detail.css`
- i18n 使用 `data-i18n` 和 `shared/i18n.ts`
- 主题使用 `shared/theme.ts`
- 用户设置存在 `chrome.storage.local.user_config`
- 浏览器扩展 CSP 限制强，避免 inline script 和不安全动态 HTML
- 需要支持中英文
- 需要支持浅色、深色、跟随系统

## 设计 AI 输出期望

请设计 AI 输出：

1. 产品级信息架构
   - Popup 页面结构
   - Detail 页面结构
   - Settings 组织方式

2. 视觉方向
   - 色彩
   - 字体
   - 间距
   - 状态色
   - 数据源色板

3. 关键界面方案
   - Popup ready 状态
   - Popup recording 状态
   - Popup settings 状态
   - Detail overview
   - Detail timeline
   - Detail network table
   - Detail console view
   - Empty / error / loading 状态

4. 交互说明
   - 筛选
   - 搜索
   - 展开详情
   - 导出
   - 录制风险提示

5. 可落地约束
   - 不依赖大型 UI 框架
   - 可用原生 HTML/CSS/TS 实现
   - 保留现有 DOM id 或说明需要同步改 TS
   - 避免违反 Chrome extension CSP

## 当前重点文件

设计时优先看：

- `popup/popup.html`
- `popup/popup.css`
- `popup/popup.ts`
- `detail/detail.html`
- `detail/detail.css`
- `detail/detail.ts`
- `shared/i18n.ts`
- `shared/types.ts`
- `manifest.json`

## 成功标准

设计完成后，项目应该从“工程原型”提升为“专业调试工具”：

- 用户一眼知道是否在录制
- 用户知道每个高风险采集项的含义
- 录制列表和详情页不混乱
- 时间线能帮助定位问题
- 网络/控制台/事件之间关系更清楚
- 导出和 AI Agent 方向有合理入口
- UI 有明确产品性格，不像默认模板
