"""
Animated architecture sequence: how the 2065 collapse happened, and how
Arka contains the same kind of attack today. Drawn frame by frame with
Pillow (boxes, lines, text: no external assets, nothing traced or copied),
using Arka's own real brand colors from packages/ui/src/tokens.css, then
saved as an animated GIF directly by Pillow.

Run: python architecture_sequence.py
Output: ../architecture.gif (relative to this script's docs/media/scripts/)
"""

from PIL import Image, ImageDraw, ImageFont
import math
import os

W, H = 1200, 700
OUT_DIR = os.path.join(os.path.dirname(__file__), "..")
OUT_PATH = os.path.join(OUT_DIR, "architecture.gif")

# Real Arka token values (packages/ui/src/tokens.css)
NAVY = (11, 44, 77)
NAVY_DEEP = (7, 29, 51)
TEAL = (14, 148, 136)
TEAL_LIGHT = (94, 234, 212)
INK = (16, 24, 40)
INK_SOFT = (102, 112, 133)
BG = (245, 247, 250)
CARD = (255, 255, 255)
LINE = (231, 235, 240)
RED = (217, 45, 32)
RED_TINT = (254, 228, 226)
GREEN = (18, 183, 106)
GREEN_TINT = (209, 250, 223)
AMBER = (180, 83, 9)
AMBER_TINT = (254, 240, 199)

FONT_DIR = "C:/Windows/Fonts"


def font(path, size):
    return ImageFont.truetype(os.path.join(FONT_DIR, path), size)


F_TITLE = font("arialbd.ttf", 34)
F_CAPTION = font("arialbd.ttf", 22)
F_SUB = font("arial.ttf", 17)
F_LABEL = font("arialbd.ttf", 15)
F_SMALL = font("arial.ttf", 14)
F_TAG = font("arialbd.ttf", 13)

frames = []
durations = []
BASE_MS = 42


def add(img, ms=BASE_MS):
    frames.append(img)
    durations.append(ms)


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_color(c1, c2, t):
    return tuple(int(lerp(c1[i], c2[i], t)) for i in range(3))


def ease(t):
    return t * t * (3 - 2 * t)  # smoothstep


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


def draw_chrome(d, title, tag, tag_color):
    rounded_rect(d, (0, 0, W, 64), 0, fill=NAVY)
    text_left(d, (28, 20), "ARKA", F_TITLE, (255, 255, 255))
    tw = d.textbbox((0, 0), tag, font=F_TAG)
    box_w = (tw[2] - tw[0]) + 24
    rounded_rect(d, (W - box_w - 24, 18, W - 24, 46), 13, fill=tag_color)
    text_center(d, (W - box_w / 2 - 24, 32), tag, F_TAG, (255, 255, 255))


def draw_caption(d, text, sub=None):
    text_center(d, (W / 2, H - 58), text, F_CAPTION, INK)
    if sub:
        text_center(d, (W / 2, H - 30), sub, F_SUB, INK_SOFT)


def draw_attacker(d, pos, alpha=255):
    x, y = pos
    col = (RED[0], RED[1], RED[2], alpha)
    d.polygon(
        [(x, y - 20), (x - 16, y + 14), (x + 16, y + 14)],
        fill=col,
    )
    d.ellipse((x - 3, y - 6, x + 3, y), fill=(255, 255, 255, alpha))
    text_center(d, (x, y + 30), "ATTACK", F_TAG, (RED[0], RED[1], RED[2], alpha))


def draw_operator(d, pos, label, color=NAVY):
    x, y = pos
    d.ellipse((x - 14, y - 30, x + 14, y - 2), fill=color)
    d.polygon([(x - 18, y + 20), (x + 18, y + 20), (x + 14, y - 4), (x - 14, y - 4)], fill=color)
    text_center(d, (x, y + 36), label, F_SMALL, INK_SOFT)


def draw_arrow(d, p1, p2, color, width=3, progress=1.0, dashed=False):
    x1, y1 = p1
    x2, y2 = p2
    ex = x1 + (x2 - x1) * progress
    ey = y1 + (y2 - y1) * progress
    if dashed:
        seg = 10
        dist = math.hypot(ex - x1, ey - y1)
        steps = max(1, int(dist / seg))
        for i in range(0, steps, 2):
            t0 = i / steps
            t1 = min(1, (i + 1) / steps)
            d.line(
                (x1 + (ex - x1) * t0, y1 + (ey - y1) * t0, x1 + (ex - x1) * t1, y1 + (ey - y1) * t1),
                fill=color,
                width=width,
            )
    else:
        d.line((x1, y1, ex, ey), fill=color, width=width)
    if progress >= 0.98:
        ang = math.atan2(ey - y1, ex - x1)
        s = 9
        d.polygon(
            [
                (ex, ey),
                (ex - s * math.cos(ang - 0.5), ey - s * math.sin(ang - 0.5)),
                (ex - s * math.cos(ang + 0.5), ey - s * math.sin(ang + 0.5)),
            ],
            fill=color,
        )


