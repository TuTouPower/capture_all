# Leader Checkpoint

## 断点

### current_task

T0003
### last_completed

T0002

### next_step

T0003（feat: 移除 Webhook/Issue 卡片 + MCP 侧边栏入口，无依赖可直接开跑）

## 关键上下文

- T0001（缩放滑块）+ T0002（标记点击）已完成并落地 main（commit 54d3250），E2E 4/4 PASS
- T0003 未开始，spec 在 op_execution/specs/T0003_remove-integrations-sidebar.md
- 历史：T0001/T0002 曾困在 op-dev/op-eval worktree 零 commit，已规整落地 + 清理残留 worktree/分支
