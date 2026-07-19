# project_02 审阅报告（haiku）

## 当前模型判断依据

- 显式指定模型为 **haiku**（Claude 3.5 Haiku），由用户授权 `model_override_authorized`。
- 配置别名底层实际调用的模型版本不可观测，本报告以"haiku 模型能力上限"为判断前提，对涉及推理复杂度的问题标准适度从宽。

## 审阅范围

`project_02` 批次共 13 个文件、1230 行，按 MANIFEST.md 所列：

| # | 文件 | 行数 | 类别 |
|---|------|------|------|
| 1 | `assets/icons/icon.svg` | 11 | 图标源文件 |
| 2 | `assets/promo/promo_marquee.svg` | 28 | 宣传素材（生成） |
| 3 | `assets/promo/promo_small.svg` | 27 | 宣传素材（生成） |
| 4 | `package.json` | 61 | 项目配置 |
| 5 | `playwright.config.ts` | 141 | E2E 测试配置 |
| 6 | `scripts/capture_store_screenshots.mjs` | 186 | 商店截图生成脚本 |
| 7 | `scripts/copy_locales.mjs` | 18 | 构建辅助脚本 |
| 8 | `scripts/generate_icons.mjs` | 238 | 图标/素材生成脚本 |
| 9 | `scripts/outline_svg_text.py` | 155 | SVG 文字转路径脚本 |
| 10 | `scripts/scan_tracked_tree.mjs` | 300 | 预提交安全扫描脚本 |
| 11 | `tsconfig.json` | 21 | TypeScript 配置 |
| 12 | `vite.config.ts` | 22 | Vite 构建配置 |
| 13 | `vitest.config.ts` | 22 | Vitest 测试配置 |

## 高优先级问题

### H1: `scripts/capture_store_screenshots.mjs` 输出目录 `store/` 不在 `.gitignore` 中

- **位置**: `scripts/capture_store_screenshots.mjs:9` 定义 `SCREENSHOTS_DIR = join(PROJECT_ROOT, 'store', 'screenshots')`
- **现象**: `.gitignore` 未包含 `store/` 条目，脚本生成的 PNG 截图可能被意外提交入库。
- **影响**: 二进制截图文件混入版本历史，增加仓库体积，违反项目"生成物不入库"约束（`artifacts/` 有明确 gitignore 保护，但 `store/` 没有）。
- **建议**: 在 `.gitignore` 中添加 `store/` 或 `store/screenshots/`。也可将输出路径改为 `artifacts/store-screenshots/` 与现有 gitignore 规则对齐。
- **置信度**: 高（`.gitignore` 全文已确认不存在 `store` 规则）。

### H2: `vite.config.ts` 硬编码 UTC+8 时区偏移

- **位置**: `vite.config.ts:7`
- **现象**:
  ```ts
  __BUILD_TIME__: JSON.stringify(new Date(new Date().getTime() + 8 * 3600 * 1000)...)
  ```
- **影响**: 构建服务器若不在 UTC+8 时区（如 GitHub Actions 默认 UTC），`__BUILD_TIME__` 不反映构建发生的实际当地时间，可能造成调试混淆。
- **建议**: 移除手动偏移，直接使用 `new Date().toISOString()` 或明确标注为 UTC+8 固定时区。若需本地时间，用 `Intl.DateTimeFormat` 指定时区。
- **置信度**: 高（时区计算逻辑明确）。

### H3: `scripts/capture_store_screenshots.mjs` 缺少结构化错误处理

- **位置**: `scripts/capture_store_screenshots.mjs:68-98` (`generate_capture`)、`:183-186` (`main().catch`)
- **现象**: 
  - `generate_capture` 中 `popup.evaluate(() => chrome.runtime.sendMessage(...))` 无 try-catch，若扩展未加载或 API 变更则抛出未处理异常。
  - `get_extension_id` 调用 `context.serviceWorkers()[0]` 假设 MV3 service worker 已就绪，无超时外的就绪检测。
  - 顶层 `main().catch` 仅写 stderr，无退出码（默认 0）。
