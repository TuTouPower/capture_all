# p044 exporter/coordinator/storage 三条断言缺口

- 来源：t155 遗留
- 内容：AC-018 部分项实现无测试：①B2-L1 total_size_kb 改实际字节数后 exporter.test.ts 仅冒烟覆盖 export_html，未断言该值；②B2-L5 bridge 相对时间修正（relative_time=timestamp-start_time clamp）无直接单测；③B2-L7 dom_data store 映射无路由断言。在 exporter/coordinator/storage 测试中补三条断言（total_size_kb>0、relative_time clamp、dom_data 事件落 USER_ACTION_EVENTS store）。
- 处理：t198
