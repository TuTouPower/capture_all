#!/usr/bin/env python3
"""把 SVG 内 <text> 转成 <path>，消除本机字体差异。

用法: outline_svg_text.py <input.svg> <output.svg>
依赖: fonttools（本机 Noto Sans / Noto Sans CJK SC）
"""
from __future__ import annotations

import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from fontTools.misc.transform import Transform
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.ttLib.ttCollection import TTCollection

NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", NS)

# 固定字库：与设计稿一致，生成结果不随本机 fontconfig 回退变化
FONT_LATIN_BOLD = Path("/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf")
FONT_CJK_BOLD = Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc")

_font_cache: dict[str, TTFont] = {}


def load_font(path: Path) -> TTFont:
    key = str(path)
    if key in _font_cache:
        return _font_cache[key]
    if path.suffix.lower() == ".ttc":
        coll = TTCollection(str(path))
        chosen = coll.fonts[0]
        for font in coll.fonts:
            names = []
            for rec in font["name"].names:
                if rec.nameID in (1, 2, 4):
                    try:
                        names.append(rec.toUnicode())
                    except Exception:
                        pass
            blob = " ".join(names).lower()
            if "bold" in blob and "sc" in blob:
                chosen = font
                break
        _font_cache[key] = chosen
        return chosen
    font = TTFont(str(path))
    _font_cache[key] = font
    return font


def pick_font(text: str, font_family: str) -> TTFont:
    """中文优先 CJK Bold；纯拉丁用 Noto Sans Bold。

    注意：font_family 参数当前不参与字体选择（工具仅支持两种固定字体），
    传入但忽略。如需扩展字体选择逻辑，在此函数内解析 font_family。
    """
    del font_family  # 显式标注忽略：当前不支持按 font_family 选字体
    if any(ord(ch) > 0x2E7F for ch in text):
        if FONT_CJK_BOLD.is_file():
            return load_font(FONT_CJK_BOLD)
    if FONT_LATIN_BOLD.is_file():
        return load_font(FONT_LATIN_BOLD)
    raise FileNotFoundError(
        f"缺少字体: {FONT_LATIN_BOLD} 或 {FONT_CJK_BOLD}",
    )


def text_to_path_d(
    font: TTFont,
    text: str,
    size: float,
    letter_spacing: float = 0.0,
) -> str:
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    scale = size / font["head"].unitsPerEm
    x = 0.0
    parts: list[str] = []
    for ch in text:
        cp = ord(ch)
        if cp not in cmap:
            raise KeyError(f"字体缺字 U+{cp:04X} {ch!r}")
        gname = cmap[cp]
        pen = SVGPathPen(glyph_set)
        tpen = TransformPen(pen, Transform(scale, 0, 0, -scale, x, 0))
        glyph_set[gname].draw(tpen)
        d = pen.getCommands()
        if d:
            parts.append(d)
        x += hmtx[gname][0] * scale + letter_spacing
    return " ".join(parts)


def local_name(tag: str) -> str:
    if tag.startswith("{"):
        return tag.rsplit("}", 1)[-1]
    return tag


def outline_tree(root: ET.Element) -> None:
    parent_map = {c: p for p in root.iter() for c in p}

    texts = [el for el in root.iter() if local_name(el.tag) == "text"]
    for el in texts:
        raw = "".join(el.itertext())
        # 折叠 SVG 文本空白（与常见渲染一致）
        text = re.sub(r"\s+", " ", raw).strip()
        if not text:
            parent = parent_map.get(el)
            if parent is not None:
                parent.remove(el)
            continue

        family = el.get("font-family", "Noto Sans")
        size = float(el.get("font-size", "16"))
        letter_spacing = float(el.get("letter-spacing") or 0)
        fill = el.get("fill", "#000")
        x = float(el.get("x", "0"))
        y = float(el.get("y", "0"))

        font = pick_font(text, family)
        d = text_to_path_d(font, text, size, letter_spacing)

        g = ET.Element(f"{{{NS}}}g")
        g.set("transform", f"translate({x},{y})")
        if fill:
            g.set("fill", fill)
        # 保留 aria / 语义
        g.set("aria-label", text)
        path = ET.SubElement(g, f"{{{NS}}}path")
        path.set("d", d)

        parent = parent_map[el]
        idx = list(parent).index(el)
        parent.remove(el)
        parent.insert(idx, g)


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: outline_svg_text.py <in.svg> <out.svg>", file=sys.stderr)
        return 2
    in_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2])
    tree = ET.parse(in_path)
    outline_tree(tree.getroot())
    tree.write(out_path, encoding="utf-8", xml_declaration=True)
    # ElementTree 可能丢掉换行；可读性其次，正确性优先
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
