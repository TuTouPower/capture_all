# Task spec

## 背景

bridge 本地攻击面两缺口：/mcp/command explicit_path 分支直接 writeFile 任意路径绕过净化；enroll 仅校验 Origin 形状，本地进程伪造 chrome-extension origin 用真实 instance_id 重 enroll 顶替 token_hash 劫持命令通道。

## 契约区

### 范围

- 修复 review finding：intensive-review 合并：H-1 output_path 任意写 + H-2 伪造 origin 顶替实例

### 非范围

- 不在本 task 处理的相关联问题（若有，见上下文区来源）

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

- [ ] AC-001: output_path 为绝对路径或含 .. 穿越导出目录时返回错误（INVALID_QUERY 或等价），不写文件
- [ ] AC-002: 导出目录内的相对路径正常工作
- [ ] AC-003: 自动路径（无 output_path）行为不变
- [ ] AC-004: 既有导出流程测试不回退
- [ ] AC-005: 对已存在 instance_id 的 enroll，无旧实例凭证/扩展绑定证据时拒绝顶替（返回错误码），既有实例 token 不失效
- [ ] AC-006: 首次 enroll（新 instance_id）零配置流程不变
- [ ] AC-007: 合法场景（同一扩展重启后同 instance_id 重 enroll）不被误伤——可验证为同一扩展
- [ ] AC-008: label 冲突顶替路径同样防护

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- AC-001: 新增路径穿越用例（/etc/...、../）
- AC-005: 伪造 Origin + 既有 instance_id 顶替失败用例
- AC-007: 合法重 enroll 用例
- AC-002/003/004/006/008: 正常路径与既有测试

## 上下文区

- 来源：intensive-review review_20260812_1249（intensive-review 合并：H-1 output_path 任意写 + H-2 伪造 origin 顶替实例）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 按项目默认（tests/unit mock Chrome API；fixture 用构造数据）

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- UNVERIFIED-SPIKE: 合法重启重 enroll 与攻击顶替的可区分信号（Origin 扩展 ID 绑定 vs 旧 token 出示）——task-work Step 1 实验/设计后定

### 风险与回退

- 风险：行为变更影响既有路径
- 回退：本 task 为独立 commit，可整体 revert

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- docs/blueprint/domain.md：enroll 顶替与导出路径条目按实现结论更新
