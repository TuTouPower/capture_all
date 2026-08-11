# p031 storage/ws 注入脚本级重注入 HMAC 回归测试

- 来源：t121 遗留（t121_code_f004，minor）
- 内容：network 通道有 T121restart 注入脚本级重注入（还原+重装）回归测试，storage/ws 两通道仅补 content 层 secret 旋转用例；storage/ws 注入脚本级重注入路径（eval 注入脚本 → 还原 → 重装新 SECRET）无独立回归。三通道还原逻辑同构，由 network 用例覆盖，扩展为可选。
- 处理：t120,t121
