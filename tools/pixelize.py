"""Snap AI-generated 'pixel art' back onto its true pixel grid.

usage: pixelize.py in.png out.png [--opaque] [--size WIDTH | --h HEIGHT]
"""
import sys
import numpy as np
from PIL import Image


def edge_signal(rgb, axis):
    d = np.abs(np.diff(rgb, axis=axis)).sum(axis=2)
    return d.sum(axis=1 - axis)


def best_grid(sig):
    s = sig - sig.mean()
    n = len(s)
    ac = np.array([np.dot(s[:-l], s[l:]) / (n - l) for l in range(1, min(120, n // 3))])
    cand = [l for l in range(4, len(ac)) if ac[l - 1] > ac[l - 2] and ac[l - 1] >= ac[l]]
    if not cand:
        return None
    top = max(ac[l - 1] for l in cand)
    k0 = next(l for l in cand if ac[l - 1] > 0.5 * top)
    best = (-1, k0, 0)
    for k in np.arange(k0 - 1.0, k0 + 1.0, 0.02):
        for ph in np.arange(0, k, 0.5):
            idx = np.round(np.arange(ph, n - 1, k)).astype(int)
            idx = idx[idx < n]
            score = sig[idx].mean()
            if score > best[0]:
                best = (score, k, ph)
    return best[1], best[2]


def sample(img, kx, px, ky, py):
    h, w = img.shape[:2]
    xs = np.arange(px - kx, w, kx)
    ys = np.arange(py - ky, h, ky)
    out = np.zeros((len(ys) - 1, len(xs) - 1, img.shape[2]), np.uint8)
    for j in range(len(ys) - 1):
        for i in range(len(xs) - 1):
            x0, x1 = xs[i] + kx * 0.25, xs[i + 1] - kx * 0.25
            y0, y1 = ys[j] + ky * 0.25, ys[j + 1] - ky * 0.25
            x0, y0 = max(int(x0), 0), max(int(y0), 0)
            x1, y1 = min(max(int(x1), x0 + 1), w), min(max(int(y1), y0 + 1), h)
            if x0 >= w or y0 >= h:
                continue
            out[j, i] = np.median(img[y0:y1, x0:x1].reshape(-1, img.shape[2]), axis=0)
    return out


def main():
    src, dst = sys.argv[1], sys.argv[2]
    opaque = "--opaque" in sys.argv
    size = int(sys.argv[sys.argv.index("--size") + 1]) if "--size" in sys.argv else None
    tall = int(sys.argv[sys.argv.index("--h") + 1]) if "--h" in sys.argv else None
    im = Image.open(src).convert("RGBA")
    a = np.array(im)
    if not opaque:
        ys, xs = np.where(a[:, :, 3] > 40)
        a = a[max(ys.min() - 4, 0): ys.max() + 5, max(xs.min() - 4, 0): xs.max() + 5]
    rgb = a[:, :, :3].astype(np.int32)
    gx, gy = best_grid(edge_signal(rgb, 1)), best_grid(edge_signal(rgb, 0))
    if size or tall or not gx or not gy:
        k = (a.shape[1] / size) if size else (a.shape[0] / tall) if tall else 16
        gx, gy = (k, 0), (k, 0)
    k = (gx[0] + gy[0]) / 2
    out = sample(a, k, gx[1], k, gy[1])
    if opaque:
        out[:, :, 3] = 255
    else:
        out[:, :, 3] = np.where(out[:, :, 3] > 110, 255, 0)
        ys, xs = np.where(out[:, :, 3] > 0)
        out = out[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1]
    Image.fromarray(out).save(dst)
    print(f"{dst}: block={k:.2f} -> {out.shape[1]}x{out.shape[0]}")


if __name__ == "__main__":
    main()
