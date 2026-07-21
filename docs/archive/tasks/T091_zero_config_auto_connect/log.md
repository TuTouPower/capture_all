# Task log

只记录有追溯价值的进展、踩坑、中途决策、偏离 plan 原因和关键验证结果；不写命令流水账。

## 记录

- 中文数字 `parse_chinese_numeral` 初版两个 bug：连续数字「一二三」未拒绝、百位后十位漏算前导「一」。第一版跟踪「一百一十」少算 1 成 109。改用「pending_digit 状态机」+ `digits_10_to_99(n, at_root)` 区分独立成词（10→「十」）与拼接后缀（110→「一百一十」）。
- `to_chinese_numeral` 初版生成「一百十」（110）、「一百十一」（111），标准中文应是「一百一十」「一百一十一」。根因：百位后接 10..19 时省略前导「一」。修法：百/千位拼接 rest 时 `at_root=false` 强制前导。
- T0009 三个 pairing 强制测试（AC-1 / AC-2 / pairing window closed）反映旧规范，T091 已反转默认。重写为「loopback origin 直通 enroll succeeds」+ 新增中文编号用例。pairing_code 显式传入的测试（AC-3 正确 / 错误 / 过期）保留。
- heartbeat label 处理覆盖 T047「显式清空为 null」语义。新语义：扩展未传 label 保留 Bridge 自动分配的默认编号；自定义 label 优先；自动编号由 `next_default_label` 保证不冲突，不触发顶替。
- review 后补丁：实施 test_f001 时发现 `normalize_agent_bridge_config:26` 旧逻辑 `agent_bridge_enabled && token.length > 0` 在 token 空时强制禁用，T091 零配置下 enroll 根本不跑。改为纯 `config.agent_bridge_enabled`。同步翻转 `agent_bridge_config_ui.test.ts` 旧测断言。
- 验证：`npm test` 104 文件 / 1163 用例全绿；`npx tsc --noEmit` 无错误；`scan:tracked-tree` 在文档几处报已知 credential-assignment 启发式误报（讨论 `CAPTURE_ALL_BRIDGE_TOKEN=...` 环境变量名），非真 secret。
