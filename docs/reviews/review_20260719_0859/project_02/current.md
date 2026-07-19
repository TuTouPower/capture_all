# project_02 全量只读审阅报告

## 当前模型判断依据

`~/.claude/settings.json` 顶层 `model` 为 `default_model`，`env.ANTHROPIC_MODEL` 也为 `default_model`。主会话仅暴露同一别名，未暴露别名映射后实际模型 ID。只能确认当前模型继承 `default_model`，不能确认具体模型家族或版本。

## 审阅范围

按 `docs/review_20260719_0859/MANIFEST.md` 的 `project_02` 批次逐文件审阅，共 13 文件、约 1230 行：

- `assets/icons/icon.svg`
- `assets/promo/promo_marquee.svg`
- `assets/promo/promo_small.svg`
- `package.json`
- `playwright.config.ts`
- `scripts/capture_store_screenshots.mjs`
- `scripts/copy_locales.mjs`
- `scripts/generate_icons.mjs`
- `scripts/outline_svg_text.py`
- `scripts/scan_tracked_tree.mjs`
- `tsconfig.json`
- `vite.config.ts`
- `vitest.config.ts`

交叉核对范围仅用于验证配置真实性与仓库约束，包括 `.github/workflows/ci.yml`、`.gitignore`、相关测试、活动文档及少量被扫描文件。执行只读命令 `npm run scan:tracked-tree`，结果为 71 项 finding、退出码 1；未修改源文件，未运行会生成构建产物或截图命令。

## 高优先级问题（CRITICAL / HIGH）

### 1. 扫描器声明跳过 `docs/archive/`，实现却扫描全部归档，导致 CI 安全门禁稳定失败

- **位置**：`scripts/scan_tracked_tree.mjs:23-26, 284-292`
- **现象**：注释明确写明“scanner skips its content”，但 `forbidden_paths` 未包含可跳过目录，文件循环也没有 `docs/archive/` 分支。实际运行 `npm run scan:tracked-tree` 返回 71 项，其中大量来自 `docs/archive/**`，包括归档中的绝对路径和历史凭据示例。`.github/workflows/ci.yml` 将该命令作为 CI 必跑步骤。
- **影响**：当前主分支 CI 会在测试和构建前失败；注释、归档政策与真实行为矛盾。归档只进不出，历史文本会持续扩大误报，安全门禁无法作为可信合并条件。
- **建议**：在文件枚举后、内容扫描前显式跳过 `path.startsWith('docs/archive/')`，并新增行为测试，验证归档内敏感模式不触发、活动目录同模式仍触发。不要仅靠注释或从 Git 跟踪列表移除归档。
- **置信度**：高（已执行命令复现，且控制流直接可见）
- **优先级**：HIGH

### 2. 源码凭据赋值识别把运行时表达式、生成 token、测试 fixture 判为硬编码凭据

- **位置**：`scripts/scan_tracked_tree.mjs:67-109, 257-281`
- **现象**：`assignment_pattern` 只截取空白前 token，再用有限正则猜测表达式。模板字符串、函数调用、带空格表达式等无法可靠识别。例如 `src/bridge/server.ts:282` 的随机生成 `instance_token = \`ext_${randomBytes(...)}\`` 被报为 `credential-assignment`；测试中明显为 fixture 的 `agent_bridge_token` 也被批量报告。排除归档后仍存在活动源码、测试、指南 finding。
- **影响**：即使修复归档跳过，扫描器仍不能通过；开发者可能被迫绕过门禁，或为消除误报弱化测试与清晰命名。更严重的是，高噪声会掩盖真实 secret 泄漏。
- **建议**：源码改用 AST 分析，只报告凭据键对应的静态非占位字符串；运行时表达式一律不按硬编码 secret 报告。若暂不引入 parser，至少将模板插值、调用表达式、成员访问、条件/逻辑表达式完整归类为表达式，并为当前真实误报逐项加入回归测试。测试 fixture 是否允许应形成明确政策，而非依赖脆弱词法猜测。
- **置信度**：高（扫描输出与源码可直接对应）
- **优先级**：HIGH