- **影响**: 脚本失败时无清晰错误上下文，排查困难。
- **建议**: 
  - 为 `chrome.runtime.sendMessage` 调用添加 try-catch，输出有意义的错误信息。
  - `get_extension_id` 应在等待 service worker 后验证 URL 可解析。
  - `main().catch` 中显式设置 `process.exitCode = 1`（当前第 185 行已有 `process.exit(1)` 但只在 `err` 有值时执行——注意 `catch` 的参数始终非空，所以这个其实没问题。重新检查：第 183-186 行确实有 `process.exit(1)`。撤回 exit code 这一条）。
- **置信度**: 中

## 中优先级问题

### M1: `scripts/capture_store_screenshots.mjs` 直接操纵 DOM dataset 做截图

- **位置**: `scripts/capture_store_screenshots.mjs:164-168`
- **现象**:
  ```js
  nav.dataset.on = nav === selected_nav ? '1' : '0';
  ```
- **影响**: 若 `dashboard_settings.ts` 中 `data-setnav` 或 `data-on` 属性的语义或取值变更，截图外观与实际 UI 不一致，脚本静默产生错误截图。
- **建议**: 通过点击事件触发导航（`nav.click()`）而非直接操作 dataset，让组件自身管理状态。
- **置信度**: 中（取决于 dashboard 组件稳定性）。

### M2: `scripts/outline_svg_text.py` 字体路径硬编码为 Linux 路径

- **位置**: `scripts/outline_svg_text.py:24-25`
- **现象**:
  ```python
  FONT_LATIN_BOLD = Path("/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf")
  FONT_CJK_BOLD = Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc")
  ```
- **影响**: 脚本在 macOS（字体路径 `/System/Library/Fonts/` 或 `/Library/Fonts/`）和 Windows 上必然失败。项目当前在 WSL/Linux 开发，不影响正常工作，但限制了贡献者环境。
- **建议**: 通过环境变量或命令行参数覆盖字体路径，并给出清晰的错误提示。例如 `NOTO_LATIN_BOLD` / `NOTO_CJK_BOLD` 环境变量。
- **置信度**: 高（文件路径特定于 Debian/Ubuntu 系发行版）。

### M3: `playwright.config.ts` 端口硬编码未与配置中心对齐

- **位置**: `playwright.config.ts:28,34` 分别硬编码端口 `4174` 和 `17832`
- **现象**: 项目约定（`CLAUDE.md`）要求分配端口前读取 `$MY_FILE_CONFIG/service_configs/ports.yaml`。这些端口是历史分配的，但无文档记录其来源或占用声明。
- **影响**: 若其他服务占用这些端口，E2E 测试失败且错误信息不直接指向端口冲突。
- **建议**: 通过环境变量覆盖端口：`PREVIEW_PORT` / `FIXTURE_PORT`，并提供默认值。
- **置信度**: 中（取决于实际端口占用情况）。

### M4: `scripts/scan_tracked_tree.mjs` 中 `is_forbidden_path` 的路径匹配可能漏检

- **位置**: `scripts/scan_tracked_tree.mjs:138-148`
- **现象**: `forbidden_paths` 中 `'.claude/skills/'` 以后缀 `/` 标记为前缀匹配，但 `'.mcp.json'` 和 `'.claude/settings.local.json'` 是精确匹配。若出现 `.claude/settings.local.json.backup` 这种变体文件名，不会被拦截。
- **影响**: 用户可能在 `.claude/` 下误提交类似命名的本地配置文件变体。
- **建议**: 对关键禁止项（如 `.claude/settings.local.json`）使用前缀匹配 `.claude/settings.local.json`（去掉尾部 `/` 仍为精确匹配），或扩展匹配模式。
- **置信度**: 低（实际不太可能出现 `.backup` 后缀的敏感文件）。

## 低优先级问题

### L1: `tsconfig.json` 中 `outDir` 在 `noEmit: true` 时冗余

- **位置**: `tsconfig.json:17`
- **现象**: `"outDir": "./artifacts/dist"` 与 `"noEmit": true` 同时存在，`outDir` 不会被 tsc 使用。
- **影响**: 无功能影响，仅造成阅读时的困惑。
- **建议**: 移除 `outDir` 或在注释中说明保留原因（如 IDE 提示用）。
- **置信度**: 高

### L2: `playwright.config.ts` 项目配置风格不一致

