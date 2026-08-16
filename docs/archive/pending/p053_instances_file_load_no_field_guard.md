# p053 load_persisted 畸形实例条目无字段守卫

- 现象：bridge 实例文件 `instances.json` 若含合法 JSON 但畸形结构的条目（缺 instance_id / token_hash 等字段），`load_persisted()` 原样装载,产生 token_hash 为 undefined 的垃圾实例,心跳恒 401,占槽位至 35s sweep。
- 影响：实例文件被部分损坏/手工编辑/旧版本结构差异时,恢复出不可用实例,污染 registry 与 label 分配。
- 根因：`src/bridge/registry.ts` `load_persisted()` 对 `JSON.parse` 后数组元素无逐字段校验,信任文件内容。
- 分类：产品缺陷（边界健壮性）。
- 来源：t201 Round 2 code review t201_code_f002（pre-existing,非 t201 引入）。
- 已扫同类：`load_persisted` 单一位点;persist 侧写盘结构固定,无对称问题。
- 测试缺口：无畸形字段条目 load 测试。
- 线索：`src/bridge/registry.ts:62-74`
- 处理：t203
