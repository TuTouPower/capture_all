// shared/escape.ts

/** Escape for JSON embedded in <script> (prevents </script> injection) */
export function escape_for_html_embed(json_str: string): string {
    return json_str
        .replace(/<\/script>/g, '<\\/script>')
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026');
}

/** Escape for HTML text/attribute contexts (prevents XSS in template literals) */
export function escape_html(s: unknown): string {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c] as string));
}
