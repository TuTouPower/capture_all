# p040 批量删除中途失败选中残留

- 来源：t154 遗留（gen_f003 minor）
- 内容：dashboard_captures batchDel 中途某条删除失败时，已成功的选中项仍残留 selected 集合，用户重点删除会重复删除（SW 幂等无数据损坏）。改进：失败时从 selected 移除已删项或清空 selected。非阻断。
- 处理：t197
