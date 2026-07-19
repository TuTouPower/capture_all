# project_02 审阅报告

## 当前模型判断依据

- 本报告由 opus 模型生成（用户显式授权 multi-model 审阅调用 opus）。
- 配置别名底层版本不可观测：仓库内未发现 model alias / routing 配置，无法从代码或文档侧验证实际底层模型版本，依据授权声明采信 opus。

## 审阅范围

project_02 批次共 13 文件、1230 行（按 MANIFEST 统计）：

- 资源：`assets/icons/icon.svg`、`assets/promo/promo_marquee.svg`、`assets/promo/promo_small.svg`
- 元信息/构建：`package.json`、`tsconfig.json`、`vite.config.ts`、`vitest.config.ts`、`playwright.config.ts`
- 脚本：`scripts/capture_store_screenshots.mjs`、`scripts/copy_locales.mjs`、`scripts/generate_icons.mjs`、`scripts/outline_svg_text.py`、`scripts/scan_tracked_tree.mjs`

交叉参考：`CLAUDE.md`（命令清单）、`.github/workflows/ci.yml`（CI）、`.gitignore`、`docs/guides/store_publish_list.md`、`docs/blueprint/decisions.md`（仅 grep 关键词）。

## 高优先级问题

无 P0。

## 中优先级问题

### M1. CLAUDE.md E2E 项目清单遗漏 e2e-t0001 / e2e-t0003

- 位置：`CLAUDE.md:135`（外部文档）；参照 `playwright.config.ts:59`、`playwright.config.ts:72`。
- 现象：`CLAUDE.md` 第 135 行「E2E 项目」枚举为 `e2e`、`e2e-ext`、`e2e-real`、`e2e-cdp-capture`、`e2e-mcp`、`e2e-p1`、`e2e-streaming`，但 `playwright.config.ts` 实际还定义了 `e2e-t0001`（testDir `./tests/e2e/T0001`）和 `e2e-t0003`（testDir `./tests/e2e/T0003`）两个独立 project。
- 影响：违反 CLAUDE.md「命令」小节的真实性约束；agent 或贡献者按文档跑 `--project` 时会漏掉两个项目，无法发现 T0001/T0003 目录的 spec；与项目内 docs「按需 `--project=<name>` 指定」语义不一致。
- 建议：在 `CLAUDE.md:135` 列表补 `e2e-t0001`、`e2e-t0003`。属本批次外文件，不直接修改。
- 置信度：高（直接 grep 对照，命名和 testDir 一致）。
- 优先级：中。

### M2. capture_store_screenshots.mjs / generate:icons 未在 package.json 注册或文档未说明运行前置

- 位置：`scripts/capture_store_screenshots.mjs:1-187`；`package.json:22-40`；CLAUDE.md「命令」、`docs/guides/store_publish_list.md`、README 均未提及。
- 现象：
  1. `capture_store_screenshots.mjs` 是商店截图生产脚本（store/screenshots/*.png），但 `package.json` 的 `scripts` 没有 `store:screenshots` 入口；要运行只能 `node scripts/capture_store_screenshots.mjs`。
  2. 脚本第 109-111 行强依赖 `http://127.0.0.1:17832/test-page.html`（fixture server）在运行前已启动，但脚本本身不启动该 server，需先 `npm run test:e2e:server`。该前置未在脚本顶部注释或文档中说明。
  3. 脚本第 120-127 行用 `chromium.launchPersistentContext('', {...})`——`userDataDir` 传空字符串，会在 cwd 创建临时 profile；若从仓库根运行，会污染根目录（或每次新建随机空目录，依赖 Playwright 内部行为）。
- 影响：文档真实性不足（脚本存在但无任何使用说明）；新贡献者照文档操作无法复现截图；`launchPersistentContext('')` 的 userDataDir 行为依赖 Playwright 实现，跨版本可能不稳。
- 建议：
  - 在 `package.json` 增加 `"store:screenshots": "node scripts/capture_store_screenshots.mjs"`，或在 `docs/guides/store_publish_list.md` 注明运行方式与 fixture server 前置。
  - 在脚本顶部注释中补 fixture server 前置条件（仿 `generate_icons.mjs` 的头部注释风格）。
  - 考虑显式指定 `userDataDir`（如 `join(tmpdir(), 'capture-all-store-shots')`）以避免空字符串语义。
- 置信度：中-高（脚本内容明确，仅运行前置文档化的缺失是事实判断）。
- 优先级：中。

### M3. tsconfig.json 同时设 noEmit 与 outDir，outDir 为冗余配置

- 位置：`tsconfig.json:12`（`"noEmit": true`）、`tsconfig.json:17`（`"outDir": "./artifacts/dist"`）。
- 现象：`noEmit: true` 下 TS 编译器不产出文件，`outDir` 不会生效；构建链 `tsc && vite build`（`package.json:24`）的类型检查阶段只校验类型，产物由 vite 生成到 `vite.config.ts:11` 的 `outDir: 'artifacts/dist'`。
- 影响：配置冗余、误导；新维护者可能误以为 `tsc` 会直接输出到 `artifacts/dist`。
- 建议：删除 `tsconfig.json:17` 的 `outDir`（或显式注释说明保留意图）。
- 置信度：高。
- 优先级：中-低。

## 低优先级问题

### L1. vitest.config.ts coverage include 未覆盖 scripts/ 和 tests/

- 位置：`vitest.config.ts:11`（`include: ['src/**/*.ts']`）。
- 现象：覆盖率统计只算 `src/`，`scripts/` 和 `tests/` 不计入；`scan_tracked_tree.mjs` 这类带复杂正则的安全关键脚本无覆盖率指标。
- 影响：无法观测关键脚本测试覆盖。
- 建议：按需在 coverage include 增加 `scripts/**/*.mjs`（若计划补测试），或显式记录该决策。
- 置信度：高。
- 优先级：低（覆盖范围选择属于项目策略，非缺陷）。