def hold(img, n):
    # One frame with duration n * BASE_MS, not n duplicate frames: Pillow's
    # GIF encoder can merge pixel-identical consecutive frames when saving
    # with optimize=True, which silently drops the intended pause if the
    # pause is built from repeated frames instead of one longer one.
    add(img.copy(), ms=n * BASE_MS)


# ============================================================
# ACT 1: 2065 — one trust domain
# ============================================================

BOX_LABELS = ["Identity", "Accounts", "Payments", "Ledger", "Master Key"]
BOX_W, BOX_H = 176, 90
GRID_X0 = 130
GRID_Y = 300
GAP = 22


def act1_boxes_x(i):
    return GRID_X0 + i * (BOX_W + GAP)


def draw_act1(compromised_up_to=-1, attacker_alpha=0, breach_pulse=0.0):
    img, d = new_canvas()
    draw_chrome(d, "2065", "BEFORE", RED)
    outer = (70, 190, act1_boxes_x(4) + BOX_W + 40, GRID_Y + BOX_H + 40)
    outer_fill = lerp_color(CARD, RED_TINT, min(1, (compromised_up_to + 1) / 5)) if compromised_up_to >= 0 else CARD
    rounded_rect(d, outer, 18, fill=outer_fill, outline=LINE, width=2)
    text_center(d, (W / 2, 160), "ONE BANK. ONE TRUST DOMAIN. ONE MASTER KEY.", F_TITLE, INK)

    for i, label in enumerate(BOX_LABELS):
        x = act1_boxes_x(i)
        box = (x, GRID_Y, x + BOX_W, GRID_Y + BOX_H)
        is_hit = i <= compromised_up_to
        fill = lerp_color(CARD, RED, 0.12) if is_hit else CARD
        outline = RED if is_hit else NAVY
        rounded_rect(d, box, 12, fill=fill, outline=outline, width=3 if is_hit else 2)
        text_center(d, (x + BOX_W / 2, GRID_Y + BOX_H / 2 - 6), label, F_LABEL, RED if is_hit else INK)
        if is_hit:
            text_center(d, (x + BOX_W / 2, GRID_Y + BOX_H / 2 + 18), "BREACHED", F_TAG, RED)
        if i < 4:
            mid_y = GRID_Y + BOX_H / 2
            d.line((x + BOX_W, mid_y, x + BOX_W + GAP, mid_y), fill=INK_SOFT, width=2)

    if attacker_alpha > 0:
        draw_attacker(d, (act1_boxes_x(0) - 55, GRID_Y + BOX_H / 2), attacker_alpha)
        if attacker_alpha > 60:
            draw_arrow(d, (act1_boxes_x(0) - 32, GRID_Y + BOX_H / 2), (act1_boxes_x(0) - 2, GRID_Y + BOX_H / 2), RED, width=3)

    if breach_pulse > 0:
        glow = int(40 * breach_pulse)
        d.rounded_rectangle(outer, radius=18, outline=(RED[0], RED[1], RED[2], glow), width=6)

    return img, d


def build_act1():
    # establish
    img, d = draw_act1()
    draw_caption(d, "2065: every service shares one trust domain.", "No boundary anywhere inside the bank.")
    hold(img, 22)

    # attacker approaches
    for i in range(14):
        img, d = draw_act1(attacker_alpha=int(255 * (i + 1) / 14))
        draw_caption(d, "One foothold gets in through Identity.")
        add(img)

    img, d = draw_act1(attacker_alpha=255)
    draw_caption(d, "One foothold gets in through Identity.")
    hold(img, 10)

    # spread sequentially through all boxes (no isolation = no boundary to stop it)
    for hit in range(5):
        for i in range(6):
            img, d = draw_act1(compromised_up_to=hit, attacker_alpha=255, breach_pulse=(i % 3) / 3)
            draw_caption(d, "Nothing stops it from reaching the next service.", "Same network. Same trust. No wall anywhere.")
            add(img)

    img, d = draw_act1(compromised_up_to=4, attacker_alpha=255)
    draw_caption(d, "TOTAL COMPROMISE.", "One breach reached every account, every service, the Master Key.")
    hold(img, 34)


