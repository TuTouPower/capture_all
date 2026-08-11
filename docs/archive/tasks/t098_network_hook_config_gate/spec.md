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
只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。
<!-- /规范 -->

- [ ] AC-001：`capture_network === false` 时 start 后，content 不安装 page network hook（或 hook 不转发事件到 SW）。
- [ ] AC-002：`capture_network === true` 时 start 后，合法 fetch/XHR hook 事件仍可转发（回归）。
- [ ] AC-003：当产品配置将 body 采集关闭且 hook 仅服务于 body 时，行为与配置一致：不采集 response body 字段或不安装 body 相关 hook（若 hook 仅作网络元数据且 capture_network true，允许元数据；须在实现中与 DEFAULT/类型语义一致并在测试断言写明）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P0-7；src_ext_content/review.md B1

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 与 CDP 双路同时入库的去重策略：本 task 只做门控，不去重算法。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- mock start_network_hook 是否调用；或查 listener 是否注册。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无

### 风险与回退

- 风险：AC-003 语义依赖产品对 hook 职责定义；执行期以 CaptureConfig 字段为准并在测试写死期望。
- 回退：恢复无条件 start_network_hook。

### 依赖与约束

- 可与 t097 冲突同文件，调度时串行。

### Finalization 时更新的 blueprint

- 无
