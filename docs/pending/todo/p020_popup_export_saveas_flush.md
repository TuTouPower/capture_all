# p020 popup 导出不传 save_as 不 flush

- 来源：t107 范围外观察（review_code.md 结论节）
- 内容：popup.ts:296 导出路径仍不传 export_save_as、导出前不 flush。与 t107 的 dashboard 导出一致性待确认：popup 导出应同样传 save_as 配置与 flush 缓冲。
- 处理：未开