build_act1()

# ============================================================
# Transition card
# ============================================================


def build_transition():
    for i in range(16):
        t = ease(i / 15)
        img = Image.new("RGB", (W, H), lerp_color((30, 10, 10), NAVY, t))
        d = ImageDraw.Draw(img, "RGBA")
        text_center(d, (W / 2, H / 2 - 20), "ARKA REBUILDS THIS", F_TITLE, (255, 255, 255))
        if t > 0.5:
            text_center(d, (W / 2, H / 2 + 24), "so that class of disaster is structurally impossible.", F_SUB, TEAL_LIGHT)
        add(img)
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img, "RGBA")
    text_center(d, (W / 2, H / 2 - 20), "ARKA REBUILDS THIS", F_TITLE, (255, 255, 255))
    text_center(d, (W / 2, H / 2 + 24), "so that class of disaster is structurally impossible.", F_SUB, TEAL_LIGHT)
    hold(img, 26)


build_transition()

# ============================================================
# ACT 2: Arka — Cells, isolated
# ============================================================

GW = (W / 2 - 60, 120, W / 2 + 60, 172)
C1 = (110, 220, 470, 430)
C2 = (610, 220, 970, 430)
REC = (1010, 260, 1170, 400)
OP1 = (1040, 470)
OP2 = (1140, 470)
CUST1 = (60, 480)
CUST2 = (1080, 500)

CELL_SERVICES = ["Identity", "Payments", "Ledger"]


def draw_cell(d, box, label, state, services=True):
    # state: 'normal' | 'compromised' | 'quarantined' | 'restored'
    x0, y0, x1, y1 = box
    if state == "normal":
        fill, outline, text_col = CARD, NAVY, INK
    elif state == "compromised":
        fill, outline, text_col = RED_TINT, RED, RED
    elif state == "quarantined":
        fill, outline, text_col = RED_TINT, RED, RED
    else:
        fill, outline, text_col = GREEN_TINT, GREEN, GREEN
    rounded_rect(d, box, 16, fill=fill, outline=outline, width=3)
    text_center(d, ((x0 + x1) / 2, y0 + 24), label, F_LABEL, text_col)

    if services:
        sw = (x1 - x0 - 40) / 3
        for i, s in enumerate(CELL_SERVICES):
            sx0 = x0 + 20 + i * (sw + 5)
            sbox = (sx0, y0 + 48, sx0 + sw, y0 + 88)
            rounded_rect(d, sbox, 8, fill=CARD if state != "compromised" else (255, 255, 255, 90), outline=outline, width=1)
            text_center(d, ((sx0 + sx0 + sw) / 2, y0 + 68), s, F_SMALL, text_col)

    if state == "quarantined":
        for i in range(-6, int(x1 - x0), 16):
            d.line((x0 + i, y1 - 4, x0 + i + 10, y1 - 14), fill=(RED[0], RED[1], RED[2], 90), width=3)
        tag = "QUARANTINED, READ-ONLY"
        tw = d.textbbox((0, 0), tag, font=F_TAG)
        bw = tw[2] - tw[0] + 20
        rounded_rect(d, ((x0 + x1) / 2 - bw / 2, y1 - 32, (x0 + x1) / 2 + bw / 2, y1 - 10), 10, fill=RED)
        text_center(d, ((x0 + x1) / 2, y1 - 21), tag, F_TAG, (255, 255, 255))
    elif state == "restored":
        tag = "RESTORED"
        tw = d.textbbox((0, 0), tag, font=F_TAG)
        bw = tw[2] - tw[0] + 20
        rounded_rect(d, ((x0 + x1) / 2 - bw / 2, y1 - 32, (x0 + x1) / 2 + bw / 2, y1 - 10), 10, fill=GREEN)
        text_center(d, ((x0 + x1) / 2, y1 - 21), tag, F_TAG, (255, 255, 255))


