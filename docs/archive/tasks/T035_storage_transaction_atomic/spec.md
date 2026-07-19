# Task spec + plan - T035 storage_transaction_atomic

## 背景

`src/extension/background/storage.ts` create_capture/update_capture 用 request.onsuccess resolve（不等 tx.oncomplete），flush_store 先 splice 再开 tx 失败丢批次，周期 flush `.catch(()=>{})` 吞错。

## 范围

- create_capture/update_capture：tx.oncomplete resolve，tx.onerror/onabort reject。
- flush_store：tx.oncomplete 后清空 + 累计 bytes；失败放回 buffer 头部供重试。
- 周期 flush：flush_store 已自回填，周期 catch 静默避免刷屏。

## 验收

- [x] create_capture 用 tx.oncomplete resolve。
- [x] flush_store abort 时 batch 放回 buffer。
- [x] npm test 全绿。
