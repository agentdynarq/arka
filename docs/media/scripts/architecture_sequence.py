"""
Animated architecture sequence: how the 2065 collapse happened, and how
Arka contains the same kind of attack today. Drawn frame by frame with
Pillow (boxes, lines, text: no external assets, nothing traced or copied),
using Arka's real dark "ops" register (packages/ui/src/tokens.css,
data-surface="ops", the same one apps/console's operator screens use),
since this diagram is fundamentally an incident/operations story.

Run: python architecture_sequence.py
Output: ../architecture.gif (relative to this script's docs/media/scripts/)
"""

from PIL import Image, ImageDraw, ImageFont
import math
import os

W, H = 1200, 640
OUT_DIR = os.path.join(os.path.dirname(__file__), "..")
OUT_PATH = os.path.join(OUT_DIR, "architecture.gif")

# Real Arka dark ops register (packages/ui/src/tokens.css, data-surface="ops")
BG = (10, 16, 32)  # --palette-ops-bg
SURFACE = (16, 26, 48)  # --palette-ops-surface
BORDER = (34, 48, 76)  # --palette-ops-border
TEXT = (255, 255, 255)
TEXT_SOFT = (143, 161, 188)  # --palette-ops-text-secondary
TEXT_TERT = (199, 210, 228)  # --palette-ops-text-tertiary
TEAL = (14, 148, 136)
TEAL_LIGHT = (94, 234, 212)
NAVY_CHROME = (7, 14, 30)

# Brightened for legibility against a near-black background; same hues Arka
# already uses for status (services/payments error codes, ledger tests).
RED = (248, 81, 73)
RED_DIM = (94, 40, 44)
GREEN = (52, 211, 153)
GREEN_DIM = (24, 66, 58)
AMBER = (251, 191, 90)

FONT_DIR = "C:/Windows/Fonts"


def font(path, size):
    return ImageFont.truetype(os.path.join(FONT_DIR, path), size)


F_TITLE = font("arialbd.ttf", 32)
F_CAPTION = font("arialbd.ttf", 24)
F_SUB = font("arial.ttf", 18)
F_LABEL = font("arialbd.ttf", 16)
F_SMALL = font("arial.ttf", 14)
F_TAG = font("arialbd.ttf", 13)

frames = []
durations = []
BASE_MS = 55


def add(img, ms=BASE_MS):
    frames.append(img)
    durations.append(ms)


def hold(img, units):
    # One frame with a long duration, not N duplicate frames: Pillow's GIF
    # encoder merges pixel-identical consecutive frames under optimize=True,
    # which silently drops a pause built from repeated frames instead of one
    # frame with an explicit longer duration.
    add(img.copy(), ms=units * BASE_MS)


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_color(c1, c2, t):
    return tuple(int(lerp(c1[i], c2[i], t)) for i in range(3))


def ease(t):
    return t * t * (3 - 2 * t)


def rounded_rect(d, box, radius, fill=None, outline=None, width=1):
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text_center(d, xy, text, fnt, fill):
    bbox = d.textbbox((0, 0), text, font=fnt)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text((xy[0] - tw / 2, xy[1] - th / 2 - bbox[1]), text, font=fnt, fill=fill)


def text_left(d, xy, text, fnt, fill):
    d.text(xy, text, font=fnt, fill=fill)


def new_canvas():
    img = Image.new("RGB", (W, H), BG)
    return img, ImageDraw.Draw(img, "RGBA")


def draw_chrome(d, tag, tag_color):
    rounded_rect(d, (0, 0, W, 58), 0, fill=NAVY_CHROME)
    text_left(d, (28, 16), "ARKA", F_TITLE, TEXT)
    tw = d.textbbox((0, 0), tag, font=F_TAG)
    box_w = (tw[2] - tw[0]) + 26
    rounded_rect(d, (W - box_w - 24, 15, W - 24, 43), 13, fill=tag_color)
    text_center(d, (W - box_w / 2 - 24, 29), tag, F_TAG, (10, 10, 14))


def draw_caption(d, text, sub=None):
    text_center(d, (W / 2, H - 62), text, F_CAPTION, TEXT)
    if sub:
        text_center(d, (W / 2, H - 32), sub, F_SUB, TEXT_SOFT)


def draw_attacker(d, pos, alpha=255):
    x, y = pos
    col = (RED[0], RED[1], RED[2], alpha)
    d.polygon([(x, y - 18), (x - 15, y + 13), (x + 15, y + 13)], fill=col)
    d.ellipse((x - 3, y - 5, x + 3, y + 1), fill=(10, 10, 14, alpha))
    text_center(d, (x, y + 28), "ATTACK", F_TAG, (RED[0], RED[1], RED[2], alpha))


