# Receipt OCR worker (M05-BUILD-DESIGN §14.6, §22; founder D1 and download approval, 12 Oct 2026; option A).
# Self-hosted PaddleOCR on CPU. Every download is pinned: the base image by digest, Python packages by version and
# SHA-256 (pip --require-hashes, full set in the lock files), Debian packages by exact version from a fixed
# snapshot.debian.org timestamp (debian.lock), the models by Hugging Face commit and file SHA-256. Models are baked in
# at build time; nothing is fetched at run time.
#
# Build:  docker build -t yukthix/ocr-worker apps/ocr-worker
# Run (isolated: no network, non-root, read-only root, a scratch tmpfs, CPU / memory / process limits):
#   docker run -d --name ocr-worker --network none --read-only --user 10001:10001 --cpus 1 --memory 1536m \
#     --pids-limit 64 --tmpfs /tmp:size=256m --cap-drop ALL --security-opt no-new-privileges \
#     -v <spool>:/spool yukthix/ocr-worker
# and on the API: EXPENSE_OCR_ADAPTER=paddle-worker, EXPENSE_OCR_SPOOL=<spool>. Tests and CI keep dev-fake.

# ---------------------------------------------------------------------------------------------- models (build only)
FROM python:3.12-slim-bookworm@sha256:2ed6491b93cd49272ee6de2b5a38440c3448360322c089fc23e370722d74179d AS models
COPY models.lock /tmp/models.lock
RUN pip install --no-cache-dir --require-hashes --no-deps -r /tmp/models.lock
# Official PaddlePaddle organisation on Hugging Face (Apache-2.0), at pinned commits.
RUN python -c "from huggingface_hub import snapshot_download as d; \
d('PaddlePaddle/PP-OCRv5_mobile_det', revision='0d63e78e2b680928f6b1747d76a08db6e645efb7', local_dir='/models/PP-OCRv5_mobile_det', allow_patterns=['inference.*', 'config.json', 'README.md']); \
d('PaddlePaddle/en_PP-OCRv5_mobile_rec', revision='267c36e24c331595590fe7bd72bde2436fd286f2', local_dir='/models/en_PP-OCRv5_mobile_rec', allow_patterns=['inference.*', 'config.json', 'README.md']); \
d('PaddlePaddle/PP-LCNet_x1_0_textline_ori', revision='cd237a44b0e359d4fe38310a416203cf7403faa5', local_dir='/models/PP-LCNet_x1_0_textline_ori', allow_patterns=['inference.*', 'config.json', 'README.md'])" \
 && rm -rf /models/*/.cache \
 && printf '%s  %s\n' \
    afa1820cb16c1fd0dad589d0f8b389139061c1ef6d68019685fd07be997dda5b /models/PP-OCRv5_mobile_det/inference.pdiparams \
    3ec8a97ed6cefe8568d3e2ee90bb193299b566a7661aa4fd52d224b96b59f66b /models/en_PP-OCRv5_mobile_rec/inference.pdiparams \
    0de2bcf996cf553e2b848dd7b1769dafffc6917b1ccdf55c1d8efe7909fbf743 /models/PP-LCNet_x1_0_textline_ori/inference.pdiparams \
  | sha256sum -c -

# ---------------------------------------------------------------------------------------------- worker
FROM python:3.12-slim-bookworm@sha256:2ed6491b93cd49272ee6de2b5a38440c3448360322c089fc23e370722d74179d
# OpenCV's full build loads libGL (no display is ever used); libgomp for Paddle's CPU kernels. Exact versions from the
# official Debian archive at a fixed point in time, so a rebuild gets the same packages.
ARG DEBIAN_SNAPSHOT=20261012T000000Z
COPY debian.lock /tmp/debian.lock
COPY debian.sources /etc/apt/sources.list.d/debian.sources
RUN sed -i "s/@SNAPSHOT@/${DEBIAN_SNAPSHOT}/" /etc/apt/sources.list.d/debian.sources  && apt-get update  && apt-get install -y --no-install-recommends $(grep -v '^#' /tmp/debian.lock)  && rm -rf /var/lib/apt/lists/* /tmp/debian.lock
COPY requirements.lock /tmp/requirements.lock
RUN pip install --no-cache-dir --require-hashes -r /tmp/requirements.lock && rm /tmp/requirements.lock
COPY --from=models /models /models
COPY worker.py licenses.py /app/
COPY samples /app/samples
RUN python /app/licenses.py && useradd --system --uid 10001 --no-create-home ocr
# Read-only root: caches and the home directory live on the /tmp scratch mount.
ENV OCR_SPOOL=/spool OCR_MODELS=/models HOME=/tmp PADDLE_PDX_CACHE_HOME=/tmp/paddlex PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True \
    PYTHONDONTWRITEBYTECODE=1 OMP_NUM_THREADS=1
USER 10001:10001
CMD ["python", "/app/worker.py"]
