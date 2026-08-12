# d006 fflate zipSync 同步压缩阻塞 UI，异步 zip 不阻塞

- 来源：t153 task（AC-001）
- 结论：fflate `zipSync` 同步压缩阻塞调用线程（UI 卡顿）；异步 `zip(files, cb)` 主线程分块、事件循环让出，压缩超大 body 集合时不阻塞渲染。行为等价（zip 输出可被 `unzipSync` 正常解出，内容一致）。
- 证据：`src/extension/shared/archive_builder.ts` `assemble_zip` 由 `zipSync` 改为 `zip` 后，`tests/unit/archive_builder.test.ts` 全量 build_archive 行为用例（含 `unzipSync` 校验）通过；异步回调经 Promise 包裹后返回 `Uint8Array`。
- 影响：归档/导出路径凡涉及大 zip 组装一律用异步 `zip`（`build_archive` 已 await）；仅极小固定内容可保留同步压缩。
- 现状：有效
