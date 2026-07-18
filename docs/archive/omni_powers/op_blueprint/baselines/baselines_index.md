# baselines 索引

> 基准文件索引：功能名 → 验收标准→ 文件 + 更新说明。
> 验收标准的文字定义在 spec（`op_execution/specs/{TID}_{slug}.md` 的「验收场景」段，功能名 = task spec frontmatter `feature_key`，闸门 A 阶段定，D10），本文件**只索引基准快照文件**，不存 spec 内容。
> baselines 按功能名存（与 `specs/{feature}.md` 同键，1:1 零桥接）；TID 永不复用（op_execution 层）。

<!-- 每个功能一个 section，按验收标准列基准文件 -->

## {功能名}（{YYYY-MM-DD HH:mm:ss UTC+8}）

| 文件 | 对应验收标准 | 类型 | 说明 |
|---|---|---|---|
| {功能名}/AC-N_desc.dom.html | AC-N | DOM/advisory | {flaky，D7：CSS/组件重组触发不匹配，不机械阻断} |
| {功能名}/AC-N_desc.txt | AC-N | 结构化 | {stdout/CLI 原文} |
| {功能名}/AC-N_desc.png | AC-N | 视觉 | {截图锚点，advisory} |

<!--
类型语义：
- 结构化信号（stdout/API 响应体/DB 查询/进程日志；**DOM/a11y 降 advisory，D7**）→ 进机械硬门，夜跑回归判定以此为准
- 视觉锚点（截图）→ advisory，重验时 evaluator 多模态对照，不机械阻断
新增/更新/删除走 closer per-task 提案 + leader 自审（A18）。
-->
