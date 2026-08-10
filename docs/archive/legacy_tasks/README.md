# 编号回收的历史任务

旧 TNNN 编号体系存在编号复用（归档后重新分配）。`task.py` 要求 tid 全局唯一，复用编号的孤儿目录无法在 `docs/archive/tasks/` 中表示，移入本目录保留。

| 目录 | 说明 |
|------|------|
| `t008_phase5_finalize/` | 早期重构 T008（refactor_plan Phase 5 finalize，2026-07 归档，commit 0cfc760/901aa39）；编号后被重新分配给 browser_label routing 任务 |
