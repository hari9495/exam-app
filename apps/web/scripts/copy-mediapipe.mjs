// Copies the MediaPipe vision runtime (WASM) and the face-landmarker model into
// public/mediapipe so the app serves them from its own origin instead of
// jsdelivr (WASM) and storage.googleapis.com (model).
//
// Why: webcam proctoring (lib/hooks/useWebcamMonitor.ts) initialises MediaPipe
// in the candidate's browser. Its defaults fetch the WASM and the ~3.6MB model
// from third-party CDNs, which locked-down office / exam-hall networks block --
// so on a webcam-required exam the candidate can't start. Serving these from the
// app origin (which the candidate can obviously reach) removes that dependency.
// Same fix shape as scripts/copy-monaco.mjs. See ADO #6826.
//
// The WASM ships inside the @mediapipe/tasks-vision package (versioned with it).
// The model is not in any npm package, so it is vendored in the repo at
// vendor/mediapipe/face_landmarker.task and copied from there -- no build-time
// network dependency on Google.
//
// Runs as a prebuild step. Output (public/mediapipe) is generated, gitignored,
// and flows into the Next standalone tree via the postbuild copy of public/.
import { cpSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(webRoot, 'public', 'mediapipe');
mkdirSync(outDir, { recursive: true });

// 1. WASM runtime: monorepo hoisting means it may be in root node_modules.
const wasmCandidates = [
  join(webRoot, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm'),
  join(webRoot, '..', '..', 'node_modules', '@mediapipe', 'tasks-vision', 'wasm'),
];
const wasmFrom = wasmCandidates.find((p) => existsSync(p));
if (!wasmFrom) {
  console.error('[copy-mediapipe] @mediapipe/tasks-vision/wasm not found; is @mediapipe/tasks-vision installed?');
  process.exit(1);
}
cpSync(wasmFrom, join(outDir, 'wasm'), { recursive: true });

// 2. Face-landmarker model, vendored in the repo.
const modelFrom = join(webRoot, 'vendor', 'mediapipe', 'face_landmarker.task');
if (!existsSync(modelFrom)) {
  console.error(`[copy-mediapipe] vendored model missing at ${modelFrom}`);
  process.exit(1);
}
copyFileSync(modelFrom, join(outDir, 'face_landmarker.task'));

// The loader needs the SIMD glue file; if it's absent the resolver silently
// fails and proctoring never starts.
if (!existsSync(join(outDir, 'wasm', 'vision_wasm_internal.js'))) {
  console.error('[copy-mediapipe] FAILED: wasm/vision_wasm_internal.js missing after copy');
  process.exit(1);
}
console.log(`[copy-mediapipe] wasm ${wasmFrom} + model -> ${outDir}`);
