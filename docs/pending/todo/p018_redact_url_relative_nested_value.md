# p018 redact_url param 值内嵌相对 query 不递归

- 来源：t100 范围外既有局限（review_code.md 结论段）
- 内容：手动路径仅对 param 值内嵌绝对 URL（URL_SUBSTRING_RE scheme://）递归，`?next=path?token=secret`（相对嵌套）不递归，secret 泄露。base 亦存在，非本 task 引入。可扩展递归检测含 ? 的相对值。
- 处理：未开
