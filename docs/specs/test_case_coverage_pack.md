# spec: test_case_coverage_pack

## 背景

历史评审与收尾遗留的测试补强项（均 minor，多为「加 case」级覆盖缺口），打包为单 task 补齐。不修改生产行为，仅补测试覆盖；`src/` 仅允许必要的测试钩子导出。

## 验收标准

- AC-001：user_config poll 区间校验测试显式覆盖 `NaN`、`Infinity`、精确下边界 250。
- AC-002：exception sink 测试断言「emit exception 后 console store 无任何事件」（`logs.length === 0`）。
- AC-003：exception sink 测试不再访问未声明字段，收敛到已声明字段。
- AC-004：exception sink 测试套件 `beforeEach` 调用 `mock_chrome_debugger.reset()`。
- AC-005：external poll 补「首轮 poll 已 in-flight 时重入」变体测试：旧闭包 resolve 不写、新 poll 单路。
- AC-006：auto export format 测试补 `har` 合法 format、17 字符非法 format、大写归一样例。
- AC-007：nonce 测试补真实 `crypto.randomUUID()` 两次 start 生成不同 nonce 的用例。
- AC-008：nonce 测试直接驱动 `update_page_nonce` 生产写路径，验证 start 后页面 window 变量被写入。
- AC-009：nonce HTTP 负向测试补正向断言证明 fallback nonce 非空。
- AC-010：网络门控静态测试断言 `start_network_hook` 在 `start_capture` 内恰好出现一次。
- AC-011：cleanup 与 start 的 `run_exclusive` 串行时序补直接测试（挂起 cleanup 的 storage.get → start 排队 → resolve 后键保留）。
- AC-012：详情搜索过滤语义补直接测试（输入后可见列表仅含匹配项）。
- AC-013：存储限额测试补三条分句断言：delete 被拒后 capture 记录仍在存储；cleanup_stale 终态化 `ended_at` 非空；限额停止 `capture_stopped.reason === 'storage_limit'`。
- AC-014：ws `absolute_time` 接线守卫表达式加直连断言锁定（`start_time_ms > 0` 时不被 started_at+relative 覆盖）。

## 可测试性

全部 AC 可自动测试（vitest + mock_chrome_debugger + fake timers）。

## 测试钩子约定

`src/` 测试钩子导出须带 `_for_test` 命名约定（如 `_render_dt_list_for_test`、`_handle_network_request_for_test`）。
