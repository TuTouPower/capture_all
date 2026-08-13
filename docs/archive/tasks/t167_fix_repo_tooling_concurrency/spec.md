# Task spec

## 背景

工具链存在多处并发与原子性缺陷：task ID 取号（`cmd_add`）无锁，并发 `add` 撞号；派生 index 直接 `write_text` 非原子，崩溃/并发可落盘损坏 JSON；`edit` 多文件反向边更新非原子，中途崩溃留半同步冲突边；pending 批量迁移（archive/park/revive）无锁非原子；原生 Windows 上 `_id_scan.id_lock` 打开空锁文件后 `msvcrt.locking(1)` 失败。

## 契约区

### 范围

- task ID 取号复用 `_id_scan.id_lock`（或独立 `task_id.lock`）覆盖「取号 + 建目录」，或 `mkdir` O_EXCL 原子占位 + 冲突重试。
- `rebuild_index` 与 `goal_queue.json` 改为临时文件 + `os.replace` 原子替换，commit 前校验 JSON 可解析。
- `edit` 反向边更新先在内存完成全部 front matter，再一次性顺序落盘（owner 最后），对每个写盘用临时文件 + rename。
- pending 批量迁移整体持 `id_lock`，`move_entry` 目标不存在则 `os.replace`/`git mv` 幂等重试。
- `id_lock` 照抄 `ledger._with_lock` 的空锁文件写 1 字节处理。

### 非范围

- 不改变各命令的对外语义与返回格式。
- 不重构调度图展开逻辑。

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

- [ ] AC-001：并发 `task.py add` 产生唯一 tid，不出现重复 tid 目录。
- [ ] AC-002：`rebuild_index` 与 `goal_queue.json` 写入使用原子替换，模拟中途崩溃后 JSON 不损坏或可恢复。
- [ ] AC-003：`edit` 反向边更新任一写盘中途失败，不产生单边残留冲突（可幂等重跑恢复）。
- [ ] AC-004：pending 批量迁移整体持锁，并发 `new` 与 `archive` 不产生「同号多处」歧义。
- [ ] AC-005：`id_lock` 在空锁文件上先写 1 字节再锁，原生 Windows 语义可用（用 msvcrt 模拟或静态断言实现一致）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- AC-005 `[deploy]`：需原生 Windows 环境验证；其余 AC 可用 ProcessPoolExecutor 并发 + 中断注入自测。

## 上下文区

- 来源：RT-007、RT-008、RT-009、RT-010、RT-011（2026-08-13 核实，`ea0ff5c` 引入）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 复用 `test_pending.py` 的 ProcessPoolExecutor 并发模式；原子写用故障注入（写盘中途异常）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- Windows `msvcrt.locking` 空文件行为：`UNVERIFIED-SPIKE`，执行期以文档/最小复现确认，实现按 `ledger` 既有注释对齐。

### 风险与回退

- 风险：加锁后多会话并发取号死锁。
- 回退：锁短持有 + O_EXCL 占位冲突重试作为备选。

### 依赖与约束

- 复用 `ledger._with_lock` 与 `_id_scan.id_lock` 模式。

### Finalization 时更新的 blueprint

- `docs/blueprint/conventions.md`：如补并发保证条目，同步原子写与锁约定。
