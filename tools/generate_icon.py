from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "app.ico"
SCALE = 4
SIZE = 256 * SCALE


def scaled_box(values):
    return tuple(value * SCALE for value in values)


canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(canvas)
draw.rounded_rectangle(
    scaled_box((0, 0, 256, 256)),
    radius=72 * SCALE,
    fill="#155d44",
)

for angle in (28, -28):
    orbit = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    orbit_draw = ImageDraw.Draw(orbit)
    orbit_draw.ellipse(
        scaled_box((32, 88, 224, 168)),
        outline="#ddef9a",
        width=8 * SCALE,
    )
    orbit = orbit.rotate(angle, resample=Image.Resampling.BICUBIC, center=(SIZE // 2, SIZE // 2))
    canvas.alpha_composite(orbit)

draw = ImageDraw.Draw(canvas)
draw.ellipse(scaled_box((100, 100, 156, 156)), fill="#ddef9a")
draw.ellipse(scaled_box((200, 160, 224, 184)), fill="#e77a3d")

icon = canvas.resize((256, 256), Image.Resampling.LANCZOS)
icon.save(OUTPUT, format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(OUTPUT)
