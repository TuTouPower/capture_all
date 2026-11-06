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

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：导出触发前调用 flush（或等价等待缓冲落盘）后，导出内容包含 flush 前仅在缓冲中的事件（通过 mock buffer + flush 可观测）。
- [ ] AC-002：`export_save_as===true` 时，触发下载的 API 参数 `saveAs===true`（或等价）。
- [ ] AC-003：`export_save_as===false` 时，下载参数不强制 saveAs true。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试（mock chrome.downloads / flush）。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P1-10；src_ext_ui_shared/review.md F002 F005

### 有意不测

- 真实系统文件选择器 UI：有意不测。

### 测试策略

- mock downloads.download 与 storage flush。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：flush 失败时导出应失败或明确部分导出，不可静默旧快照冒充完整——执行期选可测策略。
- 回退：恢复不 flush / 不读 saveAs。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