def draw_act2(c1_state="normal", c2_state="normal", arrows=(), attacker_alpha=0, no_route_glow=0.0, ops_active=0):
    img, d = new_canvas()
    tag_color = RED if c1_state in ("compromised", "quarantined") else NAVY
    tag = {"normal": "NOW", "compromised": "ATTACK", "quarantined": "CONTAINED", "restored": "RECOVERED"}[c1_state]
    draw_chrome(d, "Arka", tag, tag_color)

    rounded_rect(d, GW, 12, fill=NAVY)
    text_center(d, ((GW[0] + GW[2]) / 2, (GW[1] + GW[3]) / 2), "GATEWAY", F_LABEL, (255, 255, 255))

    draw_cell(d, C1, "CELL 1", c1_state)
    draw_cell(d, C2, "CELL 2", c2_state)

    rounded_rect(d, REC, 14, fill=CARD, outline=TEAL, width=3)
    text_center(d, ((REC[0] + REC[2]) / 2, REC[1] + 24), "RECOVERY", F_LABEL, TEAL)
    text_center(d, ((REC[0] + REC[2]) / 2, REC[1] + 46), "control plane", F_SMALL, INK_SOFT)

    # no-route mark between cells
    midx = (C1[2] + C2[0]) / 2
    midy = (C1[1] + C1[3]) / 2
    glow = int(120 + 100 * no_route_glow)
    d.line((C1[2] + 10, midy, C2[0] - 10, midy), fill=(INK_SOFT[0], INK_SOFT[1], INK_SOFT[2], 120), width=2)
    r = 16
    d.ellipse((midx - r, midy - r, midx + r, midy + r), fill=(RED[0], RED[1], RED[2], glow))
    text_center(d, (midx, midy), "X", F_LABEL, (255, 255, 255))
    text_center(d, (midx, midy + 26), "no route", F_SMALL, INK_SOFT)

    if ops_active:
        draw_operator(d, OP1, "operator A", NAVY if ops_active >= 1 else INK_SOFT)
        draw_operator(d, OP2, "operator B", NAVY if ops_active >= 2 else INK_SOFT)

    if attacker_alpha > 0:
        draw_attacker(d, (C1[0] - 45, (C1[1] + C1[3]) / 2), attacker_alpha)

    for a in arrows:
        p1, p2, color, prog, label = a["p1"], a["p2"], a["color"], a.get("progress", 1.0), a.get("label")
        dashed = a.get("dashed", False)
        blocked = a.get("blocked", False)
        draw_arrow(d, p1, p2, color, width=3, progress=prog, dashed=dashed)
        if label and prog > 0.3:
            lx = p1[0] + (p2[0] - p1[0]) * min(prog, 0.5)
            ly = p1[1] + (p2[1] - p1[1]) * min(prog, 0.5) - 14
            text_center(d, (lx, ly), label, F_TAG, color)
        if blocked and prog >= 0.98:
            bx, by = p2
            d.line((bx - 12, by - 12, bx + 12, by + 12), fill=RED, width=4)
            d.line((bx - 12, by + 12, bx + 12, by - 12), fill=RED, width=4)

    # customer dots
    d.ellipse((CUST1[0] - 14, CUST1[1] - 14, CUST1[0] + 14, CUST1[1] + 14), fill=NAVY)
    text_center(d, (CUST1[0], CUST1[1] + 26), "alice", F_SMALL, INK_SOFT)
    d.ellipse((CUST2[0] - 14, CUST2[1] - 14, CUST2[0] + 14, CUST2[1] + 14), fill=NAVY)
    text_center(d, (CUST2[0], CUST2[1] + 26), "chandi", F_SMALL, INK_SOFT)

    return img, d


def arrow_sequence(build_state_fn, p1, p2, color, label=None, steps=10, hold_frames=14, **kw):
    for i in range(steps):
        prog = ease((i + 1) / steps)
        img, d = build_state_fn(arrows=[{"p1": p1, "p2": p2, "color": color, "progress": prog, "label": label, **kw}])
        add(img)
    img, d = build_state_fn(arrows=[{"p1": p1, "p2": p2, "color": color, "progress": 1.0, "label": label, **kw}])
    hold(img, hold_frames)


