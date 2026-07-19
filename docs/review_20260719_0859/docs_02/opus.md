# docs_02 审阅 — opus

## 模型依据

审阅模型：opus（用户授权多模型审阅）。
审阅对象：`docs_02` 批次，仅 1 文件 21 行 —— `docs/templates/task/spec.md`。
审阅方式：只读。对照物：同目录 `plan.md` / `log.md` 模板、真实 task 样本 `docs/tasks/T008_label_routing/spec.md`、`CLAUDE.md` 第 12/45/57/58/70-72 行对 spec 角色的定义、`docs/blueprint/domain.md` 与 `conventions.md` 的术语与文档风格约束。

## 范围

- 文件：`docs/templates/task/spec.md`
- 行数：21
- 用途：所有新 task 复制的 spec 模板（`CLAUDE.md:57` 要求从 `docs/templates/task/` 复制）。
- 间接影响面：每个 active task 都基于此模板。模板缺陷会传染所有后续 task。

## 高优先级

### H1 — 模板缺少"决策"小节，但项目实际 task 普遍需要它

- 位置：`docs/templates/task/spec.md` 全文，对比 `docs/tasks/T008_label_routing/spec.md:9-14`。
- 现象：模板只有 `背景 / 范围 / 非范围 / 验收标准 / 依赖与约束` 五节；T008 实际 spec 在 `背景` 与 `范围` 之间额外写了 `## 决策（用户确认）` 一节，记录条件强制、label 唯一性、MCP 路由参数等用户已拍板项。
- 影响：`CLAUDE.md:45` 规定 "spec 和 plan 先行，一起写完交用户一次性审核"。审核会产生决策，决策无处可放，作者被迫自行加节或塞进 `背景`，导致 spec 结构漂移、reviewer 对照无固定锚点。
- 建议：在 `背景` 与 `范围` 之间加 `## 决策（用户确认）` 占位节，注释为 `{用户已拍板的关键决策；无则写"无"。}`。
- 置信度：高。
- 级别：高。

### H2 — "验收标准"未约束可测试性与黑盒命令，与开发循环脱节

- 位置：`docs/templates/task/spec.md:15-17`。
- 现象：模板写 `{可独立验证的完成条件。}`。但 `CLAUDE.md:68` 要求 "agent-verify 黑盒验证：运行项目黑盒测试命令（npm test、npm run build、必要时的 npm run test:e2e）"，`CLAUDE.md:72` 测试 agent 要 "核对测试覆盖与端到端行为是否对应 spec 验收标准"。T008 实际 spec 的验收标准（`spec.md:48-57`）就显式包含 `npx tsc --noEmit / npm test / npm run build` 三项黑盒命令。
- 影响：模板不引导作者写可自动化验证的标准，reviewer 拿不到可执行的核对清单；"可独立验证"语义模糊，会被写成 "功能正常" 这类不可验证的描述。
- 建议：把占位文改为 `{每条须可独立验证；优先用具体命令（grep / npm test / npm run build / 具体 E2E 用例）或可观测行为。}`，并在示例中保留一条 `- [ ] npm test 全绿` / `- [ ] npm run build 全绿` 作为默认基线。
- 置信度：高。
- 级别：高。

## 中低优先级

### M1 — "范围"未提示按代码/测试/文档分块

- 位置：`docs/templates/task/spec.md:7-9`。
- 现象：占位为 `{本 task 包含什么。}`，单行提示。T008 实际 spec 把范围按 `**代码** / **测试**` 两块组织（`spec.md:17-38`），可读性显著高于扁平列表。
- 影响：作者随手写一段散文，reviewer 与 plan 对照时需要重新解析。
- 建议：把占位改为提示分块：`{按 代码 / 测试 / 文档 分块列出；无则写"无"。}`。
- 置信度：中。
- 级别：中。

### M2 — "依赖与约束"与 blueprint 词汇未对齐

