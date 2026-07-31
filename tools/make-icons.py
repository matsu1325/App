#!/usr/bin/env python3
"""アイコン生成 — icons/ の PNG を作り直す。

台帳の配色（--ink 地に --brass の一文字）をそのままアイコンにする。
実行には Pillow が要る: pip install pillow
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"

INK = "#0E1621"
BRASS = "#C08A3E"
VERMILION = "#B23A2E"

GLYPH = "台"

FONT_CANDIDATES = [
    "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf",
    "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
]


def load_font(size):
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def draw_icon(size, maskable=False):
    img = Image.new("RGB", (size, size), INK)
    d = ImageDraw.Draw(img)

    # 朱罫（台帳の左端の罫線を模す）
    rule_x = round(size * 0.12)
    d.line([(rule_x, 0), (rule_x, size)], fill=VERMILION, width=max(1, size // 128))

    # maskable はシステムがトリミングするので中心の安全域だけに収める
    scale = 0.55 if maskable else 0.68
    font = load_font(round(size * scale))

    bbox = d.textbbox((0, 0), GLYPH, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    cx = size / 2 + (rule_x * 0.35 if not maskable else 0)
    x = cx - tw / 2 - bbox[0]
    y = size / 2 - th / 2 - bbox[1]
    d.text((x, y), GLYPH, fill=BRASS, font=font)

    return img


def main():
    OUT.mkdir(exist_ok=True)
    draw_icon(192).save(OUT / "icon-192.png")
    draw_icon(512).save(OUT / "icon-512.png")
    draw_icon(512, maskable=True).save(OUT / "icon-maskable-512.png")
    draw_icon(180).save(OUT / "icon-180.png")
    print(f"書き出し: {OUT}")


if __name__ == "__main__":
    main()
