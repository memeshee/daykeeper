# Diagrams

Two figures, both rendered from self-contained HTML. The `.png` is what the README embeds; the
`.html` is the source of truth — the product's own palette and its two typefaces inlined as
base64, so nothing is fetched when you open one.

| File | What it is |
|---|---|
| `daykeeper-day.png` / `.html` | one round as a lifecycle: bidding, the bell, the seated keeper, the deadline, and the no-bid path |
| `daykeeper-keys.png` / `.html` | the contract, the two function-call keys it installs on itself, and the only calls they can make |
| `*.src.html` | the same files with a `__FONTS__` placeholder instead of the base64 payload — edit these |
| `assets/*.woff2` | IBM Plex Mono 400/600 and Instrument Serif 400 (latin), the faces the app ships |
| `assets/fonts-inline.css` | those faces as `@font-face` blocks with base64 sources |

## Rebuilding

```bash
cd docs/diagrams

# 1. fold the fonts into the deliverables
python3 - <<'PY'
fonts = open("assets/fonts-inline.css").read()
for src, out in [("daykeeper-day.src.html", "daykeeper-day.html"),
                 ("daykeeper-keys.src.html", "daykeeper-keys.html")]:
    open(out, "w").write(open(src).read().replace("__FONTS__", fonts))
PY

# 2. gate both
for f in daykeeper-day.html daykeeper-keys.html; do
  python3 ~/.hermes/skills/diagram-design/scripts/self_check.py "$f"
done

# 3. rasterize: strip the page chrome, keep the <svg> at exactly its viewBox size
python3 - <<'PY'
import re
for name in ("daykeeper-day", "daykeeper-keys"):
    src = open(f"{name}.html").read()
    style = re.search(r"<style>(.*?)</style>", src, re.S).group(1)
    svg = re.search(r"<svg.*?</svg>", src, re.S).group(0).replace('width="100%"', 'width="960"')
    open(f"_{name}.raster.html", "w").write(
        f'<!DOCTYPE html><html><head><meta charset="utf-8"><style>{style}'
        'html,body{margin:0;padding:0;background:#f2eee4}svg{width:960px;height:600px;min-width:0}</style>'
        f"</head><body>{svg}</body></html>")
PY

for n in daykeeper-day daykeeper-keys; do
  /usr/bin/google-chrome --headless=new --disable-gpu --hide-scrollbars \
    --window-size=960,600 --force-device-scale-factor=2 \
    --screenshot=$n.png file://$PWD/_$n.raster.html
done
rm -f _*.raster.html
```

A `doc-inline` 960×600 `viewBox` at scale 2 is exactly 1920×1200. After rendering, prove nothing
was clipped by sampling the outer columns — left and right dark-pixel counts should match:

```bash
ffmpeg -v error -i daykeeper-keys.png -vf crop=8:120:76:240   -f rawvideo -pix_fmt rgb24 - | python3 -c 'import sys;d=sys.stdin.buffer.read();print(sum(1 for i in range(0,len(d),3) if max(d[i:i+3])<180))'
ffmpeg -v error -i daykeeper-keys.png -vf crop=8:120:1836:240 -f rawvideo -pix_fmt rgb24 - | python3 -c 'import sys;d=sys.stdin.buffer.read();print(sum(1 for i in range(0,len(d),3) if max(d[i:i+3])<180))'
```