- **位置**: `playwright.config.ts:39-139`（projects 数组）
- **现象**: `e2e-t0001` 和 `e2e-t0003` 使用 `testDir` 定位测试文件，其余项目使用 `testMatch`（glob 匹配）。同一配置文件中混用两种定位方式。
- **影响**: 可读性略差，维护者需了解两种语义。
- **建议**: 统一为 `testMatch`（T0001 和 T0003 目录下文件可用 `testMatch: 'T0001/*.spec.ts'`）。
- **置信度**: 高

### L3: `scripts/copy_locales.mjs` 缺少目标目录存在性的事先检查

- **位置**: `scripts/copy_locales.mjs:13-15`
- **现象**: 只在 `artifacts/dist` 不存在时创建，但如果 `artifacts/` 目录本身不存在（首次构建），`mkdirSync('artifacts/dist', { recursive: true })` 会正确创建。但脚本未检查复制操作是否真的写入了文件。
- **影响**: 若源目录存在但为空，脚本"成功"但实际未复制任何文件，后续构建可能因缺少 `_locales` 而行为异常。
- **建议**: 复制后验证目标目录存在且非空。
- **置信度**: 低

### L4: `package.json` 中 `build:zip` 跨平台兼容性

- **位置**: `package.json:39`
- **现象**: `"build:zip": "cd artifacts/dist && zip -r ../extension.zip ."`
- **影响**: `cd &&` 语法在 Windows cmd 中不工作（需 `cd artifacts/dist &` 或使用跨平台方案）。项目当前在 WSL 开发，不影响实际使用。
- **建议**: 用 `node` 脚本或 `cross-zip` 包替代 shell 命令，或改用 `"zip -r artifacts/extension.zip -j artifacts/dist/*"` 避免 `cd`。
- **置信度**: 中（仅限 Windows 受影响）

### L5: `scripts/generate_icons.mjs` 中临时文件清理吞掉错误

- **位置**: `scripts/generate_icons.mjs:218-222`
- **现象**:
  ```js
  try { unlinkSync(tmp_text); } catch { /* ignore */ }
  ```
- **影响**: 若 `unlinkSync` 因权限问题失败，临时文件残留在 `assets/promo/` 中，可能被误提交。概率很低。
- **建议**: 至少使用 `console.warn` 报告清理失败，或改用 `fs.rmSync` 的 `force` 选项。
- **置信度**: 低

## 改进建议

1. **统一构建脚本的错误处理模式**: `scripts/` 下各脚本的错误处理风格不一致（有的用 `console.error` + `process.exit`，有的用 `throw`，有的吞异常）。建议统一为：顶层入口 catch 写 stderr + `process.exit(1)`；子函数 throw 有意义的 Error。
2. **端口管理**: 将 `playwright.config.ts` 和 `capture_store_screenshots.mjs` 中的硬编码端口改为环境变量，与项目端口管理约定对齐。
3. **脚本依赖文档化**: `capture_store_screenshots.mjs` 依赖 Playwright、运行中的 E2E fixture server 和已加载的扩展，这些前置条件应在脚本头部注释或 README 中说明。
4. **`store/` 目录处理**: 见 H1，加入 gitignore 或将目录改到 `artifacts/` 下。

## 不确定项

1. **zod v4 兼容性**（置信度：低）: `package.json` 依赖 `zod: ^4.4.3`，`src/mcp/schemas.ts` 使用了 zod。zod v4 相比 v3 有 breaking changes（如 `z.string()` 的某些方法签名变更）。未深入检查 `schemas.ts` 是否完全兼容 v4 API，但既然能通过构建（`tsc` 无报错），大概率已适配。
2. **`playwright.config.ts` `e2e-ext` 的 testMatch 是否覆盖所有预期文件**（置信度：低）: glob 模式 `'e2e-{baidu,states,labels,...}.spec.ts'` 依赖于文件名约定，若新增 E2E 测试文件命名不符合该模式，会被静默跳过。
3. **`scripts/outline_svg_text.py` 中 `pick_font` 的 CJK 字符判断阈值**（置信度：低）: 使用 `ord(ch) > 0x2E7F` 判断是否需要 CJK 字体。`0x2E80` 是 CJK Radicals Supplement 起点，基本覆盖所有中日韩字符。但少数扩展区字符（如扩展 B-G）也在 `> 0x2E7F` 范围内，判断逻辑正确。

---

*本报告仅审阅 `project_02` 批次的 13 个文件，未修改任何源文件。*
