# Receipt OCR worker (M05-BUILD-DESIGN §14.6; founder D1, 12 Oct 2026): self-hosted PaddleOCR, CPU only.
#
# NOT BUILT YET: building pulls the packages and models below, which wait for the founder's approval of the exact
# download list. Until then the API runs with EXPENSE_OCR_ADAPTER=dev-fake (tests) or none (manual entry).
#
# Run it isolated (no network, non-root, read-only, limits), sharing only the spool directory with the API:
#   docker run --network none --read-only --user 10001:10001 --cpus 1 --memory 1536m --pids-limit 64 \
#     --tmpfs /tmp:size=256m --cap-drop ALL --security-opt no-new-privileges \
#     -v <spool>:/spool yukthix/ocr-worker
# and set EXPENSE_OCR_ADAPTER=paddle-worker, EXPENSE_OCR_SPOOL=<spool> on the API.

# Official Python image, pinned by digest (Docker Hub, python:3.12-slim-bookworm, linux/amd64).
FROM python:3.12-slim-bookworm@sha256:2ed6491b93cd49272ee6de2b5a38440c3448360322c089fc23e370722d74179d AS models
ARG HF_HUB_VERSION
ARG HF_DET_REV
ARG HF_REC_REV
ARG HF_ORI_REV
# Versions and revisions are pinned when the founder approves the download list.
RUN pip install --no-cache-dir "huggingface-hub==${HF_HUB_VERSION}"
# Official PaddlePaddle organisation on Hugging Face, Apache-2.0.
RUN python -c "from huggingface_hub import snapshot_download as d; d('PaddlePaddle/PP-OCRv5_mobile_det', revision='${HF_DET_REV}', local_dir='/models/PP-OCRv5_mobile_det'); d('PaddlePaddle/en_PP-OCRv5_mobile_rec', revision='${HF_REC_REV}', local_dir='/models/en_PP-OCRv5_mobile_rec'); d('PaddlePaddle/PP-LCNet_x1_0_textline_ori', revision='${HF_ORI_REV}', local_dir='/models/PP-LCNet_x1_0_textline_ori')"

FROM python:3.12-slim-bookworm@sha256:2ed6491b93cd49272ee6de2b5a38440c3448360322c089fc23e370722d74179d
# OpenCV (pulled in by paddlex) needs these system libraries; libgomp for Paddle's CPU kernels.
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir "paddlepaddle==3.3.1" "paddleocr==3.7.0" "paddlex[ocr-core]==3.7.0"
COPY --from=models /models /models
COPY worker.py /app/worker.py
RUN useradd --system --uid 10001 --no-create-home ocr
ENV OCR_SPOOL=/spool OCR_MODELS=/models PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True PYTHONDONTWRITEBYTECODE=1
USER 10001:10001
CMD ["python", "/app/worker.py"]
