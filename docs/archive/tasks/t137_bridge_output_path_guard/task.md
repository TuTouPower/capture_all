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

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

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

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001: 新增路径穿越用例（/etc/...、../）
- AC-005: 伪造 Origin + 既有 instance_id 顶替失败用例
- AC-007: 合法重 enroll 用例
- AC-002/003/004/006/008: 正常路径与既有测试

## 上下文区

- 来源：intensive-review review_20260812_1249（intensive-review 合并：H-1 output_path 任意写 + H-2 伪造 origin 顶替实例）

### 有意不测

- 无

### 测试策略

- 按项目默认（tests/unit mock Chrome API；fixture 用构造数据）

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 结论（s003 spike 核实，2026-08-12）：扩展 instance_id 为 chrome.storage 会话持久化 uuid，重启不换；重 enroll 以「首次登记该 instance_id 的 Origin 扩展 ID」为绑定信号——同扩展重启用同 Origin 扩展 ID 放行，伪造 origin 顶替因扩展 ID 不匹配被拒。验证方式：单测（伪造 Origin 不同扩展 ID → 拒绝；同扩展 ID → 允许）。

### 风险与回退

- 风险：行为变更影响既有路径
- 回退：本 task 为独立 commit，可整体 revert

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- docs/blueprint/domain.md：enroll 顶替与导出路径条目按实现结论更新
