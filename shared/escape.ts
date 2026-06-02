// shared/escape.ts
export function escape_for_html_embed(json_str: string): string {
    return json_str
        .replace(/<\/script>/g, '<\\/script>')
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026');
}
