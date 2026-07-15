#!/usr/bin/env node
/**
 * 从 assets/icons/icon.svg 生成全部 icon*.png，
 * 同步 logo 到 promo SVG，并把 promo 文字 outline 成 path 后导出 PNG。
 *
 * 依赖：
 *   - rsvg-convert（librsvg2-bin）
 *   - python3 + fonttools
 *   - 本机字体 NotoSans-Bold / NotoSansCJK-Bold
 *
 * 用法：node scripts/generate_icons.mjs
 *
 * 为何 outline 文字：
 *   SVG 直接写 <text> 时，浏览器与 rsvg 选字/字重不一致，
 *   且本机无 Noto 时回退字体不同 → .svg 与 .png 英文外观不一致。
 *   转 path 后与渲染引擎、本机字体无关。
 */
import { execFileSync } from 'node:child_process';
import {
    readFileSync,
    writeFileSync,
    mkdirSync,
    existsSync,
    unlinkSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ICONS_DIR = join(ROOT, 'assets', 'icons');
const PROMO_DIR = join(ROOT, 'assets', 'promo');
const ICON_SVG = join(ICONS_DIR, 'icon.svg');
const OUTLINE_PY = join(__dirname, 'outline_svg_text.py');

const ICON_SIZES = [16, 32, 48, 128, 300];

/**
 * promo 完整布局源（文字用 <text>，生成时再 outline）。
 * 改文案/字号只改这里，不要手改生成后的 path。
 */
const PROMO_SPECS = [
    {
        name: 'promo_small',
        width: 440,
        height: 280,
        aria_label: 'Capture',
        title: 'Capture — Small promotional tile',
        body: (logo_inner) => `  <defs>
    <linearGradient id="text" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#1a8cff"/>
      <stop offset="50%" stop-color="#00b4ff"/>
      <stop offset="100%" stop-color="#00e0ff"/>
    </linearGradient>
  </defs>

  <!--
    Centered cluster (group midpoint = 220):
    logo 128px, gap 22, text "Capture"
    西文固定 Noto Sans Bold（生成时 outline，不依赖本机回退）
  -->
  <g transform="translate(220,140)">
    <!-- content half-width tuned from measured bbox (equal L/R margins) -->
    <g transform="translate(-205,-64)">
      <g transform="scale(1)">
${logo_inner}
      </g>
      <text
        x="152"
        y="84"
        fill="url(#text)"
        font-family="Noto Sans"
        font-size="64"
        font-weight="700"
      >Capture</text>
    </g>
  </g>`,
    },
    {
        name: 'promo_marquee',
        width: 1400,
        height: 560,
        aria_label: 'Capture All 全采',
        title: 'Capture All 全采 — Marquee promotional tile',
        body: (logo_inner) => `  <defs>
    <linearGradient id="text" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#1a8cff"/>
      <stop offset="50%" stop-color="#00b4ff"/>
      <stop offset="100%" stop-color="#00e0ff"/>
    </linearGradient>
  </defs>

  <!-- logo 480px, gap 40; 中英同字号 108；生成时 outline -->
  <g transform="translate(700,280)">
    <g transform="translate(-560,-240)">
      <g transform="scale(3.75)">
${logo_inner}
      </g>

      <!-- text left = 480+40 = 520; 中英同字号 108 -->
      <text
        x="520"
        y="175"
        fill="url(#text)"
        font-family="Noto Sans CJK SC"
        font-size="108"
        font-weight="700"
        letter-spacing="16"
      >全采</text>
      <text
        x="520"
        y="340"
        fill="url(#text)"
        font-family="Noto Sans"
        font-size="108"
        font-weight="700"
      >Capture All</text>
    </g>
  </g>`,
    },
];

function require_cmd(bin, install_hint) {
    try {
        execFileSync(bin, ['--version'], { stdio: 'pipe' });
    } catch {
        // some tools use -V
        try {
            execFileSync(bin, ['-V'], { stdio: 'pipe' });
        } catch {
            console.error(`error: 需要 ${bin}${install_hint ? `（${install_hint}）` : ''}`);
            process.exit(1);
        }
    }
}

function extract_logo_inner(svg_text) {
    const without_title = svg_text.replace(/<title>[\s\S]*?<\/title>\s*/i, '');
    const match = without_title.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
    if (!match) {
        throw new Error('无法解析 icon.svg：缺少 <svg> 根节点');
    }
    const raw = match[1].trim();
    if (!raw) {
        throw new Error('icon.svg 内容为空');
    }
    return raw
        .split('\n')
        .map((line) => {
            const t = line.trimEnd();
            if (!t.trim()) return '';
            return `        ${t.trim()}`;
        })
        .filter(Boolean)
        .join('\n');
}

function build_promo_svg_with_text(spec, logo_inner) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}" role="img" aria-label="${spec.aria_label}">
  <title>${spec.title}</title>
${spec.body(logo_inner)}
</svg>
`;
}

function outline_svg(in_path, out_path) {
    execFileSync('python3', [OUTLINE_PY, in_path, out_path], {
        stdio: ['ignore', 'pipe', 'inherit'],
    });
}

function rsvg_png(input_svg, output_png, { width, height } = {}) {
    const args = ['-f', 'png', '-o', output_png];
    if (width != null) args.push('-w', String(width));
    if (height != null) args.push('-h', String(height));
    args.push(input_svg);
    execFileSync('rsvg-convert', args, { stdio: 'pipe' });
}

function main() {
    require_cmd('rsvg-convert', '安装 librsvg2-bin');
    try {
        execFileSync('python3', ['-c', 'import fontTools'], { stdio: 'pipe' });
    } catch {
        console.error('error: 需要 python3 模块 fonttools（pip install fonttools）');
        process.exit(1);
    }
    if (!existsSync(OUTLINE_PY)) {
        console.error(`error: 找不到 ${OUTLINE_PY}`);
        process.exit(1);
    }
    if (!existsSync(ICON_SVG)) {
        console.error(`error: 找不到源文件 ${ICON_SVG}`);
        process.exit(1);
    }

    mkdirSync(ICONS_DIR, { recursive: true });
    mkdirSync(PROMO_DIR, { recursive: true });

    const logo_inner = extract_logo_inner(readFileSync(ICON_SVG, 'utf8'));
    console.log(`source: ${ICON_SVG}`);

    for (const size of ICON_SIZES) {
        const out = join(ICONS_DIR, `icon${size}.png`);
        rsvg_png(ICON_SVG, out, { width: size, height: size });
        console.log(`wrote: assets/icons/icon${size}.png (${size}×${size})`);
    }

    for (const spec of PROMO_SPECS) {
        const svg_path = join(PROMO_DIR, `${spec.name}.svg`);
        const tmp_text = join(PROMO_DIR, `.${spec.name}.text.svg`);

        // 1) 带 <text> 的中间稿
        writeFileSync(tmp_text, build_promo_svg_with_text(spec, logo_inner), 'utf8');
        // 2) outline → 最终 svg（浏览器/rsvg/本机字体无关）
        outline_svg(tmp_text, svg_path);
        try {
            unlinkSync(tmp_text);
        } catch {
            /* ignore */
        }
        console.log(`wrote: assets/promo/${spec.name}.svg (logo + outlined text)`);

        const png_path = join(PROMO_DIR, `${spec.name}.png`);
        rsvg_png(svg_path, png_path, {
            width: spec.width,
            height: spec.height,
        });
        console.log(
            `wrote: assets/promo/${spec.name}.png (${spec.width}×${spec.height})`,
        );
    }

    console.log('done.');
}

main();