def draw_operator(d, pos, label, active):
    x, y = pos
    col = TEAL if active else TEXT_SOFT
    d.ellipse((x - 13, y - 28, x + 13, y - 3), fill=col)
    d.polygon([(x - 17, y + 18), (x + 17, y + 18), (x + 13, y - 5), (x - 13, y - 5)], fill=col)
    text_center(d, (x, y + 32), label, F_SMALL, TEXT_SOFT)


def edge_point(box, side):
    x0, y0, x1, y1 = box
    if side == "left":
        return (x0, (y0 + y1) / 2)
    if side == "right":
        return (x1, (y0 + y1) / 2)
    if side == "top":
        return ((x0 + x1) / 2, y0)
    return ((x0 + x1) / 2, y1)


def draw_arrow(d, p1, p2, color, width=4, progress=1.0):
    x1, y1 = p1
    x2, y2 = p2
    ex = x1 + (x2 - x1) * progress
    ey = y1 + (y2 - y1) * progress
    d.line((x1, y1, ex, ey), fill=color, width=width)
    if progress >= 0.98:
        ang = math.atan2(ey - y1, ex - x1)
        s = 10
        d.polygon(
            [
                (ex, ey),
                (ex - s * math.cos(ang - 0.5), ey - s * math.sin(ang - 0.5)),
                (ex - s * math.cos(ang + 0.5), ey - s * math.sin(ang + 0.5)),
            ],
            fill=color,
        )


# ============================================================
# ACT 1: 2065 — one trust domain
# ============================================================

BOX_LABELS = ["Identity", "Accounts", "Payments", "Ledger", "Master Key"]
BOX_W, BOX_H = 178, 84
GRID_X0 = 128
GRID_Y = 268
GAP = 20
OUTER = (66, 170, GRID_X0 + 5 * BOX_W + 4 * GAP + 62, GRID_Y + BOX_H + 40)


def boxes_x(i):
    return GRID_X0 + i * (BOX_W + GAP)


def draw_act1(compromised_up_to=-1, attacker_alpha=0, breach_pulse=0.0):
    img, d = new_canvas()
    draw_chrome(d, "2065 · BEFORE", RED)
    outer_fill = lerp_color(SURFACE, RED_DIM, min(1, (compromised_up_to + 1) / 5)) if compromised_up_to >= 0 else SURFACE
    outer_line = RED if compromised_up_to >= 0 else BORDER
    rounded_rect(d, OUTER, 18, fill=outer_fill, outline=outer_line, width=2)
    text_center(d, (W / 2, 130), "ONE BANK. ONE TRUST DOMAIN. ONE MASTER KEY.", F_TITLE, TEXT)

    for i, label in enumerate(BOX_LABELS):
        x = boxes_x(i)
        box = (x, GRID_Y, x + BOX_W, GRID_Y + BOX_H)
        is_hit = i <= compromised_up_to
        fill = lerp_color(SURFACE, RED, 0.16) if is_hit else SURFACE
        outline = RED if is_hit else TEXT_SOFT
        rounded_rect(d, box, 12, fill=fill, outline=outline, width=3 if is_hit else 2)
        text_center(d, (x + BOX_W / 2, GRID_Y + BOX_H / 2 - 8), label, F_LABEL, RED if is_hit else TEXT)
        if is_hit:
            text_center(d, (x + BOX_W / 2, GRID_Y + BOX_H / 2 + 16), "BREACHED", F_TAG, RED)
        if i < 4:
            mid_y = GRID_Y + BOX_H / 2
            d.line((x + BOX_W, mid_y, x + BOX_W + GAP, mid_y), fill=TEXT_SOFT, width=2)

    if attacker_alpha > 0:
        draw_attacker(d, (boxes_x(0) - 52, GRID_Y + BOX_H / 2), attacker_alpha)
        if attacker_alpha > 60:
            draw_arrow(d, (boxes_x(0) - 30, GRID_Y + BOX_H / 2), (boxes_x(0) - 2, GRID_Y + BOX_H / 2), RED, width=3)

    if breach_pulse > 0:
        glow = int(50 * breach_pulse)
        d.rounded_rectangle(OUTER, radius=18, outline=(RED[0], RED[1], RED[2], glow), width=6)

    return img, d