### L2. scan_tracked_tree.mjs forbidden_paths 与 .gitignore 对 store/ 缺失

- 位置：`scripts/scan_tracked_tree.mjs:13-22`；`.gitignore`（未列 `store/`）。
- 现象：`capture_store_screenshots.mjs:9` 输出 PNG 到 `store/screenshots/`，既不在 `.gitignore`，也不在 scanner 的 `forbidden_paths`；scanner 因 `skipped_binary_extensions` 含 `.png` 不会扫内容，但若开发者 `git add store/` 不会被 scanner 拦截。
- 影响：潜在的二进制图片入库；与 `.gitignore` 对 `artifacts/`、`data/` 的严格策略不对称。
- 建议：`.gitignore` 增加 `store/`（或 scanner `forbidden_paths` 增加 `'store/'`，取决于策略）。
- 置信度：中。
- 优先级：低。

### L3. copy_locales.mjs 使用 console.log，违反全局「日志优先、禁止 console.log 调试输出」约定的边界模糊

- 位置：`scripts/copy_locales.mjs:18`（`console.log(...)`）。
- 现象：CLAUDE.md 全局约定「日志优先，禁止 print / console.log 调试输出」。`copy_locales.mjs` 用 `console.log` 输出成功消息；同批 `capture_store_screenshots.mjs`（`process.stdout.write`）和 `generate_icons.mjs`（`console.log/error`）混用。
- 影响：脚本输出风格不统一；但脚本是独立构建工具，不是 src/ 内运行时代码，约定是否适用本就模糊。
- 建议：三脚本统一用 `process.stdout.write`（或保留 console 但约定脚本不在此规则内），属风格一致性问题。
- 置信度：中。
- 优先级：低。

### L4. playwright.config.ts e2e-t0001/e2e-t0003 配置块重复

- 位置：`playwright.config.ts:58-70`（e2e-t0001）、`playwright.config.ts:71-83`（e2e-t0003）。
- 现象：两个 project 块除 `testDir` 与 `name` 外完全相同（fullyParallel/workers/retries/launchOptions.args 一致）。
- 影响：可维护性（修改 launchOptions 要同步两处）；但显式列出便于阅读。
- 建议：保持现状或抽 `make_t_project(testDir)` 工厂；按 KISS 不建议改。
- 置信度：高。
- 优先级：低。

## 改进建议（综合）

1. **CLAUDE.md 命令小节同步**：补 `e2e-t0001`、`e2e-t0003` 两个 project，并补 `test:e2e:server`、`copy:locales`、`scan:tracked-tree` 等已在 package.json 注册但未在 CLAUDE.md 列出的脚本条目；或显式声明 CLAUDE.md 只列「主流程」脚本，剩余参 package.json。
2. **`capture_store_screenshots.mjs` 文档化**：在 `docs/guides/store_publish_list.md` 新增「截图生成」小节，说明前置（`npm run build` 已完成、`npm run test:e2e:server` 已启动）和运行命令；package.json 增加 `store:screenshots` 入口。
3. **tsconfig.json 清理**：删除无效的 `outDir`（`noEmit: true` 下冗余）。
4. **`store/` 路径策略**：`.gitignore` 或 scanner 统一纳入，避免截图产物误入库。

## 不确定项

1. **`launchPersistentContext('')` 的 userDataDir 行为**：从 Playwright 公开行为看空字符串会被当作相对路径在 cwd 创建目录；但未在本机实测，不能 100% 断言会污染 cwd。建议运行一次后检查仓库根是否多出临时目录验证。
2. **`generate_icons.mjs` / `outline_svg_text.py` 外部依赖**：依赖系统级 `rsvg-convert`、`python3 -m fontTools`、特定路径下的 Noto 字体（`/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf`、`/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc`）。脚本第 24-25 行硬编码绝对字体路径，非 Linux/未装字体环境会失败；但属开发者本地工具，CI 是否需要跑此脚本未见 workflow 引用，影响范围有限。
3. **vite.config.ts `__BUILD_TIME__` 用 UTC+8**：`new Date(new Date().getTime() + 8 * 3600 * 1000).toISOString()` 写法对运行环境时区无依赖（先加偏移再 toISOString），符合「UTC+8 除非另有说明」约定；但若开发者机器本身已是 UTC+8，会产生双倍偏移。需查 `__BUILD_TIME__` 在代码中如何使用才能判断是否有副作用（不在本批次范围）。
4. **icon.svg 颜色 vs promo SVG 颜色**：`icon.svg:6` 使用 `#0072f0`，promo SVG（已 outline 后的产物）第 18 行同步；颜色一致。仅说明已核对，无误。
