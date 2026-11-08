# Diagrams

`daykeeper-day.png` is what the README embeds. It is rendered from `daykeeper-day.html`, which is
the source of truth: one self-contained file, the product's own palette, and its two typefaces
inlined as base64 so nothing is fetched at open time.

| File | What it is |
|---|---|
| `daykeeper-day.png` | 1920×1200 raster of the SVG, what the README shows |
| `daykeeper-day.html` | the diagram, openable on its own |
| `daykeeper-day.src.html` | the same file with a `__FONTS__` placeholder instead of the base64 font payload — edit this one |
| `assets/*.woff2` | IBM Plex Mono 400/600 and Instrument Serif 400 (latin), the faces the app ships |

## Rebuilding

```bash
# 1. fold the fonts into the deliverable
python3 - <<'PY'
src = open("daykeeper-day.src.html").read()
fonts = open("assets/fonts-inline.css").read()   # regenerate from assets/*.woff2 if missing
open("daykeeper-day.html", "w").write(src.replace("__FONTS__", fonts))
PY

# 2. gate it
python3 ~/.hermes/skills/diagram-design/scripts/self_check.py daykeeper-day.html

# 3. rasterize the <svg> box at 2x and check the right edge survived
#    (960×600 viewBox → 1920×1200 PNG)
```

Layout geometry sits on a 4px grid, the six connector rules from the `diagram-design` skill apply,
and `viewBox` is `doc-inline` (960×600) — so the PNG is exactly the viewBox × 2.
