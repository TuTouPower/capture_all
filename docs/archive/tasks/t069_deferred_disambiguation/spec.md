# T069_deferred_disambiguation

本 task 的核心问题已在以下前序 task 中部分或完全修复：
- T022: CDP 复合键隔离消除跨 session 误关联。
- T025: loadingFailed 事件直接发主条目，不再延迟到 orphan。
- T031: stop drain 顺序保证 deferred timer 清理。
剩余：webRequest handler 的候选评分仍简化（无时间差/tab 约束），但 CDP-first 架构下 deferred 路径触发率极低。
