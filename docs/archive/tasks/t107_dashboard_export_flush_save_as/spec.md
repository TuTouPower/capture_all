# Task spec

## 背景

Dashboard ZIP 导出未先 flush，缓冲数据可丢；`export_save_as` 已存但不被 download 路径读取。P1-10。

## 契约区

### 范围

- 导出（含 ZIP/归档）前 flush 相关 storage 缓冲。
- `export_save_as` 为 true 时下载走「另存为」可选路径（Chrome downloads.saveAs）；false 时不强制另存为。
- 单测或对 download API 参数断言。

### 非范围

- 不改导出格式集合。
- 不改 archive 去重（t109）。

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

- [ ] AC-001：导出触发前调用 flush（或等价等待缓冲落盘）后，导出内容包含 flush 前仅在缓冲中的事件（通过 mock buffer + flush 可观测）。
- [ ] AC-002：`export_save_as===true` 时，触发下载的 API 参数 `saveAs===true`（或等价）。
- [ ] AC-003：`export_save_as===false` 时，下载参数不强制 saveAs true。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试（mock chrome.downloads / flush）。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P1-10；src_ext_ui_shared/review.md F002 F005

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 真实系统文件选择器 UI：有意不测。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- mock downloads.download 与 storage flush。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无

### 风险与回退

- 风险：flush 失败时导出应失败或明确部分导出，不可静默旧快照冒充完整——执行期选可测策略。
- 回退：恢复不 flush / 不读 saveAs。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
