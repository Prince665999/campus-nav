"""
make_qr_codes.py

Makes the printable QR codes for every node tagged `qr=<code>` in final.osm.

For each code it writes:
  <out>/<CODE>.png     one card: the QR code, the code, and where it is
  <out>/sheet.pdf      all cards, four to an A4 page, ready to print
  <out>/codes.csv      code, name, building, level, and the text in the QR

It reads the OSM file directly, so it works before you re-run the ingest and
needs no database.

Run from the repo root:

    pip install "qrcode[pil]"
    python -m backend.pipeline.make_qr_codes
    python -m backend.pipeline.make_qr_codes --osm backend/data/final.osm --out qr_codes

What is inside each QR code is   campusnav://qr/<CODE>   by default. The app
accepts that and also the bare code. If you later put the app on the web,
re-run with  --prefix https://your-domain/q/  and reprint; the codes in the
map do not change.
"""

import argparse
import csv
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

CODE_RE = re.compile(r"^[A-Za-z0-9_-]{1,32}$")  # same rule as the ingest
DEFAULT_PREFIX = "campusnav://qr/"

CARD_W, CARD_H = 1100, 1500
PAGE_W, PAGE_H = 2480, 3508  # A4 at 300 dpi


_ORDINALS = ["Ground floor", "First floor", "Second floor", "Third floor",
             "Fourth floor", "Fifth floor", "Sixth floor", "Seventh floor",
             "Eighth floor", "Ninth floor", "Tenth floor"]


def level_label(level):
    """"0" -> "Ground floor", "1" -> "First floor", "-1" -> "Basement"."""
    text = str(level if level is not None else "0").split(";")[0].strip()
    try:
        n = int(text)
    except ValueError:
        return text  # something like "M": print it as typed
    if n == -1:
        return "Basement"
    if n < -1:
        return f"Basement {-n}"
    if n < len(_ORDINALS):
        return _ORDINALS[n]
    return f"Floor {n}"


def read_qr_nodes(osm_path):
    """Return [{code, name, building, level, node_id}] for tagged nodes."""
    tree = ET.parse(str(osm_path))
    found = []
    for node in tree.getroot().iter("node"):
        tags = {t.get("k"): t.get("v") for t in node.findall("tag")}
        code = (tags.get("qr") or "").strip()
        if not code:
            continue
        found.append(
            {
                "code": code,
                "name": (tags.get("name") or tags.get("loc_name") or "").strip(),
                "building": (tags.get("building_name") or "").strip(),
                "level": (tags.get("level") or "0").split(";")[0],
                "node_id": node.get("id"),
            }
        )
    return found


def check_codes(nodes):
    """Split into (good, problems). Problems are human-readable strings."""
    good, problems, seen = [], [], {}
    for n in nodes:
        code = n["code"]
        if not CODE_RE.match(code):
            problems.append(
                f"node {n['node_id']}: invalid code {code!r} "
                "(letters, digits, - and _ only, max 32)"
            )
            continue
        key = code.lower()
        if key in seen:
            problems.append(
                f"code {code!r} is used by nodes {seen[key]} and {n['node_id']}"
            )
            continue
        seen[key] = n["node_id"]
        good.append(n)
    return good, problems


def _font(size, bold=False):
    from PIL import ImageFont

    names = (
        ["arialbd.ttf", "DejaVuSans-Bold.ttf"]
        if bold
        else ["arial.ttf", "DejaVuSans.ttf"]
    )
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)


def _centered(draw, text, y, font, fill, width):
    box = draw.textbbox((0, 0), text, font=font)
    draw.text(((width - (box[2] - box[0])) / 2, y), text, font=font, fill=fill)


def _wrap(draw, text, font, max_width):
    words, lines, line = text.split(), [], ""
    for w in words:
        trial = (line + " " + w).strip()
        if draw.textbbox((0, 0), trial, font=font)[2] <= max_width or not line:
            line = trial
        else:
            lines.append(line)
            line = w
    if line:
        lines.append(line)
    return lines


def make_card(node, payload):
    import qrcode
    from PIL import Image, ImageDraw

    qr = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_Q,  # survives scuffs
        box_size=14,
        border=3,
    )
    qr.add_data(payload)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    side = 860
    qr_img = qr_img.resize((side, side), Image.NEAREST)

    card = Image.new("RGB", (CARD_W, CARD_H), "white")
    draw = ImageDraw.Draw(card)
    draw.rectangle([4, 4, CARD_W - 5, CARD_H - 5], outline="#046c2f", width=8)

    _centered(draw, "SCAN TO START NAVIGATION", 70, _font(58, True), "#046c2f", CARD_W)
    _centered(draw, "Campus Navigation", 150, _font(44), "#444444", CARD_W)
    card.paste(qr_img, ((CARD_W - side) // 2, 260))

    y = 260 + side + 40
    _centered(draw, node["code"], y, _font(96, True), "black", CARD_W)
    y += 130
    name_font = _font(50)
    for line in _wrap(draw, node["name"] or "", name_font, CARD_W - 160)[:2]:
        _centered(draw, line, y, name_font, "#222222", CARD_W)
        y += 64
    where = ", ".join(x for x in [node["building"], level_label(node["level"])] if x)
    _centered(draw, where, y + 10, _font(42), "#555555", CARD_W)
    return card


def make_sheet(cards, path):
    """Four cards per A4 page -> multi-page PDF."""
    from PIL import Image

    pages = []
    scale = 0.98 * (PAGE_W / 2) / CARD_W
    cw, ch = int(CARD_W * scale), int(CARD_H * scale)
    for i in range(0, len(cards), 4):
        page = Image.new("RGB", (PAGE_W, PAGE_H), "white")
        for j, card in enumerate(cards[i : i + 4]):
            col, row = j % 2, j // 2
            small = card.resize((cw, ch), Image.LANCZOS)
            page.paste(small, (col * (PAGE_W // 2) + 20, row * (PAGE_H // 2) + 20))
        pages.append(page)
    if pages:
        pages[0].save(str(path), "PDF", resolution=300, save_all=True,
                      append_images=pages[1:])


def main(argv=None):
    parser = argparse.ArgumentParser(description="Make printable QR codes.")
    parser.add_argument("--osm", default="backend/data/final.osm")
    parser.add_argument("--out", default="backend/data/qr_codes")
    parser.add_argument("--prefix", default=DEFAULT_PREFIX)
    args = parser.parse_args(argv)

    osm = Path(args.osm)
    if not osm.exists():
        print(f"Cannot find {osm}. Use --osm to point at final.osm.")
        return 1

    nodes, problems = check_codes(read_qr_nodes(osm))
    for p in problems:
        print("  WARNING:", p)
    if not nodes:
        print("No nodes tagged qr=<code> found. Nothing to do.")
        return 1

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    cards, rows = [], []
    for n in sorted(nodes, key=lambda n: n["code"].lower()):
        payload = f"{args.prefix}{n['code']}"
        card = make_card(n, payload)
        card.save(out / f"{n['code']}.png")
        cards.append(card)
        rows.append([n["code"], n["name"], n["building"], n["level"], payload])
        print(f"  {n['code']:<14} {n['name']}")

    with open(out / "codes.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["code", "name", "building", "level", "qr_text"])
        w.writerows(rows)

    make_sheet(cards, out / "sheet.pdf")
    print(f"\n{len(cards)} codes written to {out}/  (print sheet.pdf)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
