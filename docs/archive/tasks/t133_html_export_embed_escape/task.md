# Task spec

## 背景

escape_for_html_embed 只转义 </script><>&，JS 字符串定界符 ' 与控制符 \n/\t 未转义。捕获数据含撇号或换行时 HTML 导出 JSON.parse 抛 SyntaxError，导出功能不可用。

## 契约区

### 范围

- 修复 review finding：review C1 (B2-C1): escape_for_html_embed 漏 ' 与 \n，JSON.parse 嵌入被击穿；exporter.test 只断言 toContain 不回灌

### 非范围

- 不在本 task 处理的相关联问题（若有，见上下文区来源）

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001: 含单引号的数据导出 HTML 后，产物中 JSON.parse 可成功解析且数据完整
- [ ] AC-002: 含换行/制表（错误堆栈、console 多行、请求体）的数据导出 HTML 可成功解析
- [ ] AC-003: 含 </script> 注入尝试保持被转义（既有安全语义不回退）
- [ ] AC-004: exporter.test 新增回灌用例：对生成的 HTML 提取内嵌 JSON 并断言可 parse 且与源数据一致

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001/002/004: 新增回灌测试（含撇号+多行 fixture）
- AC-003: 既有 escape/导出测试保持通过

## 上下文区

- 来源：intensive-review review_20260812_1249（review C1 (B2-C1): escape_for_html_embed 漏 ' 与 \n，JSON.parse 嵌入被击穿；exporter.test 只断言 toContain 不回灌）

### 有意不测

- 无

### 测试策略

- 按项目默认（tests/unit mock Chrome API；fixture 用构造数据）

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：行为变更影响既有路径
- 回退：本 task 为独立 commit，可整体 revert

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- docs/blueprint/domain.md：HTML 导出转义条目若补充定界符说明可更新
