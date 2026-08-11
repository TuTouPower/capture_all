# p009 auto export format 样例扩展

- 来源：t096 遗留（t096_test_f003，minor）
- 内容：`agent_bridge_server.test.ts` AC-002 仅测 `jsonl` 一个合法 format；`har`/`html`、大写归一（`JSON`→`.json`）、白名单长度边界（16/17 字符）未覆盖。均走同一白名单正则 `^[a-zA-Z0-9]{1,16}$`，不构成覆盖缺口。可各补一例 `har` 与 17 字符非法 format 增强。
- 处理：t116