## 中低优先级问题（MEDIUM / LOW）

### 3. Playwright 默认复用端口上既有服务，可能测试错误进程并产生假阳性/假阴性

- **位置**：`playwright.config.ts:25-37`
- **现象**：两个 `webServer` 都设置 `reuseExistingServer: true`，健康检查只验证固定 URL 可访问，不验证响应来自当前仓库、当前构建或预期 fixture 版本。
- **影响**：本地遗留 Vite/fixture 进程占用 4174 或 17832 时，Playwright 会跳过启动命令，测试可能针对旧代码或无关服务执行。结果不再能证明当前工作树行为；若端口上服务内容可控，还可能向错误服务发送测试数据。
- **建议**：CI 强制 `reuseExistingServer: false`；本地若需复用，按 `process.env.CI` 分支配置。为 fixture 增加唯一健康标识或版本响应，并在测试启动前校验。
- **置信度**：高
- **优先级**：MEDIUM

### 4. 商店截图输出目录未忽略，脚本运行后容易把生成 PNG 混入提交

- **位置**：`scripts/capture_store_screenshots.mjs:9, 13-16, 31-39`；关联 `.gitignore`
- **现象**：脚本固定写入 `store/screenshots/*.png`，但 `.gitignore` 未覆盖该目录。当前目录未被 Git 跟踪，执行脚本后会产生未跟踪文件。
- **影响**：生成物容易误提交；也与仓库“生成物放 `artifacts/`，不入版本库”约束不一致。截图可能包含页面内容，误提交还会扩大隐私风险。
- **建议**：若截图仅为临时产物，改写 `artifacts/store/screenshots/`；若商店截图是需人工审核后入库的发布资产，应在脚本和文档明确其受控跟踪政策，并避免采集真实页面或真实用户数据。
- **置信度**：高
- **优先级**：MEDIUM

### 5. 构建时间通过手工加 8 小时再截断时区，语义不准确且破坏可复现构建

- **位置**：`vite.config.ts:6-8`
- **现象**：代码先给当前 epoch 加 8 小时，再调用 `toISOString()`，最后删除时区信息。结果是看似本地时间、实际无时区标识的字符串；同一源码每次构建值不同。
- **影响**：夏令时或部署区域变化时无法表达真实时区语义；无时区字符串易被误解。动态时间还导致扩展 bundle 每次变化，削弱缓存、制品比对和可复现性。
- **建议**：若 UI 只需版本信息，使用 `package.json` 版本或 commit SHA。若必须显示构建时间，使用显式 `Asia/Shanghai` 格式化并附 `UTC+8`，优先由 CI 注入固定 `SOURCE_DATE_EPOCH`/构建元数据。
- **置信度**：高
- **优先级**：MEDIUM

### 6. `build:zip` 隐式依赖系统 `zip`，项目元数据与开发文档未声明

- **位置**：`package.json:24, 39`
- **现象**：完整 `npm run build` 最后直接调用系统 `zip`。Node 依赖安装不会提供该二进制；当前活动 README、CONTRIBUTING 和部署指南只描述 Node/npm 流程，未声明 `zip` 前置条件。
- **影响**：精简 Linux、Windows 或新开发环境可能在 TypeScript、Vite、Bridge、MCP 均成功后，于最后一步失败，错误出现较晚且文档无法解释。
- **建议**：在开发/部署文档明确系统依赖，或使用已安装 Node 库生成 ZIP，减少平台差异。至少在构建前做命令存在性检查并输出可操作错误。
- **置信度**：中高（未在不同平台实际运行）
- **优先级**：LOW

### 7. Python 字体选择接口与行为不一致，`font_family` 参数实际未参与选择

