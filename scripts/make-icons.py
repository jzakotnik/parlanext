"""
Erzeugt alle Favicons/App-Icons aus assets/icon-source.webp (Pillow + numpy nötig).
    python3 scripts/make-icons.py
Ausgabe:
  src/app/favicon.ico       16/32/48/64 px, abgerundet mit transparenten Ecken
  src/app/icon.png          512 px, abgerundet (Browser, Desktop)
  src/app/apple-icon.png    180 px, vollflächig ohne Transparenz (iOS rundet selbst)
  public/icon-192.png, public/icon-512.png                  Android/PWA
  public/icon-maskable-512.png                              Android "maskable" (vollflächig)
"""
import numpy as np
from PIL import Image, ImageFilter

SRC = "assets/icon-source.webp"
im = Image.open(SRC).convert("RGB")
a = np.asarray(im).astype(int)

# Quelle hat schwarze Ecken außerhalb des abgerundeten Quadrats -> Begrenzung und Alpha-Maske bestimmen
inside = a.max(axis=2) > 20
ys, xs = np.where(inside)
x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
side = min(x1 - x0, y1 - y0)
cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
box = (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)

mask = Image.fromarray((inside * 255).astype("uint8")).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(1.2))
rounded = im.copy().convert("RGBA")
rounded.putalpha(mask)
rounded = rounded.crop(box)

# Vollflächige Variante: so weit nach innen beschneiden, bis in den Ecken nichts Schwarzes mehr liegt
def corners_ok(img):
    arr = np.asarray(img.convert("RGB")).astype(int)
    n = max(3, arr.shape[0] // 100)
    return all(arr[sl].max(axis=2).min() > 40 for sl in (
        (slice(0, n), slice(0, n)), (slice(0, n), slice(-n, None)), (slice(-n, None), slice(0, n)), (slice(-n, None), slice(-n, None))))

full = im.crop(box)
m = 0
while not corners_ok(full.crop((m, m, side - m, side - m))) and m < side // 4:
    m += 4
full = full.crop((m, m, side - m, side - m)).convert("RGB")
print(f"Quelle {im.size}, Icon {side}px, Beschnitt für vollflächige Variante: {m}px")

def save(img, path, size):
    img.resize((size, size), Image.LANCZOS).save(path)

save(rounded, "src/app/icon.png", 512)
save(full, "src/app/apple-icon.png", 180)
save(rounded, "public/icon-192.png", 192)
save(rounded, "public/icon-512.png", 512)
save(full, "public/icon-maskable-512.png", 512)
rounded.resize((256, 256), Image.LANCZOS).save("src/app/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
print("Fertig.")
