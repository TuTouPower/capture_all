# project_02 审阅报告

## 模型判断依据

当前模型：Sonnet。由用户显式指定 `model_override_authorized` 授权调用 sonnet。配置别名底层版本不可观测，以用户声明为准。

## 审阅范围

| 文件 | 行数 |
|------|------|
| `assets/icons/icon.svg` | 11 |
| `assets/promo/promo_marquee.svg` | 28 |
| `assets/promo/promo_small.svg` | 27 |
| `package.json` | 61 |
| `playwright.config.ts` | 141 |
| `scripts/capture_store_screenshots.mjs` | 186 |
| `scripts/copy_locales.mjs` | 18 |
| `scripts/generate_icons.mjs` | 238 |
| `scripts/outline_svg_text.py` | 155 |
| `scripts/scan_tracked_tree.mjs` | 300 |
| `tsconfig.json` | 21 |
| `vite.config.ts` | 22 |
| `vitest.config.ts` | 22 |

合计 13 文件，1230 行。覆盖构建配置、Playwright E2E 配置、图标/素材生成管线、仓库安全扫描脚本、TypeScript/Vite/Vitest 配置。

## 高优先级问题

### H1. `vite.config.ts` 硬编码 UTC+8 时间偏移

- **位置**: `vite.config.ts:7`
- **现象**: `new Date(new Date().getTime() + 8 * 3600 * 1000)` 手动加 8 小时偏移计算构建时间。
- **影响**: 若开发者处于 UTC+8 以外时区构建，`__BUILD_TIME__` 值不反映真实本地时间，也不反映 UTC 时间（被强制偏移）。代码注释中 CLAUDE.md 明确"时间用 UTC+8"，但硬编码偏移不处理 DST（虽然中国无 DST，但无法约束所有构建环境）。此外，该表达式在 Vite 配置顶层执行，构建时间取的是 Vite 启动时而非 bundle 完成时，差异可忽略但语义不精确。
- **建议**: 使用 `toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })` 或依赖构建环境 `TZ=Asia/Shanghai` 环境变量，避免硬编码偏移。
- **置信度**: 高
- **优先级**: 高

### H2. `scripts/outline_svg_text.py` 硬编码字体路径

- **位置**: `scripts/outline_svg_text.py:24-25`
- **现象**: 字体路径固定为 `/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf` 和 `/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc`，仅适用于 Debian/Ubuntu 的 `fonts-noto` 包安装路径。
- **影响**: macOS（Homebrew 或系统字体路径不同）或非 Debian 系 Linux 上运行 `generate:icons` 脚本会直接 `FileNotFoundError`。无法在 macOS 上重新生成素材。
- **建议**: 使用 `fc-match` 动态查找字体，或在脚本顶部支持环境变量覆盖路径（如 `FONT_LATIN_BOLD` / `FONT_CJK_BOLD`），保持默认值不变。脚本文档注释已声明依赖，可接受当前状态作为已知限制。
- **置信度**: 高
- **优先级**: 高（阻塞跨平台素材生成）

### H3. `scripts/capture_store_screenshots.mjs` 使用不安全 Chromium 启动参数

- **位置**: `scripts/capture_store_screenshots.mjs:113-114`
- **现象**: `--ignore-certificate-errors` 和 `--allow-running-insecure-content` 作为 Chromium 启动参数。
- **影响**: 虽然仅连接 `http://127.0.0.1:17832`（本地 fixture），但这些标志使浏览器忽略所有证书错误和混合内容限制。若 `FIXTURE_URL` 被修改或该脚本在 CI 中指向远程地址，存在中间人攻击风险。`--no-sandbox` 在非 root 环境下可接受，但 `--disable-setuid-sandbox` 与之冗余。
- **建议**: 移除 `--ignore-certificate-errors` 和 `--allow-running-insecure-content`（本地 HTTP 不需要）。或至少添加注释说明为何必须保留。
- **置信度**: 高
- **优先级**: 高

## 中低优先级问题

### M1. promo SVG 内联重复 gradient ID

- **位置**: `assets/promo/promo_marquee.svg:6`、`assets/promo/promo_small.svg:6`
- **现象**: 两个 SVG 文件均定义 `id="text"` 作为 `<linearGradient>` 的 ID。
- **影响**: 若同一 HTML 页面同时嵌入两个 SVG（如商店页面展示），`url(#text)` 引用可能指向错误的 gradient。实际风险较低，因 SVG 内联时 shadow DOM 或内联上下文通常隔离 ID。
- **建议**: 使用唯一 ID（如 `grad-marquee-text` / `grad-small-text`），或确认只在独立上下文中使用。
- **置信度**: 中
- **优先级**: 中

### M2. `promo_small.svg` aria-label 与产品名不一致

- **位置**: `assets/promo/promo_small.svg:2`
- **现象**: `aria-label="Capture"`，而产品全名为 "Capture All 全采"。对比 `promo_marquee.svg` 的 `aria-label="Capture All 全采"`。
- **影响**: 辅助技术用户获得不完整的产品名称。生成模板 `PROMO_SPECS` 中 `aria_label` 硬编码为 `'Capture'`（`generate_icons.mjs:47`），是设计决策还是遗漏需确认。
- **建议**: 若 small tile 确实只展示 "Capture"，则 `aria-label` 应与视觉内容一致；若应为产品全名，则修正模板。
- **置信度**: 中
- **优先级**: 中

### M3. `scan_tracked_tree.mjs` 的 `content_patterns` 误报风险

