# p006 cdp_primary_emitted Set 只写不读

- 来源：t094 未进表观察（review_code.md 结论节，pre-existing）
- 内容：`src/extension/background/network_capture.ts` 的模块级 `cdp_primary_emitted` Set 只 add/clear、从不读取；`network_context.ts` 仍保留同名 context 字段与 reset clear，两个 CDP 测试 fixture 也残留同名属性。t023 已从 `CdpHandlerState` 删除该字段，t025 明确把 context 残留留作后续。核实于 2026-08-11：全仓无 `has` 或其他读取需求，属于 pre-existing 死代码；可同步删除 production 与测试残留。
- 处理：未开
