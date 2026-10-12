"""Synthetic receipt images for the OCR worker's contract test. Every name, GSTIN and amount is made up (no real
personal data). Run inside the worker image (it uses Pillow and OpenCV, which the image already has):

    docker run --rm -v <dir>:/out --entrypoint python yukthix/ocr-worker /app/samples/make_samples.py /out
"""

import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1] if len(sys.argv) > 1 else "/out"
FONT = ImageFont.load_default(size=30)
SMALL = ImageFont.load_default(size=24)


def receipt(lines, width=760):
    height = 80 + 52 * len(lines)
    img = Image.new("RGB", (width, height), "white")
    d = ImageDraw.Draw(img)
    y = 40
    for text, big in lines:
        d.text((40, y), text, fill="black", font=FONT if big else SMALL)
        y += 52
    return img


def main():
    hotel = receipt([
        ("Hotel Sea View", True),
        ("TAX INVOICE", False),
        ("GSTIN: 27AAPFU0939F1ZV", False),
        ("Invoice No: SV/2026/1182", False),
        ("Date: 01/10/2026", False),
        ("Room tariff 1 night 5,000.00", False),
        ("CGST 9% 450.00", False),
        ("SGST 9% 450.00", False),
        ("Grand Total 5,900.00", True),
    ])
    hotel.save(f"{OUT}/hotel.png")
    # A phone photo is rarely straight: the same bill turned a little, as JPEG.
    hotel.rotate(4, expand=True, fillcolor="white").save(f"{OUT}/hotel-tilted.jpg", quality=85)
    cafe = receipt([
        ("Cafe Mocha", True),
        ("Bill No: CM-4471", False),
        ("Date 02-10-2026", False),
        ("2 x Coffee 360.00", False),
        ("1 x Sandwich 220.00", False),
        ("Total 580.00", True),
    ])
    cafe.save(f"{OUT}/cafe.pdf")  # a one-page PDF, rendered inside the worker
    # A bill carrying a QR code (a made-up token in the e-invoice shape; the API checks its signature).
    qr = cv2.QRCodeEncoder.create().encode("eyJhbGciOiJSUzI1NiJ9.eyJkYXRhIjoie30ifQ.c2lnbmF0dXJl")
    qr = cv2.resize(qr, (qr.shape[1] * 6, qr.shape[0] * 6), interpolation=cv2.INTER_NEAREST)
    taxi = receipt([("City Cabs", True), ("Trip 12 km", False), ("Fare 310.00", True)])
    canvas = Image.new("RGB", (taxi.width, taxi.height + qr.shape[0] + 40), "white")
    canvas.paste(taxi, (0, 0))
    canvas.paste(Image.fromarray(np.stack([qr] * 3, axis=-1)), (40, taxi.height + 20))
    canvas.save(f"{OUT}/taxi-qr.png")
    print("samples written")


if __name__ == "__main__":
    main()
