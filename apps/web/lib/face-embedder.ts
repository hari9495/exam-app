import type { InferenceSession } from 'onnxruntime-web';

// Browser advisory tier for face verification. This is a convenience only -- it gives the
// candidate fast local feedback while the server tier (apps/exam-runtime/src/face/
// face-embedder.service.ts) remains the sole source of any proctoring verdict. Nothing computed
// here may create an event, set a flag, or otherwise touch exam state; see useWebcamMonitor.ts
// for how the caller is expected to treat the result as a hint and nothing more.
//
// Every failure path returns null, never throws: no WebGL/WASM, a 404 on the model file, a
// slow/blocked network, an unsupported browser. The model file this depends on
// (public/models/face-embedder.onnx) is gated on a separate licensing review and does not exist
// yet -- loading fails today in every environment, and that is the normal path, not an error
// path. A candidate must see no difference in their exam when it does.

const INPUT_SIZE = 112;

export interface BrowserFaceEmbedder {
  embed(video: HTMLVideoElement): Promise<Float32Array | null>;
  close(): void;
}

// Pure and exported so the pixel-normalisation math is directly testable without a real model
// file or a real onnxruntime-web session (neither is available in this environment -- see
// above). RGBA -> NCHW float32, matching the server tier's `(x/255 - 0.5)/0.5` per channel and
// R/G/B plane order exactly. Getting this wrong wouldn't throw or fail loudly -- it would just
// make the two tiers silently disagree about the same face.
export function toNchwFloat32(rgba: Uint8ClampedArray | Uint8Array, size = INPUT_SIZE): Float32Array {
  const plane = size * size;
  const floats = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i += 1) {
    floats[i] = (rgba[i * 4] / 255 - 0.5) / 0.5;
    floats[plane + i] = (rgba[i * 4 + 1] / 255 - 0.5) / 0.5;
    floats[plane * 2 + i] = (rgba[i * 4 + 2] / 255 - 0.5) / 0.5;
  }
  return floats;
}

// Center-square-crop the current video frame onto a 112x112 canvas, mirroring the server's
// sharp(...).resize(112, 112, { fit: 'cover' }). A plain stretch-to-fit would squash a
// non-square webcam frame differently than the server ever sees it. The <video> element itself
// needs no EXIF-equivalent correction: EXIF orientation only matters for re-decoding an encoded
// image file, and a canvas drawn from a live <video> element already reflects the frame exactly
// as the browser's camera pipeline oriented it for display -- there is no separate "raw sensor"
// orientation left to correct here.
export function frameToImageData(video: HTMLVideoElement): ImageData | null {
  const side = Math.min(video.videoWidth, video.videoHeight);
  if (!side) return null;
  const sx = (video.videoWidth - side) / 2;
  const sy = (video.videoHeight - side) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = INPUT_SIZE;
  canvas.height = INPUT_SIZE;
  // willReadFrequently: this canvas does a getImageData readback every ~4s for the life of the
  // exam attempt -- Chrome console-warns on exactly this read-heavy-2d-context pattern otherwise.
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  // 'high' narrows the resampling gap with the server tier's sharp (Lanczos3); the canvas default
  // ('low') would make the two tiers see meaningfully different pixels for the same crop.
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(video, sx, sy, side, side, 0, 0, INPUT_SIZE, INPUT_SIZE);
  return ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
}

export function createBrowserEmbedder(modelUrl: string): BrowserFaceEmbedder {
  // Lazily loaded and cached: `session` is the live session once loaded, `loadPromise` de-dupes
  // concurrent embed() calls racing the first load, and a failed load is remembered so every
  // later embed() call fails fast instead of retrying a model that will never appear this session.
  let session: InferenceSession | null = null;
  let loadFailed = false;
  let loadPromise: Promise<InferenceSession | null> | null = null;
  // Terminal once set by close() -- see close() below. Distinct from loadFailed: loadFailed means
  // "this model URL will never load", closed means "this embedder is done". Nothing resets any of
  // the three; an embedder is single-use by design, so `close` can never be mistaken for a pause.
  let closed = false;

  async function getSession(): Promise<InferenceSession | null> {
    if (closed) return null;
    if (session) return session;
    if (loadFailed) return null;
    if (!loadPromise) {
      loadPromise = (async () => {
        try {
          // Dynamic import so onnxruntime-web (and the WASM it loads) never ships on the
          // critical path -- most candidates, in every environment today, never need it.
          const ort = await import('onnxruntime-web');
          if (ort.env?.wasm) {
            // ORT-web runs WASM on the main thread by default (single-threaded -- this app isn't
            // cross-origin-isolated, so the SharedArrayBuffer-based multi-threaded backend isn't
            // available). A slow forward pass on a loaded machine would otherwise stutter the
            // exam timer and the code editor for however long it takes. `proxy` moves execution
            // to a dedicated Worker instead, without requiring cross-origin isolation. Guarded on
            // `ort.env?.wasm` so a test double that mocks only `InferenceSession`/`Tensor` (no
            // `env`) doesn't throw here.
            ort.env.wasm.proxy = true;
          }
          const created = await ort.InferenceSession.create(modelUrl);
          if (closed) {
            // close() ran while this load was in flight (React StrictMode's double-mount hits
            // this on every dev page load). `session` is still null at this point, so a plain
            // `session?.release()` in close() cannot see this session -- it would otherwise be
            // unreachable and leak for the rest of the exam attempt. Release it here instead.
            void created.release().catch(() => {});
            return null;
          }
          session = created;
          return session;
        } catch {
          loadFailed = true;
          return null;
        }
      })();
    }
    return loadPromise;
  }

  return {
    async embed(video: HTMLVideoElement): Promise<Float32Array | null> {
      try {
        const activeSession = await getSession();
        if (!activeSession) return null;

        const imageData = frameToImageData(video);
        if (!imageData) return null;

        const ort = await import('onnxruntime-web');
        const tensor = new ort.Tensor('float32', toNchwFloat32(imageData.data), [1, 3, INPUT_SIZE, INPUT_SIZE]);

        const output = await activeSession.run({ [activeSession.inputNames[0]]: tensor });
        const outputKey = activeSession.outputNames[0] ?? Object.keys(output)[0];
        const result = outputKey ? output[outputKey] : undefined;
        if (!result || result.type !== 'float32') return null;
        return Float32Array.from(result.data as ArrayLike<number>);
      } catch {
        // Same rule as the server tier: every failure degrades to "no verdict", never a throw
        // into the caller -- an interval callback on a live exam page must never take the page
        // down with it.
        return null;
      }
    },
    close() {
      // Terminal, and idempotent: a second close() (or a close() that races an in-flight load,
      // see getSession() above) must produce exactly one release() call, and an embed() called
      // after close() must never build a fresh session -- an API named "close" that silently
      // reopens is a trap for whatever calls it next.
      if (closed) return;
      closed = true;
      // Actually release the ONNX session's underlying (WASM-side) memory. This runs on an
      // interval for hours during a live exam; a leak here accumulates for the whole attempt.
      // .catch(): a rejecting release() must not become an unhandled rejection -- the candidate
      // layout's ClientErrorListener turns those into a visible error record against the
      // candidate's attempt, and a failed cleanup must stay invisible like every other failure
      // path here.
      void session?.release().catch(() => {});
      session = null;
    },
  };
}
