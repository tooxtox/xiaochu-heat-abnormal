"""Crop the three original PNG cels without changing their colors or alpha."""
from pathlib import Path

from PIL import Image

DEST = Path(__file__).resolve().parents[1] / "assets" / "character" / "v16"
CROPS = {
    "look": (8, 0, 625, 723),
    "reach": (710, 0, 1439, 723),
    "shield": (1454, 2, 2163, 723),
}


def main():
    atlas = Image.open(DEST / "pose-atlas-original.png").convert("RGBA")
    if atlas.size != (2172, 724):
        raise ValueError("Unexpected pose atlas dimensions")
    for name, box in CROPS.items():
        cel = atlas.crop(box)
        cel.save(DEST / f"{name}.png", optimize=True)
        print(f"{name}: {cel.width}x{cel.height}")


if __name__ == "__main__":
    main()
