# spec: test_isolation_contract

## 背景

测试隔离与契约确认两条遗留（pending 总账）：keepalive.test.ts 用例依赖模块级 `listener_registered` 幂等注册，重置 on_alarm_listener 破坏 setup 幂等，顺序通过但隔离脆弱（p037）；dispatcher stop success:false 分支（`agent_command_dispatcher.ts`）真实不可达——service_worker stop_capture_inner 恒返回 success:true，失败走 rethrow → STORAGE_READ_FAILED，该分支保留为防御需确认或移除（p049）。

## 验收标准

- AC-001：keepalive.test.ts 用例独立运行（单用例/重排/插用例）均绿，不依赖模块级幂等残留。
- AC-002：dispatcher stop success:false 分支可达性结论明确——保留（注释说明防御语义）或移除（清理死分支），决策落定。
- AC-003：新增/调整测试全绿，既有相关测试无回归。

## 可测试性

全部 AC 可自动测试：测试隔离用 vitest 重载（`vi.resetModules` + 动态 import）；分支可达性用源码/行为核实。

## 实现约定

- keepalive 隔离：每用例 `vi.resetModules()` + 动态 import，模块级幂等标志随重载回到初始态（不改生产逻辑，仅测试侧）。
- p049 结论：`stop_capture` 空闲态直接 `{success:true}`、`stop_capture_inner` 全路径恒 success:true（step 均经 `run_stop_step` catch 仅 log）、异常 rethrow 经 `to_agent_error` 转错误响应——dispatcher success:false 分支实际不可达。**保留防御**（接口类型允许 success:false，移除会与接口语义脱节）+ 语义注释，行为由 dispatcher 测试覆盖（success:false → idle）。

## 测试钩子约定

`src/` 测试钩子导出须带 `_for_test` 命名约定。
