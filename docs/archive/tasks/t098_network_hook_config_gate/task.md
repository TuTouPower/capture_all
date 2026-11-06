# Task spec

## 背景

`content_script.start_capture` 无条件 `start_network_hook`，无视 `capture_network` / body 相关配置。即使用户关闭网络采集，页面 hook 仍可能产生事件。P0-7 verified。

## 契约区

### 范围

- content 启动时仅当配置允许网络相关采集时才 start network_hook。
- 配置关闭时不注入或立即停用 hook，且不向 SW 发送 network_hook 类事件。
- 单测覆盖开关开/关。

### 非范围

- 不改 background CDP/webRequest 网络采集门控。
- 不实现运行中热切换全部模块（若现有无热更新，仅 start 时门控即可；若已有 config 更新路径则一并尊重）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：`capture_network === false` 时 start 后，content 不安装 page network hook（或 hook 不转发事件到 SW）。
- [ ] AC-002：`capture_network === true` 时 start 后，合法 fetch/XHR hook 事件仍可转发（回归）。
- [ ] AC-003：当产品配置将 body 采集关闭且 hook 仅服务于 body 时，行为与配置一致：不采集 response body 字段或不安装 body 相关 hook（若 hook 仅作网络元数据且 capture_network true，允许元数据；须在实现中与 DEFAULT/类型语义一致并在测试断言写明）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P0-7；src_ext_content/review.md B1

### 有意不测

- 与 CDP 双路同时入库的去重策略：本 task 只做门控，不去重算法。

### 测试策略

- mock start_network_hook 是否调用；或查 listener 是否注册。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：AC-003 语义依赖产品对 hook 职责定义；执行期以 CaptureConfig 字段为准并在测试写死期望。
- 回退：恢复无条件 start_network_hook。

### 依赖与约束

- 可与 t097 冲突同文件，调度时串行。

### Finalization 时更新的 blueprint

- 无