- **位置**：`scripts/outline_svg_text.py:56-66, 116-124`
- **现象**：`pick_font(text, font_family)` 接收 `font_family`，但函数体完全不读取该参数；选择仅由字符码位和固定绝对字体路径决定。注释声称“若点名 CJK”时有特定策略，代码未实现该条件。
- **影响**：未来 promo 增加其他字体或 CJK 字体配置时，生成结果会静默忽略 SVG 声明。接口、注释、行为不一致，容易造成品牌资产回归。
- **建议**：要么按允许列表解析 `font_family` 并选择对应固定字体，要么移除参数及误导注释，明确工具只支持当前两种固定字体。
- **置信度**：高
- **优先级**：LOW

## 改进建议

### 1. 为扫描器建立“当前仓库必须零 finding”集成验收

- **位置**：`scripts/scan_tracked_tree.mjs`、`tests/unit/open_source_automation.test.ts`
- **现象**：现有测试覆盖人工 fixture，却未保证扫描器能扫描当前仓库并成功退出；因此单元测试可通过、CI 命令仍稳定失败。
- **影响**：测试证明局部规则，却未证明门禁可用。
- **建议**：增加独立集成检查，运行扫描器扫描受控仓库快照；至少在规则变更时同时验证真实树零误报。保留 fixture 测试验证真实 secret 命中。
- **置信度**：高
- **优先级**：MEDIUM

### 2. 生成资产增加确定性校验

- **位置**：`scripts/generate_icons.mjs`、`scripts/outline_svg_text.py`、`assets/**/*.svg`
- **现象**：生成流程依赖系统 `rsvg-convert`、fontTools 和固定 Noto 字体文件，但没有版本锁定、生成后 diff 检查或 CI 一致性校验。
- **影响**：不同 librsvg/fontTools/字体包版本可能产生不同 SVG path 或 PNG 像素，人工难以识别非预期资产变化。
- **建议**：记录工具版本；CI 可在固定环境重生成后执行 `git diff --exit-code assets/`。若不要求跨环境像素一致，至少校验 SVG 无 `<text>`、尺寸和关键 aria/title 属性保持正确。
- **置信度**：中
- **优先级**：LOW

### 3. 格式配置保持一致

- **位置**：`vite.config.ts:10-21`
- **现象**：`rollupOptions` 相对 `build` 缩进少一级，不符合仓库 4 空格缩进风格。
- **影响**：不影响运行，但降低配置层级可读性，增加审阅误判概率。
- **建议**：仅修正缩进，不做额外重构。
- **置信度**：高
- **优先级**：LOW

## 不确定项 / 可能误报

### 1. Promo SVG 视觉布局与商店规范未做像素级验证

- **位置**：`assets/promo/promo_marquee.svg`、`assets/promo/promo_small.svg`
- **现象**：静态结构、尺寸、标题、aria-label 和 path 数据可读；本次按只读审阅约束未运行渲染或截图对比。
- **影响**：无法确认文字轮廓是否裁切、视觉中心是否准确、PNG 与 SVG 是否像素一致，也未核对 Chrome Web Store 最新素材规范。
- **建议**：发布前在固定渲染环境生成 PNG，做尺寸、透明边界和视觉快照审核。
- **置信度**：低（属于未验证风险，不是已确认缺陷）
- **优先级**：LOW

### 2. `--no-sandbox` 仅用于本地截图脚本，风险取决于运行环境

- **位置**：`scripts/capture_store_screenshots.mjs:112-128`
- **现象**：Chromium 启动参数禁用 sandbox，同时访问仓库本地 fixture 和本地扩展。
- **影响**：若脚本始终在隔离开发机、只加载可信本地内容，风险有限；若在共享 CI、访问被替换 fixture 或扩展处理外部内容，浏览器漏洞影响面会扩大。
- **建议**：能正常启动时移除 `--no-sandbox`；确需保留则在文档限定仅运行可信本地内容和隔离环境。
- **置信度**：中低
- **优先级**：LOW