- **位置**: `scripts/scan_tracked_tree.mjs:51`
- **现象**: `personal-absolute-path` 正则 `/\/home\/[^\s'"`]+/` 会匹配任何含 `/home/` 的路径，包括文档中的示例路径、注释中的路径引用。
- **影响**: 可能在文档文件或包含路径字符串的源码中产生误报。当前 `forbidden_paths` 已排除 `docs/archive/`，但 `docs/` 其他文件仍可能触发。
- **建议**: 在文档文件（`.md`）中放宽此规则，或仅对非文档文件检查。或确认该扫描仅用于 pre-commit hook 而非 CI。
- **置信度**: 中
- **优先级**: 低

### M4. `copy_locales.mjs` 使用 `console.log`

- **位置**: `scripts/copy_locales.mjs:18`
- **现象**: `console.log(...)` 用于输出成功信息。
- **影响**: CLAUDE.md 约定"日志优先，禁止 print / console.log 调试输出"。但此为构建脚本（非运行时代码），`console.log` 是 Node.js CLI 脚本的标准做法。严格来说违反字面约定。
- **建议**: 构建脚本使用 `console.log` 可接受。若需严格遵循，可改为 `process.stdout.write(...)`。建议在约定中明确"构建脚本 CLI 输出除外"。
- **置信度**: 高
- **优先级**: 低

### M5. `capture_store_screenshots.mjs` 端口硬编码

- **位置**: `scripts/capture_store_screenshots.mjs:10`
- **现象**: `FIXTURE_URL = 'http://127.0.0.1:17832/test-page.html'` 硬编码端口 17832。
- **影响**: 若 `ports.yaml` 中端口分配变更，此脚本不会同步更新。CLAUDE.md 要求"分配端口前必须先读 `$MY_FILE_CONFIG/service_configs/ports.yaml`"。
- **建议**: 从配置文件读取端口，或至少在脚本注释中标注端口来源和约束。
- **置信度**: 高
- **优先级**: 中

### M6. `playwright.config.ts` E2E 项目未覆盖全部 spec 文件

- **位置**: `playwright.config.ts:47`
- **现象**: `e2e-ext` 项目的 `testMatch` 列表包含 `e2e-{baidu,states,labels,stop,ui-audit,export,realtime-detail,consistency,dashboard-list,detail-tabs,toutiao,qq,sina,logging,T0001*}.spec.ts`，但 `e2e-toggle-effects.spec.ts`、`e2e-settings-effects.spec.ts`、`e2e-cdp-retry.spec.ts` 等未被任何项目显式匹配。
- **影响**: 部分 E2E 测试仅通过 `test:e2e:all`（匹配所有 spec）运行，无法单独通过 `--project` 精确触发。
- **建议**: 确认这是有意设计（某些 spec 仅在全量运行时执行）还是遗漏。若为遗漏，添加到对应项目或新建项目。
- **置信度**: 中
- **优先级**: 中

## 改进建议

### S1. `vite.config.ts` 构建时间精度

当前 `__BUILD_TIME__` 在 Vite 配置加载时计算（模块顶层执行），而非 bundle 完成时。可改用 Vite 插件的 `closeBundle` hook 获取更精确的构建完成时间。差异通常在秒级，实际影响可忽略。

### S2. `generate_icons.mjs` 的 `extract_logo_inner` 正则健壮性

`extract_logo_inner` 使用 `/<svg[^>]*>([\s\S]*)<\/svg>/i` 提取 SVG 内容。若 `icon.svg` 的 `<title>` 内容包含 `</svg>` 字符串（极不可能），正则会匹配错误。当前结构下无实际风险，但可在注释中标注前提假设。

### S3. `outline_svg_text.py` TTC 字体选择策略

`load_font` 遍历 TTC 集合选择 "bold" + "sc" 字体，回退到 `fonts[0]`。若系统安装了不含 SC 变体的 NotoSansCJK TTC，可能选中非预期字重。建议添加注释说明预期的 TTC 结构。

### S4. `scan_tracked_tree.mjs` 的 `find_key_line` 精度

`find_key_line` 使用 `content.indexOf('"KEY"')` 定位行号，仅匹配双引号包裹的 key。YAML 文件中无引号 key 不会命中此路径，行号回退为 1。影响有限，因为 JSON 中 key 通常带引号，YAML 结构化检查走独立分支。

### S5. `tsconfig.json` 排除 `tests` 目录

`tsconfig.json:20` 的 `exclude: ["node_modules", "artifacts", "tests"]` 正确排除测试文件。但测试文件中 `import` 的共享类型（如 `src/shared/types.ts`）仍通过 `include: ["src/**/*.ts"]` 覆盖。无问题，仅为确认。

## 不确定项

### U1. `package.json` 依赖版本真实性

`@types/node: ^25.9.1`、`vite: ^8.1.4`、`zod: ^4.4.3` 等版本号超出当前（2026-07）已知稳定版范围。无法确认这些是真实发布的版本还是预发布/私有 registry 版本。若为占位符或预发布版本，生产构建可能不稳定。

- **置信度**: 低（无法联网验证）
- **行动**: 无需修改，但上线前应确认 `npm install` 在干净环境可正常解析。

### U2. `capture_store_screenshots.mjs` 的 `--no-sandbox` 安全性

在 CI 或容器环境中 `--no-sandbox` 通常是必需的（Chromium 在容器内无法使用 namespace sandbox）。在开发者本机运行则降低了安全隔离。脚本注释未说明原因。

- **置信度**: 中
- **行动**: 添加注释说明为何需要 `--no-sandbox`。

### U3. `playwright.config.ts` 的 `NO_PROXY` 注入

配置文件顶层设置 `process.env.NO_PROXY` 和 `process.env.no_proxy`，确保 loopback 地址不走代理。这是合理的防御性配置，但修改全局 `process.env` 在模块加载时执行，可能影响同进程内的其他模块。

- **置信度**: 中
- **行动**: 当前使用场景（Playwright 独立进程）无实际影响。
