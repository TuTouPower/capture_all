# Spec — archive body 去重后回写 JSONL body_ref

归档 body 路径冲突改名（加 `_2`/`_3` 后缀）后，JSONL 内 `response_body_ref` / `request_body_ref` 同步更新为最终路径，引用可解析到文件。

## 语义

- 冲突解决阶段为每个 orig 路径记录最终路径序列（`final_seq`，含首现被遮蔽改名）。
- 回写阶段对每条 JSONL 记录的 body_ref 按出现序消费 `final_seq[ref][n-1]`，每条记录指向自身最终文件。
- 覆盖 2-way/3-way 同路径冲突与改名目标遮蔽自然路径场景。

## 相关实现

- `src/extension/shared/archive_builder.ts`：`build_archive` 冲突解决 + body_ref 回写
- `tests/unit/archive_body_ref_consistency.test.ts`：去重改名 / 各自文件 / 遮蔽场景测试
