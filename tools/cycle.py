"""Build the hero atlas from one base sprite plus two stride poses (all already pixelized).

The upper body always comes from the base, so only the legs swap and nothing jitters.
Frames: idle, idle-breathe, stride A, passing, stride B, passing.

usage: cycle.py base.png stride_a.png stride_b.png out.png
"""
import sys
import numpy as np
from PIL import Image

HIP = 0.6  # rows above this fraction of the base height are the locked upper body


def load(p):
    return np.array(Image.open(p).convert("RGBA")).astype(np.int32)


def place(canvas, img, x, y):
    h, w = img.shape[:2]
    H, W = canvas.shape[:2]
    x0, y0 = max(x, 0), max(y, 0)
    x1, y1 = min(x + w, W), min(y + h, H)
    src = img[y0 - y: y1 - y, x0 - x: x1 - x]
    m = src[:, :, 3] > 0
    canvas[y0:y1, x0:x1][m] = src[m]


def register(base, s, hip):
    """Offset of s (bottom-aligned, centered) that best matches the base's upper body."""
    best, bo = None, (0, 0)
    for dy in range(-6, 7):
        for dx in range(-8, 9):
            c = np.zeros((base.shape[0] + 30, base.shape[1] + 40, 4), np.int32)
            place(c, s, 20 + (base.shape[1] - s.shape[1]) // 2 + dx, 15 + base.shape[0] - s.shape[0] + dy)
            win = c[15: 15 + hip, 20: 20 + base.shape[1]]
            ref = base[:hip]
            a1, a2 = win[:, :, 3] > 0, ref[:, :, 3] > 0
            cost = (a1 != a2).sum() * 300 + np.abs(win[:, :, :3] - ref[:, :, :3])[a1 & a2].sum() / 3
            if best is None or cost < best:
                best, bo = cost, (dx, dy)
    return bo


def main():
    base, sa, sb = (load(p) for p in sys.argv[1:4])
    H, W = base.shape[:2]
    hip = int(H * HIP)
    pad, top = 8, 2
    CW, CH = W + pad * 2, H + top + 4
    upper = base.copy()
    upper[hip:] = 0
    lower = base.copy()
    lower[:hip] = 0

    def frame(legs, legs_xy, body_dy):
        c = np.zeros((CH, CW, 4), np.int32)
        place(c, legs, *legs_xy)
        place(c, upper, pad, top + body_dy)
        return c

    base_xy = (pad, top)
    frames = [frame(lower, base_xy, 0), frame(lower, base_xy, 1)]
    for s in (sa, sb):
        dx, dy = register(base, s, hip)
        legs = s.copy()
        oy = top + H - s.shape[0] + dy
        legs[: max(0, hip - (oy - top))] = 0
        stride = frame(legs, (pad + (W - s.shape[1]) // 2 + dx, oy), 1)
        frames += [stride, frame(lower, base_xy, 0)]
        print(f"stride offset dx={dx} dy={dy}")
    atlas = np.concatenate(frames, axis=1).astype(np.uint8)
    Image.fromarray(atlas).save(sys.argv[4])
    print(f"{sys.argv[4]}: {len(frames)} frames, cell {CW}x{CH}")


if __name__ == "__main__":
    main()
