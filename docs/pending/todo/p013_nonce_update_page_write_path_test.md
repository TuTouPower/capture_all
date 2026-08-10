# p013 update_page_nonce 写路径直接测试

- 来源：t097 遗留（t097_test_f005，minor）
- 内容：AC-003b 手工写 window nonce，jsdom 不执行注入 script 元素，`update_page_nonce` 生产写路径无直接测试。可在 jsdom 中用 vi 执行注入脚本（mock document.createElement('script').textContent 执行）验证 start 后 window 变量被写入。
- 处理：未开