- 位置：`docs/templates/task/spec.md:19-21`。
- 现象：占位写 "前置依赖、平台、安全或兼容性约束"。`CLAUDE.md` "硬约束" 段落列出多项强不变量（Bridge 仅绑 127.0.0.1、token 优先级、instance_token 不冒充 MCP、IndexedDB v3、术语 capture/session 禁用、生成物放 artifacts/ 等），这些正是 spec 该显式声明遵守的约束。
- 影响：作者容易遗漏硬约束声明，task 实施时无意违反；reviewer 也无固定项核对。
- 建议：占位补一句提示 `{前置依赖、平台、安全或兼容性约束；涉及 Bridge/MCP/存储/术语等硬约束时显式引用 CLAUDE.md "硬约束" 或 blueprint 对应文件。无则写"无"。}`。
- 置信度：中。
- 级别：中。

### L1 — 验收标准默认条目缺失

- 位置：`docs/templates/task/spec.md:17`。
- 现象：仅一行 `- [ ] {可独立验证的完成条件。}`，无默认基线条目。
- 影响：每个 task 都要手动重写 tsc/test/build 三条；易遗漏。
- 建议：模板默认列出三条基线（已与 H2 合并，可二选一实施）。
- 置信度：中。
- 级别：低。

### L2 — 模板无 task ID / slug 占位

- 位置：`docs/templates/task/spec.md:1`，对比 T008 标题 `# Task spec — T008 label_routing`。
- 现象：标题仅 `# Task spec`，无 ID/slug 占位。
- 影响：轻微。作者需手动拼，易遗漏或格式不一致。
- 建议：标题改为 `# Task spec — TNNN slug`。
- 置信度：高。
- 级别：低。

### L3 — "非范围"占位偏简，未引导显式排除

- 位置：`docs/templates/task/spec.md:11-13`。
- 现象：`{明确不做什么。}`。T008 实际 "非范围"（`spec.md:40-44`）列出了三项显式排除的近邻工作。
- 影响：非范围写得太薄时，reviewer 与 owner 对"是否做了额外事"判断不一致。
- 建议：占位补 `{明确不做什么；列近邻但本次不动的功能，避免 scope creep。无则写"无"。}`。
- 置信度：中。
- 级别：低。

## 建议

优先级从高到低，建议实施顺序：

1. **H1 + H2 一起改**：加 `决策（用户确认）` 节；重写 `验收标准` 占位并加默认基线三条。这两条直接影响 spec 作为开发循环与 review 锚点的可用性。
2. **M1 + M2**：`范围` 改分块提示；`依赖与约束` 提示引用硬约束。
3. **L2**：标题加 `TNNN slug`。
4. **L1 + L3**：与 H2 合并 / 补足 `非范围` 提示。

参考实施版（仅示意，最终由 owner 决定）：

```markdown
# Task spec — TNNN slug

## 背景

{为什么需要此变更。}

## 决策（用户确认）

{用户已拍板的关键决策；无则写"无"。}

## 范围

- 代码：{...}
- 测试：{...}
- 文档：{...}

## 非范围

{明确不做什么；列近邻但本次不动的功能。无则写"无"。}

## 验收标准

- [ ] {可独立验证的完成条件，优先用具体命令或可观测行为。}
- [ ] `npx tsc --noEmit` 无错
- [ ] `npm test` 全绿
- [ ] `npm run build` 全绿

## 依赖与约束

{前置依赖、平台、安全或兼容性约束；涉及 Bridge/MCP/存储/术语等硬约束时显式引用 CLAUDE.md "硬约束" 或 blueprint 对应文件。无则写"无"。}
```

## 不确定项

- 是否要在模板里固化 `决策（用户确认）` 节，取决于项目是否承认"用户审核产出决策"是 spec 的稳定组成部分。当前仅凭 T008 单例推断；建议 owner 抽样另外 1-2 个历史 task（归档区 `docs/archive/tasks/`）确认普遍性后再落地。置信度：中。
- `验收标准` 默认基线是否固化进模板，还是仅在占位文提示，存在风格偏好分歧；固化可减少遗漏但降低了模板的通用性。置信度：中。
- 模板属于 `docs/templates/`，按 `CLAUDE.md` 目录约定 "复制使用，不代表 active 数据"。修改模板本身不触发 blueprint 更新，但建议在 `docs/blueprint/conventions.md` 的 task 文档风格段（若存在）同步注明，避免模板与约定描述分离。未读 `conventions.md` 全文，置信度：中。
