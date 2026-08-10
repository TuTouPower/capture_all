# Spec — Agent 命令结果生命周期投递

Agent 命令一旦 dispatch 产生结果，须向 Bridge 投递（成功或失败），不因后续 capture lifecycle/generation 失效静默丢弃。

## 语义

- `poll_cycle` 中 `dispatch_agent_command` 返回 result 后，无条件调用 `send_result_with_retry` 投递一次（移除 dispatch 后 `is_active_lifecycle` 守卫）。
- lifecycle 失效（stop/restart）不阻断已产生结果的投递；投递 API 幂等/忽略已关闭 command_id。
- 投递异常捕获记录（`result_delivery`），stop 后投递异常静默（lifecycle 已失效不 log），不抛未捕获中断轮询。

## 相关实现

- `src/extension/background/agent_bridge_client.ts`：`poll_cycle` dispatch 后无条件投递
- `tests/unit/agent_bridge_client.test.ts`：T102 describe（create_deferred 挂起 dispatch + lifecycle 失效后仍投递）