def build_act1():
    img, d = draw_act1()
    draw_caption(d, "2065: every service shares one trust domain.", "No boundary anywhere inside the bank.")
    hold(img, 42)

    for i in range(20):
        img, d = draw_act1(attacker_alpha=int(255 * (i + 1) / 20))
        draw_caption(d, "One foothold gets in through Identity.")
        add(img)
    img, d = draw_act1(attacker_alpha=255)
    draw_caption(d, "One foothold gets in through Identity.")
    hold(img, 22)

    for hit in range(5):
        for i in range(9):
            img, d = draw_act1(compromised_up_to=hit, attacker_alpha=255, breach_pulse=(i % 4) / 4)
            draw_caption(d, "Nothing stops it from reaching the next service.", "Same network. Same trust. No wall anywhere.")
            add(img)

    img, d = draw_act1(compromised_up_to=4, attacker_alpha=255)
    draw_caption(d, "TOTAL COMPROMISE.", "One breach reached every account, every service, the Master Key.")
    hold(img, 62)


build_act1()

# ============================================================
# Transition card
# ============================================================


def build_transition():
    for i in range(22):
        t = ease(i / 21)
        img = Image.new("RGB", (W, H), lerp_color((32, 12, 12), BG, t))
        d = ImageDraw.Draw(img, "RGBA")
        text_center(d, (W / 2, H / 2 - 20), "ARKA REBUILDS THIS", F_TITLE, TEXT)
        if t > 0.5:
            text_center(d, (W / 2, H / 2 + 26), "so that class of disaster is structurally impossible.", F_SUB, TEAL_LIGHT)
        add(img)
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img, "RGBA")
    text_center(d, (W / 2, H / 2 - 20), "ARKA REBUILDS THIS", F_TITLE, TEXT)
    text_center(d, (W / 2, H / 2 + 26), "so that class of disaster is structurally impossible.", F_SUB, TEAL_LIGHT)
    hold(img, 34)


build_transition()

# ============================================================
# ACT 2: Arka — Cells, isolated
# ============================================================

GW = (W / 2 - 65, 96, W / 2 + 65, 146)
C1 = (108, 190, 476, 388)
C2 = (620, 190, 988, 388)
REC = (1028, 220, 1172, 340)
OP1 = (1050, 430)
OP2 = (1150, 430)
CUST1 = (55, 430)
CUST2 = (1090, 460)

CELL_SERVICES = ["Identity", "Payments", "Ledger"]


def draw_cell(d, box, label, state):
    x0, y0, x1, y1 = box
    if state == "normal":
        fill, outline, text_col = SURFACE, BORDER, TEXT
    elif state in ("compromised", "quarantined"):
        fill, outline, text_col = RED_DIM, RED, RED
    else:
        fill, outline, text_col = GREEN_DIM, GREEN, GREEN
    rounded_rect(d, box, 16, fill=fill, outline=outline, width=3)
    text_center(d, ((x0 + x1) / 2, y0 + 26), label, F_LABEL, text_col)

    sw = (x1 - x0 - 40) / 3
    for i, s in enumerate(CELL_SERVICES):
        sx0 = x0 + 20 + i * (sw + 5)
        sbox = (sx0, y0 + 52, sx0 + sw, y0 + 90)
        rounded_rect(d, sbox, 8, fill=SURFACE, outline=outline, width=1)
        text_center(d, ((sx0 + sx0 + sw) / 2, y0 + 71), s, F_SMALL, text_col)

    if state == "quarantined":
        for i in range(-6, int(x1 - x0), 16):
            d.line((x0 + i, y1 - 4, x0 + i + 10, y1 - 14), fill=(RED[0], RED[1], RED[2], 100), width=3)
        tag = "QUARANTINED, READ-ONLY"
        tw = d.textbbox((0, 0), tag, font=F_TAG)
        bw = tw[2] - tw[0] + 22
        rounded_rect(d, ((x0 + x1) / 2 - bw / 2, y1 - 34, (x0 + x1) / 2 + bw / 2, y1 - 10), 10, fill=RED)
        text_center(d, ((x0 + x1) / 2, y1 - 22), tag, F_TAG, (10, 10, 14))
    elif state == "restored":
        tag = "RESTORED"
        tw = d.textbbox((0, 0), tag, font=F_TAG)
        bw = tw[2] - tw[0] + 22
        rounded_rect(d, ((x0 + x1) / 2 - bw / 2, y1 - 34, (x0 + x1) / 2 + bw / 2, y1 - 10), 10, fill=GREEN)
        text_center(d, ((x0 + x1) / 2, y1 - 22), tag, F_TAG, (10, 10, 14))