def build_act2():
    gw_mid = ((GW[0] + GW[2]) / 2, GW[3])
    c1_top = ((C1[0] + C1[2]) / 2, C1[1])
    c1_side = (C1[0], (C1[1] + C1[3]) / 2)
    c2_top = ((C2[0] + C2[2]) / 2, C2[1])
    rec_left = (REC[0], (REC[1] + REC[3]) / 2)

    def base(**kw):
        return draw_act2(**kw)

    img, d = draw_act2()
    draw_caption(d, "Arka: two Cells, no shared network, no shared trust.")
    hold(img, 22)

    # normal transfer to cell1
    arrow_sequence(
        lambda **kw: draw_act2(**kw),
        (CUST1[0] + 16, CUST1[1] - 8),
        (gw_mid[0] - 100, gw_mid[1] - 40),
        TEAL,
        label="transfer",
    )
    arrow_sequence(lambda **kw: draw_act2(**kw), gw_mid, c1_top, TEAL, label=None, steps=6, hold_frames=10)
    img, d = draw_act2()
    draw_caption(d, "A normal transfer lands in Cell 1. Business as usual.")
    hold(img, 16)

    # attacker hits cell 1
    for i in range(14):
        img, d = draw_act2(c1_state="normal", attacker_alpha=int(255 * (i + 1) / 14))
        draw_caption(d, "Cell 1 is now suspected compromised.")
        add(img)
    img, d = draw_act2(c1_state="compromised", attacker_alpha=255)
    draw_caption(d, "Cell 1 is now suspected compromised.")
    hold(img, 18)

    # boundary holds
    for i in range(10):
        img, d = draw_act2(c1_state="compromised", c2_state="normal", attacker_alpha=255, no_route_glow=(i % 5) / 5)
        draw_caption(d, "It cannot reach Cell 2.", "There is no route between them. Not a rule. A missing wire.")
        add(img)
    hold(img, 16)

    # dual approval quarantine
    img, d = draw_act2(c1_state="compromised", c2_state="normal", ops_active=1)
    draw_caption(d, "Operator A requests quarantine.")
    hold(img, 16)
    img, d = draw_act2(c1_state="compromised", c2_state="normal", ops_active=2)
    draw_caption(d, "Operator B approves. Dual approval, a different person, never the same one alone.")
    hold(img, 20)

    for i in range(10):
        img, d = draw_act2(c1_state="quarantined" if i > 4 else "compromised", c2_state="normal", ops_active=2)
        draw_caption(d, "Cell 1 is quarantined. Read-only.")
        add(img)
    img, d = draw_act2(c1_state="quarantined", c2_state="normal")
    draw_caption(d, "Cell 1 is quarantined. Read-only.")
    hold(img, 20)

    # blocked write
    arrow_sequence(
        lambda **kw: draw_act2(c1_state="quarantined", c2_state="normal", **kw),
        (CUST1[0] + 16, CUST1[1] - 8),
        (C1[0] + 60, C1[1] - 6),
        RED,
        label="transfer",
        blocked=True,
        steps=12,
        hold_frames=22,
    )
    img, d = draw_act2(c1_state="quarantined", c2_state="normal")
    draw_caption(d, "REJECTED. 403 CELL_QUARANTINED.", "Blocked by construction, not by luck.")
    hold(img, 24)

    # cell2 keeps working
    arrow_sequence(
        lambda **kw: draw_act2(c1_state="quarantined", c2_state="normal", **kw),
        (CUST2[0] - 16, CUST2[1] - 8),
        (C2[0] + (C2[2] - C2[0]) - 60, C2[1] - 6),
        GREEN,
        label="transfer",
        steps=10,
        hold_frames=6,
    )
    img, d = draw_act2(c1_state="quarantined", c2_state="normal")
    draw_caption(d, "Cell 2 keeps serving the whole time.", "chandi's transfer succeeds. She never knew anything happened.")
    hold(img, 26)

    # lift
    img, d = draw_act2(c1_state="quarantined", c2_state="normal", ops_active=2)
    draw_caption(d, "Operators lift the quarantine. Dual approval again.")
    hold(img, 18)

    for i in range(10):
        img, d = draw_act2(c1_state="restored" if i > 4 else "quarantined", c2_state="normal")
        draw_caption(d, "Cell 1 is restored.")
        add(img)
    img, d = draw_act2(c1_state="restored", c2_state="normal")
    draw_caption(d, "Cell 1 is restored.")
    hold(img, 16)

    arrow_sequence(
        lambda **kw: draw_act2(c1_state="restored", c2_state="normal", **kw),
        (CUST1[0] + 16, CUST1[1] - 8),
        (C1[0] + 60, C1[1] - 6),
        GREEN,
        label="transfer",
        steps=10,
        hold_frames=14,
    )
    img, d = draw_act2(c1_state="restored", c2_state="normal")
    draw_caption(d, "It works again.", "One Cell was hit. Zero customers lost. Nothing spread.")
    hold(img, 34)


build_act2()

# Final card
img = Image.new("RGB", (W, H), NAVY)
d = ImageDraw.Draw(img, "RGBA")
text_center(d, (W / 2, H / 2 - 30), "BANKING THAT SURVIVES.", F_TITLE, (255, 255, 255))
text_center(d, (W / 2, H / 2 + 14), "Blast radius stops being luck. It becomes a design parameter.", F_SUB, TEAL_LIGHT)
hold(img, 34)

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
