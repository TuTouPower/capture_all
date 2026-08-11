# Task spec

## 背景

全局设置「每次询问保存位置」在当前浏览器 UI 导出入口中消费不一致：Popup ZIP 与 Dashboard 运行日志漏传 `export_save_as`，共享导出 helper 又在无目录且 picker 可用时忽略显式 `save_as=false`。用户配置开关无法可靠控制是否弹出保存位置选择；Dashboard archive/非 archive 的 flush 与参数接线也缺少覆盖。

## 契约区

### 范围

- 修复 Popup ZIP、Dashboard 运行日志与共享 `download_blob` picker 分支对 `export_save_as` 的消费。
- 统一 `save_as=true/false/undefined` 与导出目录、picker 能力组合下的行为。
- 补 Dashboard archive/非 archive 导出的 flush、顺序与 save_as 接线测试（合并 p021）。

### 非范围

- 不新增 Popup 导出前 flush；分析已确认 Popup 经 `get_capture_data` 成功路径先执行 `flush_all`，该候选不成立。
- 不改变 SW 内容导出或 Bridge 服务端文件导出的输出契约；二者不消费浏览器 UI 的保存位置开关。
- 不做 Dashboard 导出防重入/busy 标记；该项保留在 p027。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->
只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。
<!-- /规范 -->

- [ ] AC-001：Popup ZIP 导出按 `user_config.export_save_as` 向共享下载 helper 传入 `save_as`；开关为 true 时询问保存位置，为 false 时不强制询问。
- [ ] AC-002：Dashboard 运行日志导出按 `get_user_config().export_save_as` 传入 `save_as`，与 Popup 及 Dashboard capture 行为一致。
- [ ] AC-003：共享下载 helper 在显式 `save_as=false` 且文件名无目录、picker 可用时调用 downloads API，不打开保存位置 picker；显式 `save_as=true` 时优先询问保存位置。
- [ ] AC-004：Dashboard capture 的 archive 与非 archive 导出都在读取数据前完成 flush，且按配置的 `export_save_as` 传入 helper；flush 失败时中止导出。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- AC-001：全部 AC 可自动测试。

## 上下文区

- 来源：p020 + p021（2026-08-11 重新完整分析；确认 `export_save_as` 消费产品缺陷，3 个已确认缺陷位点；Popup 不 flush 候选已证伪；p021 的 Dashboard 接线测试缺口并入本 task；复现线索 `.scratch/p020_popup_export_saveas_flush_repro.test.ts`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- helper 单测覆盖 `save_as=true/false/undefined × 有/无目录 × picker 有/无`，断言 picker 调用与 downloads `saveAs`。
- Popup、Dashboard capture、Dashboard 日志调用点做行为测试，断言配置值传播；Dashboard archive/非 archive 补 flush 先于导出与 flush 失败 abort。浏览器级 picker 差异若自动化不稳定，可保留调用点行为测试为主门禁。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无

### 风险与回退

- 风险：统一 picker/downloads 分支会改变用户保存位置交互；测试若固化旧行为可能误判修复。
- 回退：恢复共享 helper 与调用点参数传递；浏览器下载配置不被本 task 修改。

### 依赖与约束

- 遵循现有用户配置持久化与浏览器下载/picker 能力差异；无外部服务依赖。

### Finalization 时更新的 blueprint

- `docs/specs/dashboard_export_flush_save_as.md`：统一 Popup/Dashboard/log/helper 对 `export_save_as` 的消费语义。
