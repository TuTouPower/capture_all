// shared/escape.ts

// JSON 嵌入 <script> 的转义：既防 </script> 注入，也防 JS 字符串字面量被击穿。
// 输入恒为 JSON.stringify 输出，其 QuoteJSONString 已把 <0x20 控制符序列化为转义序列，
// 故此处只需处理 JSON.stringify 不转义、但 JS 字面量敏感的三类：
//   - 反斜杠 `\`（必须先翻倍，否则原 JSON 的 `\n` 等会被 JS 二次解析为真实控制符）
//   - 单引号 `'`（JSON.parse('...') 的字符串定界符）
//   - U+2028 行分隔符 / U+2029 段分隔符（JS 字符串字面量非法，JSON.stringify 不转义）
// < > & 与 </script> 防 HTML 注入。U+2028/2029 用 new RegExp 构造，避免源文件内嵌控制字符。
const LS_2028 = new RegExp(String.fromCharCode(0x2028), 'g');
const PS_2029 = new RegExp(String.fromCharCode(0x2029), 'g');

export function escape_for_html_embed(json_str: string): string {
    return json_str
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/<\/script>/g, '<\\/script>')
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(LS_2028, '\\u2028')
        .replace(PS_2029, '\\u2029');
}

/** Escape for HTML text/attribute contexts (prevents XSS in template literals) */
export function escape_html(s: unknown): string {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c] as string));
}
