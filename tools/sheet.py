"""Cut an AI sprite sheet into an equal-cell pixel atlas strip, one shared pixel grid for every frame.

usage: sheet.py sheet.png out.png --rows 4,6 --h 52
"""
import sys
import numpy as np
from PIL import Image


def runs(mask, gap):
    idx = np.where(mask)[0]
    segs, start, prev = [], idx[0], idx[0]
    for i in idx[1:]:
        if i - prev > gap:
            segs.append((start, prev + 1))
            start = i
        prev = i
    segs.append((start, prev + 1))
    return segs


def biggest(segs, n):
    return sorted(sorted(segs, key=lambda s: s[1] - s[0], reverse=True)[:n])


def downsample(f, k):
    h, w = f.shape[:2]
    H, W = int(np.ceil(h / k)), int(np.ceil(w / k))
    out = np.zeros((H, W, 4), np.uint8)
    for j in range(H):
        # Grid anchored at the feet so every frame shares a baseline.
        y1 = h - j * k
        y0 = y1 - k
        for i in range(W):
            x0 = i * k
            ya, yb = int(max(y0 + k * 0.25, 0)), int(max(y1 - k * 0.25, 1))
            xa, xb = int(x0 + k * 0.25), int(min(x0 + k * 0.75, w))
            if xb <= xa or yb <= ya:
                continue
            out[H - 1 - j, i] = np.median(f[ya:yb, xa:xb].reshape(-1, 4), axis=0)
    out[:, :, 3] = np.where(out[:, :, 3] > 110, 255, 0)
    return out


def main():
    src, dst = sys.argv[1], sys.argv[2]
    rows = [int(n) for n in sys.argv[sys.argv.index("--rows") + 1].split(",")]
    target = int(sys.argv[sys.argv.index("--h") + 1])
    a = np.array(Image.open(src).convert("RGBA"))
    alpha = a[:, :, 3] > 40
    frames = []
    for (y0, y1), n in zip(biggest(runs(alpha.any(axis=1), 16), len(rows)), rows):
        cols = biggest(runs(alpha[y0:y1].any(axis=0), 6), n)
        if len(cols) != n:
            sys.exit(f"row {y0}-{y1}: found {len(cols)} frames, expected {n}")
        for x0, x1 in cols:
            ys = np.where(alpha[y0:y1, x0:x1].any(axis=1))[0]
            frames.append(a[y0 + ys[0]: y0 + ys[-1] + 1, x0:x1])
    k = max(f.shape[0] for f in frames[: rows[0]]) / target
    small = [downsample(f, k) for f in frames]

    def center(f):
        top = f[: max(1, int(f.shape[0] * 0.6)), :, 3] > 0
        return np.where(top)[1].mean()

    cx = [center(f) for f in small]
    half = int(np.ceil(max(max(c, f.shape[1] - c) for c, f in zip(cx, small)))) + 1
    cw, ch = half * 2, max(f.shape[0] for f in small) + 1
    atlas = np.zeros((ch, cw * len(small), 4), np.uint8)
    for i, (f, c) in enumerate(zip(small, cx)):
        ox = i * cw + half - int(round(c))
        atlas[ch - f.shape[0]:, ox: ox + f.shape[1]] = np.maximum(atlas[ch - f.shape[0]:, ox: ox + f.shape[1]], f)
    Image.fromarray(atlas).save(dst)
    print(f"{dst}: {len(small)} frames, cell {cw}x{ch}, block {k:.2f}")


if __name__ == "__main__":
    main()
