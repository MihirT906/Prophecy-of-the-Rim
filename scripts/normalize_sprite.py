"""Turn an AI-generated pixel-art PNG into a crisp small sprite.

    python3 scripts/normalize_sprite.py assets/raw/player-walk.png assets/sprites/player-walk.png --frames auto [--max-height 52] [--pitch N] [--preview]
    python3 scripts/normalize_sprite.py assets/raw/tiles.png assets/sprites/tiles.png --grid 2x2 --cell 32 [--preview]

The source is drawn on a coarse, unknown pixel grid. Detect its pitch from run lengths, sample one
pixel per grid cell (binary alpha), then shrink by an integer factor so the height fits --max-height.
With --frames the source is a row of animation frames (split on transparent column gaps, or into N
equal cells); every frame gets the same pitch and factor and lands in an equal-width strip cell,
aligned by top edge and horizontal centre.
With --grid the source is an opaque COLSxROWS atlas; each cell is centre-sampled to --cell pixels square
(no cropping, alpha kept) and packed back in the same layout.
"""
import argparse
import colorsys
import math
import os
from collections import Counter
from PIL import Image


def detect_pitch(img: Image.Image) -> int:
    w, h = img.size
    px = img.load()
    runs = Counter()

    def walk(seq):
        prev, n = None, 0
        for p in seq:
            k = (p[0] >> 4, p[1] >> 4, p[2] >> 4, p[3] > 127)
            if k == prev:
                n += 1
                continue
            if n >= 3:
                runs[n] += 1
            prev, n = k, 1
        if n >= 3:
            runs[n] += 1

    for y in range(0, h, 7):
        walk(px[x, y] for x in range(w))
    for x in range(0, w, 7):
        walk(px[x, y] for y in range(h))

    pair = lambda l: runs[l] + runs[l + 1]
    peak = lambda l: pair(l) > pair(l - 1) and pair(l) >= pair(l + 1)
    near_peak = lambda l: any(peak(k) for k in (l - 1, l, l + 1))
    for l in range(8, max(w, h) // 3):
        # runs lose a pixel to anti-aliased cell edges, so the pitch is the upper value of the pair
        p = l + 1
        if peak(l) and near_peak(2 * p - 1) and near_peak(3 * p - 1):
            return p
    raise SystemExit('no pixel pitch found, pass --pitch')


def native(img: Image.Image, pitch: int) -> Image.Image:
    w, h = img.size
    nw, nh = math.ceil(w / pitch), math.ceil(h / pitch)
    src, out = img.load(), Image.new('RGBA', (nw, nh))
    dst = out.load()
    for y in range(nh):
        for x in range(nw):
            r, g, b, a = src[min(int((x + 0.5) * pitch), w - 1), min(int((y + 0.5) * pitch), h - 1)]
            dst[x, y] = (r, g, b, 255) if a > 127 else (0, 0, 0, 0)
    return out


def reduce(img: Image.Image, f: int) -> Image.Image:
    w, h = img.size
    src, out = img.load(), Image.new('RGBA', (-(-w // f), -(-h // f)))
    dst = out.load()
    for oy in range(out.height):
        for ox in range(out.width):
            block = [src[x, y] for y in range(oy * f, min(oy * f + f, h)) for x in range(ox * f, min(ox * f + f, w))]
            opaque = [p for p in block if p[3]]
            if len(opaque) * 2 < len(block):
                continue
            hsv = {p: colorsys.rgb_to_hsv(p[0] / 255, p[1] / 255, p[2] / 255) for p in opaque}
            vivid = [p for p in opaque if hsv[p][1] > 0.35]
            # the brightest saturated pixel keeps thin neon trim lines alive through the shrink
            dst[ox, oy] = max(vivid, key=lambda p: hsv[p][2]) if vivid else Counter(opaque).most_common(1)[0][0]
    return out


def grid(img: Image.Image, cols: int, rows: int, n: int) -> Image.Image:
    src, out = img.load(), Image.new('RGBA', (cols * n, rows * n))
    dst = out.load()
    for gy in range(rows):
        for gx in range(cols):
            x0, x1 = img.width * gx // cols, img.width * (gx + 1) // cols
            y0, y1 = img.height * gy // rows, img.height * (gy + 1) // rows
            for y in range(n):
                for x in range(n):
                    dst[gx * n + x, gy * n + y] = src[x0 + int((x + 0.5) * (x1 - x0) / n), y0 + int((y + 0.5) * (y1 - y0) / n)]
    return out


def split(img: Image.Image, frames: str) -> list[Image.Image]:
    if frames != 'auto':
        n = int(frames)
        return [img.crop((img.width * i // n, 0, img.width * (i + 1) // n, img.height)) for i in range(n)]
    a = img.getchannel('A').load()
    spans, start, last, gap = [], None, 0, 0
    for x in range(img.width):
        if all(a[x, y] <= 64 for y in range(img.height)):
            gap += 1
            if start is not None and gap >= 8:
                spans.append((start, last + 1))
                start = None
        else:
            start, last, gap = x if start is None else start, x, 0
    if start is not None:
        spans.append((start, last + 1))
    return [img.crop((x0, 0, x1, img.height)) for x0, x1 in spans]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--max-height', type=int, default=52)
    ap.add_argument('--pitch', type=float)
    ap.add_argument('--frames', help="'auto' to split on transparent column gaps, or a frame count")
    ap.add_argument('--grid', help='COLSxROWS: an opaque atlas, resampled cell by cell')
    ap.add_argument('--cell', type=int, default=32, help='output cell size for --grid')
    ap.add_argument('--preview', action='store_true')
    a = ap.parse_args()

    img = Image.open(a.src).convert('RGBA')
    if a.grid:
        cols, rows = map(int, a.grid.lower().split('x'))
        out = grid(img, cols, rows, a.cell)
        out.save(a.dst)
        print(f"grid {cols}x{rows}, cell {img.width // cols}x{img.height // rows} -> {a.cell}x{a.cell}")
        if a.preview:
            preview(out, a)
        return
    bbox = lambda im: im.crop(im.getchannel('A').point(lambda v: 255 if v > 64 else 0).getbbox())
    img = bbox(img)
    pitch = a.pitch or detect_pitch(img)
    nats = [native(bbox(fr), pitch) for fr in (split(img, a.frames) if a.frames else [img])]
    f = max(1, -(-max(n.height for n in nats) // a.max_height))
    frames = [reduce(n, f) for n in nats]
    cw, ch = max(fr.width for fr in frames), max(fr.height for fr in frames)
    out = Image.new('RGBA', (cw * len(frames), ch))
    for i, fr in enumerate(frames):
        out.paste(fr, (i * cw + (cw - fr.width) // 2, 0))
    out.save(a.dst)
    print(f"pitch {pitch}, native {' '.join(f'{n.width}x{n.height}' for n in nats)}, cell {cw}x{ch} (factor {f}), frames {len(frames)}")

    if a.preview:
        preview(out, a)


def preview(out: Image.Image, a) -> None:
    big = out.resize((out.width * 8, out.height * 8), Image.NEAREST)
    bg = Image.new('RGBA', big.size, '#2a0f3d')
    bg.alpha_composite(big)
    bg.save(os.path.splitext(a.dst)[0] + '-preview.png')


if __name__ == '__main__':
    main()
