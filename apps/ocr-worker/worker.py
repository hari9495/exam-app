"""Receipt OCR worker (M05-BUILD-DESIGN §14.6; founder D1, 12 Oct 2026).

Runs in its own container with no network, as a non-root user, under CPU / memory / time limits. It reads jobs from a
spool directory the API also mounts and answers with text lines and their scores, plus the raw text of a QR code if
the receipt has one. It never extracts fields, never decides anything and never touches the database: the API parses
the output strictly and the employee confirms every value.

Spool protocol (the API's PaddleWorkerReader):
  in/<id>.bin   the receipt bytes (JPG, PNG or PDF; already virus-scanned and type-checked by the API)
  in/<id>.json  {"mime": "..."}  written last: a job exists once this file exists
  out/<id>.json {"lines": [{"text": "...", "score": 0.93}, ...], "qr": "..." | null}
"""

import json
import os
import signal
import sys
import time

import cv2  # opencv-contrib-python, pinned by paddlex; also decodes the QR code
import numpy as np
import pypdfium2 as pdfium
from paddleocr import PaddleOCR

SPOOL = os.environ.get("OCR_SPOOL", "/spool")
MODELS = os.environ.get("OCR_MODELS", "/models")
MAX_BYTES = 10 * 1024 * 1024
MAX_SIDE = 6000
MAX_PAGES = 3
SECONDS_PER_PAGE = int(os.environ.get("OCR_SECONDS_PER_PAGE", "20"))
MAX_LINES = 400


class Timeout(Exception):
    pass


def _alarm(_signum, _frame):
    raise Timeout()


def load_engine():
    # Models are baked into the image at build time; nothing is fetched at run time (the container has no network).
    return PaddleOCR(
        text_detection_model_name="PP-OCRv5_mobile_det",
        text_detection_model_dir=os.path.join(MODELS, "PP-OCRv5_mobile_det"),
        text_recognition_model_name="en_PP-OCRv5_mobile_rec",
        text_recognition_model_dir=os.path.join(MODELS, "en_PP-OCRv5_mobile_rec"),
        textline_orientation_model_name="PP-LCNet_x1_0_textline_ori",
        textline_orientation_model_dir=os.path.join(MODELS, "PP-LCNet_x1_0_textline_ori"),
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=True,
        device="cpu",
        # Paddle 3.x on CPU: the oneDNN path cannot run these models' attributes, so the plain CPU kernels are used.
        enable_mkldnn=False,
    )


def pages(data: bytes, mime: str):
    """Images to read: up to MAX_PAGES PDF pages rendered in this sandbox, or the one image."""
    if mime == "application/pdf":
        pdf = pdfium.PdfDocument(data)
        try:
            for i in range(min(len(pdf), MAX_PAGES)):
                img = pdf[i].render(scale=2).to_numpy()
                yield cv2.cvtColor(img, cv2.COLOR_RGB2BGR) if img.ndim == 3 else img
        finally:
            pdf.close()
        return
    img = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return
    yield img


def read(engine, data: bytes, mime: str):
    lines, qr = [], None
    detector = cv2.QRCodeDetector()
    for img in pages(data, mime):
        h, w = img.shape[:2]
        if max(h, w) > MAX_SIDE:
            continue
        if qr is None:
            text, _points, _ = detector.detectAndDecode(img)
            qr = text or None
        signal.alarm(SECONDS_PER_PAGE)
        try:
            for res in engine.predict(img):
                for text, score in zip(res["rec_texts"], res["rec_scores"]):
                    if len(lines) < MAX_LINES:
                        lines.append({"text": str(text)[:300], "score": float(max(0.0, min(1.0, score)))})
        except Timeout:
            raise
        except Exception as e:  # one unreadable page leaves the others (and a QR already read) usable
            print(f"page: {type(e).__name__}", file=sys.stderr, flush=True)
        finally:
            signal.alarm(0)
    return {"lines": lines, "qr": qr[:4096] if qr else None}


def answer(job: str, out: dict):
    tmp = os.path.join(SPOOL, "out", f".{job}.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(out, f)
    os.replace(tmp, os.path.join(SPOOL, "out", f"{job}.json"))


def main():
    signal.signal(signal.SIGALRM, _alarm)
    engine = load_engine()
    inbox = os.path.join(SPOOL, "in")
    print("ocr worker ready", flush=True)
    while True:
        jobs = sorted(n[:-5] for n in os.listdir(inbox) if n.endswith(".json"))
        if not jobs:
            time.sleep(0.2)
            continue
        for job in jobs:
            meta_path, bin_path = os.path.join(inbox, f"{job}.json"), os.path.join(inbox, f"{job}.bin")
            try:
                with open(meta_path, encoding="utf-8") as f:
                    mime = json.load(f).get("mime")
                size = os.path.getsize(bin_path)
                if mime not in ("image/jpeg", "image/png", "application/pdf") or size > MAX_BYTES:
                    answer(job, {"lines": [], "qr": None})
                    continue
                with open(bin_path, "rb") as f:
                    answer(job, read(engine, f.read(), mime))
            except Timeout:
                answer(job, {"lines": [], "qr": None})
            except Exception as e:  # a bad file never stops the worker; the employee types the values instead
                print(f"job {job}: {type(e).__name__}", file=sys.stderr, flush=True)
                answer(job, {"lines": [], "qr": None})
            finally:
                for p in (meta_path, bin_path):
                    try:
                        os.remove(p)
                    except OSError:
                        pass


if __name__ == "__main__":
    main()
