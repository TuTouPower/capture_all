// tests/wcag_contrast.ts — WCAG 2.1 对比度计算工具
// 无外部依赖，直接实现 WCAG 相对亮度和对比度公式

/**
 * 线性化单个 RGB 通道值 (0-255)
 * 参见: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function linearize(channel: number): number {
    const c = channel / 255;
    if (c <= 0.04045) return c / 12.92;
    return Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * 计算相对亮度
 * L = 0.2126 * R + 0.7152 * G + 0.0722 * B
 */
export function wcag_luminance(r: number, g: number, b: number): number {
    return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * 计算两个 HSL/hex 等色值之间的 WCAG 对比度
 * 接收两个由 wcag_luminance 返回的亮度值
 * 公式: (L1 + 0.05) / (L2 + 0.05)，其中 L1 是较亮的
 */
export function wcag_contrast_ratio(luminance1: number, luminance2: number): number {
    const lighter = Math.max(luminance1, luminance2);
    const darker = Math.min(luminance1, luminance2);
    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * 解析 rgb(r, g, b) 或 rgb(r,g,b) 字符串
 * 返回 [r, g, b] 数组，解析失败返回 null
 */
export function parse_rgb(color: string): [number, number, number] | null {
    const m = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * 计算两个 CSS rgb(r, g, b) 颜色字符串之间的对比度
 * 便捷方法：解析 → 计算亮度 → 计算对比度
 */
export function wcag_contrast_between(color1: string, color2: string): number | null {
    const rgb1 = parse_rgb(color1);
    const rgb2 = parse_rgb(color2);
    if (!rgb1 || !rgb2) return null;
    const lum1 = wcag_luminance(rgb1[0], rgb1[1], rgb1[2]);
    const lum2 = wcag_luminance(rgb2[0], rgb2[1], rgb2[2]);
    return wcag_contrast_ratio(lum1, lum2);
}
