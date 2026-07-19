# 审阅意见评估与修复计划

- 评估日期：2026-07-19
- 评估范围：`docs/review_20260719_0859/` 全部 current.md + sonnet.md（src_extension_05 无 current）
- 总 finding 数：约 80 条
- 决策：全部合理项纳入修复，大重构项独立 task；修复前必读源码验证

## 评估方法

- 文档类 finding：核对引用文件是否存在、版本号、token 策略等具体声明
- 代码类 finding：读对应源码片段确认现象，不轻信报告结论
- 抽样已验证：`.claude/settings.json` token argv、keyboard shortcuts 脱敏、storage_capture tab_id、scan_tracked_tree archive、command_queue next_id、handle_cdp_events slice、captures 页 `#capSearch` 缺绑定、exports 页无 wiring

## 不接受修复（误报或低价值）

- `src_extension_05/HIGH-4`：报告自身已写"实际正确"，network_hook tab_id 经 content_script 模块变量正确传播，降为 info
- `src_extension_04/MEDIUM-14`：v1 旧 store 兼容未承诺，按设计放弃
- `project_02/LOW-7`：outline_svg_text.py 工具脚本，影响小，作为 LOW 单独修或不修

## 需产品决策、本轮默认路径

| Finding | 默认决策 | 理由 |
|---|---|---|
| `src_extension_02/HIGH-6` Cookie 全浏览器 | 限定到目标 tab domain | 最小采集原则；若产品要全局采集需 UI 单独授权 |
| `src_extension_02/HIGH-10` 外部 Bridge URL allowlist | 仅允许 `http://127.0.0.1` | Bridge 硬约束"仅本机" |
| `src_extension_06/HIGH-3` WebSocket 伪造 | 加 per-page nonce + 严格 schema | 不改注入机制（保留 inline script） |
| `src_bridge_mcp_shared_02/HIGH-2` 错误码术语迁移 | 保留旧码 + 加新码别名 | breaking change 风险，渐进迁移 |
| `docs_01/HIGH-01/02/03` T008 状态 | 补 log/review/adoption 后归档 | 残留测试 T073 处理 |
| `docs_01/HIGH-07` Edge 商店披露 | 删除绝对"不采集"声明 | 让披露与 PRIVACY.md 一致 |
| `docs_02` task spec 模板 | 同步增强 Capture All 与 repo_template | 单一真相源 |

## task 拆分原则

- 同一子系统/同类问题合并为一个 task
- 大重构（SW 状态机、CDP 复合键、导出分页、错误码迁移）独立 task
- 每个 task 一个 commit
- 完整生命周期（spec+plan+log+归档）

## task 清单（按优先级）

详见 `docs/tasks/index.md`。共 ~50 个 task，分 6 批：

1. **P0 安全/隐私**：T011-T017
2. **P0 正确性**：T018-T027
3. **P1 SW 状态机重构**：T028-T034
4. **P1 存储/事务/导出/Agent bridge**：T035-T053
5. **P1 文档**：T054-T066
6. **P1 CI/Tooling/Templates**：T067-T081