def draw_act2(c1_state="normal", c2_state="normal", arrow=None, attacker_alpha=0, no_route_glow=0.0, ops_active=0):
    img, d = new_canvas()
    tag = {"normal": "NOW", "compromised": "ATTACK", "quarantined": "CONTAINED", "restored": "RECOVERED"}[c1_state]
    tag_color = RED if c1_state in ("compromised", "quarantined") else TEAL
    draw_chrome(d, tag, tag_color)

    rounded_rect(d, GW, 12, fill=SURFACE, outline=TEAL, width=2)
    text_center(d, ((GW[0] + GW[2]) / 2, (GW[1] + GW[3]) / 2), "GATEWAY", F_LABEL, TEXT)

    draw_cell(d, C1, "CELL 1", c1_state)
    draw_cell(d, C2, "CELL 2", c2_state)

    rounded_rect(d, REC, 14, fill=SURFACE, outline=TEAL, width=2)
    text_center(d, ((REC[0] + REC[2]) / 2, REC[1] + 26), "RECOVERY", F_LABEL, TEAL_LIGHT)
    text_center(d, ((REC[0] + REC[2]) / 2, REC[1] + 48), "control plane", F_SMALL, TEXT_SOFT)

    midx = (C1[2] + C2[0]) / 2
    midy = (C1[1] + C1[3]) / 2
    glow = int(130 + 100 * no_route_glow)
    d.line((C1[2] + 10, midy, C2[0] - 10, midy), fill=(TEXT_SOFT[0], TEXT_SOFT[1], TEXT_SOFT[2], 90), width=2)
    r = 15
    d.ellipse((midx - r, midy - r, midx + r, midy + r), fill=(RED[0], RED[1], RED[2], glow))
    text_center(d, (midx, midy), "X", F_LABEL, (10, 10, 14))
    text_center(d, (midx, midy + 24), "no route", F_SMALL, TEXT_SOFT)

    if ops_active:
        draw_operator(d, OP1, "operator A", ops_active >= 1)
        draw_operator(d, OP2, "operator B", ops_active >= 2)

    if attacker_alpha > 0:
        draw_attacker(d, (C1[0] - 42, (C1[1] + C1[3]) / 2), attacker_alpha)

    if arrow:
        p1, p2, color, prog, label, blocked = arrow["p1"], arrow["p2"], arrow["color"], arrow.get("progress", 1.0), arrow.get("label"), arrow.get("blocked", False)
        draw_arrow(d, p1, p2, color, width=4, progress=prog)
        if label and prog > 0.15:
            lx = p1[0] + (p2[0] - p1[0]) * 0.5
            ly = p1[1] + (p2[1] - p1[1]) * 0.5 - 16
            text_center(d, (lx, ly), label, F_TAG, color)
        if blocked and prog >= 0.98:
            bx, by = p2
            d.line((bx - 13, by - 13, bx + 13, by + 13), fill=RED, width=5)
            d.line((bx - 13, by + 13, bx + 13, by - 13), fill=RED, width=5)

    d.ellipse((CUST1[0] - 13, CUST1[1] - 13, CUST1[0] + 13, CUST1[1] + 13), fill=TEXT)
    text_center(d, (CUST1[0], CUST1[1] + 25), "alice", F_SMALL, TEXT_SOFT)
    d.ellipse((CUST2[0] - 13, CUST2[1] - 13, CUST2[0] + 13, CUST2[1] + 13), fill=TEXT)
    text_center(d, (CUST2[0], CUST2[1] + 25), "chandi", F_SMALL, TEXT_SOFT)

    return img, d


def arrow_sequence(state_kwargs, p1, p2, color, label=None, steps=16, hold_units=10, **kw):
    for i in range(steps):
        prog = ease((i + 1) / steps)
        img, d = draw_act2(arrow={"p1": p1, "p2": p2, "color": color, "progress": prog, "label": label, **kw}, **state_kwargs)
        add(img)
    img, d = draw_act2(arrow={"p1": p1, "p2": p2, "color": color, "progress": 1.0, "label": label, **kw}, **state_kwargs)
    hold(img, hold_units)


