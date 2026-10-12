"""Builds /licenses/THIRD-PARTY-LICENSES.txt inside the image (run once at build time, founder condition 12 Oct 2026).

It gathers, for everything shipped in the image:
  - every installed Python distribution: name, version, licence field and the licence files in its dist-info
    (this includes OpenCV's bundled third-party notices: FFmpeg (LGPL-2.1) and, in the GUI build, Qt (LGPL-3));
  - every installed Debian package's copyright file;
  - the three PaddleOCR models (Apache-2.0, PaddlePaddle on Hugging Face) with their pinned commits.
Nothing is fetched: it only reads what is already installed.
"""

import glob
import os
from importlib import metadata

OUT = "/licenses/THIRD-PARTY-LICENSES.txt"
MODELS = [
    ("PP-OCRv5_mobile_det", "0d63e78e2b680928f6b1747d76a08db6e645efb7"),
    ("en_PP-OCRv5_mobile_rec", "267c36e24c331595590fe7bd72bde2436fd286f2"),
    ("PP-LCNet_x1_0_textline_ori", "cd237a44b0e359d4fe38310a416203cf7403faa5"),
]


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as out:
        out.write("Third-party software in the YukthiX receipt OCR worker image\n")
        out.write("=" * 72 + "\n\n")
        out.write("MODELS (Apache License 2.0, https://huggingface.co/PaddlePaddle)\n")
        for name, rev in MODELS:
            out.write(f"  PaddlePaddle/{name} @ {rev}\n")
        out.write("\nPYTHON PACKAGES\n")
        dists = sorted(metadata.distributions(), key=lambda d: (d.metadata["Name"] or "").lower())
        for d in dists:
            name, version = d.metadata["Name"], d.version
            lic = d.metadata.get("License-Expression") or d.metadata.get("License") or ""
            out.write("\n" + "-" * 72 + f"\n{name} {version}\nLicence: {lic.strip()[:300]}\n")
            for f in d.files or []:
                base = os.path.basename(str(f)).upper()
                if base.startswith(("LICENSE", "LICENCE", "COPYING", "NOTICE")) or "LICENSE" in str(f).upper().split("/")[-2:-1]:
                    path = d.locate_file(f)
                    try:
                        with open(path, encoding="utf-8", errors="replace") as fh:
                            out.write(f"\n[{f}]\n{fh.read()}\n")
                    except (OSError, IsADirectoryError):
                        pass
        out.write("\n" + "=" * 72 + "\nDEBIAN PACKAGES (copyright files from /usr/share/doc)\n")
        for path in sorted(glob.glob("/usr/share/doc/*/copyright")):
            out.write("\n" + "-" * 72 + f"\n{path.split('/')[4]}\n")
            with open(path, encoding="utf-8", errors="replace") as fh:
                out.write(fh.read())
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
