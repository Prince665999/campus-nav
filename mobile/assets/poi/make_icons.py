"""
Draws the map symbols (parking, medical, library...) as small PNG files.

Run from the repo root to redraw them:   python mobile/assets/poi/make_icons.py
Each is 96 x 96 with a transparent background and a white halo, so it reads on
any ground colour. The names must match POI_ICONS in
backend/api/services/basemap_service.py (plus "generic").
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent
SIZE = 96
SS = 4  # draw 4x bigger, then shrink: smooth edges

BLUE = "#0092da"
RED = "#bf0000"
BROWN = "#734a08"
PURPLE = "#ac39ac"
GREY = "#555555"
WHITE = "#ffffff"


def font(size, bold=True):
    for name in (["arialbd.ttf", "DejaVuSans-Bold.ttf"] if bold else ["arial.ttf", "DejaVuSans.ttf"]):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)


def canvas():
    img = Image.new("RGBA", (SIZE * SS, SIZE * SS), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def s(v):
    return v * SS


def badge(d, fill=WHITE, ring=None, r=44):
    """White round badge, optionally with a coloured ring."""
    c = SIZE / 2
    d.ellipse([s(c - r), s(c - r), s(c + r), s(c + r)], fill=fill, outline=ring, width=s(4) if ring else 0)


def letter(d, text, color, size=52):
    f = font(size * SS)
    box = d.textbbox((0, 0), text, font=f)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text(((s(SIZE) - w) / 2 - box[0], (s(SIZE) - h) / 2 - box[1]), text, font=f, fill=color)


def finish(img, name):
    img.resize((SIZE, SIZE), Image.LANCZOS).save(OUT / f"{name}.png", optimize=True)


def parking():
    img, d = canvas()
    d.rounded_rectangle([s(6), s(6), s(90), s(90)], radius=s(14), fill=WHITE)
    d.rounded_rectangle([s(12), s(12), s(84), s(84)], radius=s(10), fill=BLUE)
    letter(d, "P", WHITE, 60)
    finish(img, "parking")


def medical():
    img, d = canvas()
    badge(d, WHITE, RED)
    d.rectangle([s(40), s(20), s(56), s(76)], fill=RED)
    d.rectangle([s(20), s(40), s(76), s(56)], fill=RED)
    finish(img, "medical")


def library():
    img, d = canvas()
    badge(d, WHITE, BROWN)
    # an open book: two pages meeting in the middle
    d.polygon([(s(48), s(32)), (s(26), s(26)), (s(26), s(64)), (s(48), s(70))], fill=BROWN)
    d.polygon([(s(48), s(32)), (s(70), s(26)), (s(70), s(64)), (s(48), s(70))], fill=BROWN)
    d.line([(s(48), s(32)), (s(48), s(70))], fill=WHITE, width=s(3))
    finish(img, "library")


def food():
    img, d = canvas()
    badge(d, WHITE, BROWN)
    for x in (30, 37, 44):  # fork
        d.line([(s(x), s(22)), (s(x), s(42))], fill=BROWN, width=s(3))
    d.arc([s(29), s(28), s(45), s(50)], 0, 180, fill=BROWN, width=s(3))
    d.line([(s(37), s(46)), (s(37), s(74))], fill=BROWN, width=s(4))
    d.polygon([(s(60), s(22)), (s(68), s(26)), (s(68), s(50)), (s(60), s(50))], fill=BROWN)  # knife
    d.line([(s(62), s(48)), (s(62), s(74))], fill=BROWN, width=s(5))
    finish(img, "food")


def bank():
    img, d = canvas()
    badge(d, WHITE, BROWN)
    letter(d, "$", BROWN, 56)
    finish(img, "bank")


def toilets():
    img, d = canvas()
    badge(d, WHITE, BLUE)
    letter(d, "WC", BLUE, 38)
    finish(img, "toilets")


def worship():
    img, d = canvas()
    badge(d, WHITE, BROWN)
    d.pieslice([s(26), s(30), s(70), s(74)], 180, 360, fill=BROWN)  # dome
    d.rectangle([s(26), s(52), s(70), s(70)], fill=BROWN)  # body
    d.line([(s(48), s(18)), (s(48), s(32))], fill=BROWN, width=s(4))  # spire
    d.rectangle([s(43), s(58), s(53), s(70)], fill=WHITE)  # door
    finish(img, "worship")


def bus():
    img, d = canvas()
    badge(d, WHITE, BLUE)
    d.rounded_rectangle([s(24), s(24), s(72), s(66)], radius=s(7), fill=BLUE)
    d.rectangle([s(29), s(30), s(67), s(46)], fill=WHITE)
    d.line([(s(48), s(30)), (s(48), s(46))], fill=BLUE, width=s(3))
    d.ellipse([s(30), s(62), s(40), s(72)], fill=BLUE)
    d.ellipse([s(56), s(62), s(66), s(72)], fill=BLUE)
    finish(img, "bus")


def shop():
    img, d = canvas()
    badge(d, WHITE, PURPLE)
    d.rectangle([s(28), s(38), s(68), s(72)], fill=PURPLE)  # bag
    d.arc([s(36), s(20), s(60), s(52)], 180, 360, fill=PURPLE, width=s(4))  # handle
    finish(img, "shop")


def lodging():
    img, d = canvas()
    badge(d, WHITE, BLUE)
    d.rectangle([s(24), s(50), s(72), s(60)], fill=BLUE)  # mattress
    d.rectangle([s(24), s(34), s(30), s(68)], fill=BLUE)  # headboard
    d.rounded_rectangle([s(32), s(40), s(46), s(50)], radius=s(4), fill=BLUE)  # pillow
    d.rectangle([s(66), s(60), s(72), s(68)], fill=BLUE)
    finish(img, "lodging")


def post():
    img, d = canvas()
    badge(d, WHITE, BROWN)
    d.rectangle([s(24), s(32), s(72), s(64)], fill=BROWN)
    d.line([(s(24), s(32)), (s(48), s(52)), (s(72), s(32))], fill=WHITE, width=s(4))
    finish(img, "post")


def info():
    img, d = canvas()
    badge(d, BLUE, WHITE)
    letter(d, "i", WHITE, 58)
    finish(img, "info")


def fuel():
    img, d = canvas()
    badge(d, WHITE, BLUE)
    d.rounded_rectangle([s(30), s(24), s(58), s(70)], radius=s(4), fill=BLUE)
    d.rectangle([s(35), s(30), s(53), s(44)], fill=WHITE)
    d.line([(s(58), s(36)), (s(68), s(44)), (s(68), s(62))], fill=BLUE, width=s(4))
    finish(img, "fuel")


def police():
    img, d = canvas()
    badge(d, WHITE, BLUE)
    c, pts = (48, 48), []
    for i in range(10):
        r = 24 if i % 2 == 0 else 10
        a = math.radians(-90 + i * 36)
        pts.append((s(c[0] + r * math.cos(a)), s(c[1] + r * math.sin(a))))
    d.polygon(pts, fill=BLUE)
    finish(img, "police")


def community():
    img, d = canvas()
    badge(d, WHITE, BROWN)
    d.polygon([(s(24), s(48)), (s(48), s(26)), (s(72), s(48))], fill=BROWN)
    d.rectangle([s(30), s(48), s(66), s(70)], fill=BROWN)
    d.rectangle([s(42), s(56), s(54), s(70)], fill=WHITE)
    finish(img, "community")


def generic():
    img, d = canvas()
    d.ellipse([s(26), s(26), s(70), s(70)], fill=WHITE)
    d.ellipse([s(34), s(34), s(62), s(62)], fill=GREY)
    finish(img, "generic")


if __name__ == "__main__":
    for fn in (parking, medical, library, food, bank, toilets, worship, bus, shop,
               lodging, post, info, fuel, police, community, generic):
        fn()
    print("wrote", len(list(OUT.glob("*.png"))), "icons to", OUT)