def build_act2():
    img, d = draw_act2()
    draw_caption(d, "Arka: two Cells, no shared network, no shared trust.")
    hold(img, 40)

    arrow_sequence(
        {},
        (CUST1[0] + 16, CUST1[1] - 8),
        edge_point(C1, "left"),
        TEAL,
        label="transfer",
        steps=16,
        hold_units=16,
    )
    img, d = draw_act2()
    draw_caption(d, "A normal transfer lands in Cell 1. Business as usual.")
    hold(img, 30)

    for i in range(20):
        img, d = draw_act2(c1_state="normal", attacker_alpha=int(255 * (i + 1) / 20))
        draw_caption(d, "Cell 1 is now suspected compromised.")
        add(img)
    img, d = draw_act2(c1_state="compromised", attacker_alpha=255)
    draw_caption(d, "Cell 1 is now suspected compromised.")
    hold(img, 32)

    for i in range(18):
        img, d = draw_act2(c1_state="compromised", c2_state="normal", attacker_alpha=255, no_route_glow=(i % 6) / 6)
        draw_caption(d, "It cannot reach Cell 2.", "There is no route between them. Not a rule. A missing wire.")
        add(img)
    hold(img, 30)

    img, d = draw_act2(c1_state="compromised", c2_state="normal", ops_active=1)
    draw_caption(d, "Operator A requests quarantine.")
    hold(img, 28)
    img, d = draw_act2(c1_state="compromised", c2_state="normal", ops_active=2)
    draw_caption(d, "Operator B approves.", "Dual approval: a different person, never the same one alone.")
    hold(img, 36)

    for i in range(14):
        quarantined_now = i > 6
        img, d = draw_act2(c1_state="quarantined" if quarantined_now else "compromised", c2_state="normal", ops_active=2)
        draw_caption(d, "Cell 1 is quarantined. Read-only." if quarantined_now else "Quarantine applied.")
        add(img)
    img, d = draw_act2(c1_state="quarantined", c2_state="normal")
    draw_caption(d, "Cell 1 is quarantined. Read-only.")
    hold(img, 32)

    arrow_sequence(
        {"c1_state": "quarantined", "c2_state": "normal"},
        (CUST1[0] + 16, CUST1[1] - 8),
        edge_point(C1, "left"),
        RED,
        label="transfer",
        blocked=True,
        steps=18,
        hold_units=26,
    )
    img, d = draw_act2(c1_state="quarantined", c2_state="normal")
    draw_caption(d, "REJECTED. 403 CELL_QUARANTINED.", "Blocked by construction, not by luck.")
    hold(img, 44)

    arrow_sequence(
        {"c1_state": "quarantined", "c2_state": "normal"},
        (CUST2[0] - 16, CUST2[1] - 8),
        edge_point(C2, "right"),
        GREEN,
        label="transfer",
        steps=16,
        hold_units=18,
    )
    img, d = draw_act2(c1_state="quarantined", c2_state="normal")
    draw_caption(d, "Cell 2 keeps serving the whole time.", "chandi's transfer succeeds. She never knew anything happened.")
    hold(img, 46)

    img, d = draw_act2(c1_state="quarantined", c2_state="normal", ops_active=2)
    draw_caption(d, "Operators lift the quarantine.", "Dual approval again.")
    hold(img, 32)

    for i in range(14):
        restored_now = i > 6
        img, d = draw_act2(c1_state="restored" if restored_now else "quarantined", c2_state="normal")
        draw_caption(d, "Cell 1 is restored." if restored_now else "Lifting quarantine.")
        add(img)
    img, d = draw_act2(c1_state="restored", c2_state="normal")
    draw_caption(d, "Cell 1 is restored.")
    hold(img, 26)

    arrow_sequence(
        {"c1_state": "restored", "c2_state": "normal"},
        (CUST1[0] + 16, CUST1[1] - 8),
        edge_point(C1, "left"),
        GREEN,
        label="transfer",
        steps=16,
        hold_units=14,
    )
    img, d = draw_act2(c1_state="restored", c2_state="normal")
    draw_caption(d, "It works again.", "One Cell was hit. Zero customers lost. Nothing spread.")
    hold(img, 58)


build_act2()

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img, "RGBA")
text_center(d, (W / 2, H / 2 - 30), "BANKING THAT SURVIVES.", F_TITLE, TEXT)
text_center(d, (W / 2, H / 2 + 16), "Blast radius stops being luck. It becomes a design parameter.", F_SUB, TEAL_LIGHT)
hold(img, 56)

print(f"total frames: {len(frames)}, total duration: {sum(durations) / 1000:.1f}s")
frames[0].save(
    OUT_PATH,
    save_all=True,
    append_images=frames[1:],
    duration=durations,
    loop=0,
    optimize=True,
)
print(f"wrote {OUT_PATH}")
