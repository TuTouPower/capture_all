# Task spec

## 背景

`render_review_prompts --out-dir` 无仓库 containment 校验，可写仓库外路径；`view --serve` 非 loopback 绑定仅打印警告，暴露 task 文档。两者均属工具链输出/监听边界缺陷。

## 契约区

### 范围

- `render_review_prompts --out-dir` 校验目标路径位于仓库内（或显式允许列表），拒绝仓库外写入。
- `view --serve` 非 loopback 绑定默认拒绝或要求显式危险参数，而非仅打印警告继续。

### 非范围

- 不改变 `view --serve` 的功能实现本身。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：`render_review_prompts --out-dir /tmp/outside` 被拒绝且不写入仓库外。
- [ ] AC-002：`render_review_prompts --out-dir` 使用仓库内合法路径时正常写入。
- [ ] AC-003：`view --serve --host 0.0.0.0` 默认被拒绝或要求显式危险参数确认。
- [ ] AC-004：`view --serve` 使用 loopback host 正常启动。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：用临时目录与参数化调用断言写入位置/拒绝。

## 上下文区

- 来源：RT-012、RT-013（2026-08-13 核实）。

### 有意不测

- 无。

### 测试策略

- 用真实路径解析与参数化调用；断言无仓库外写入、非 loopback 拒绝。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：合法工作流依赖仓库外输出被阻断。
- 回退：提供显式 `--allow-outside` 覆盖，默认拒绝。

### 依赖与约束

- 无。

### Finalization 时更新的 blueprint

- 无。
