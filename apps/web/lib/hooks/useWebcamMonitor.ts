'use client';

import { useEffect, useRef } from 'react';
// The `./face/similarity` subpath, not the package root: `@exam-platform/shared`'s barrel
// (dist/index.js) also re-exports server-only modules (Prisma, the Anthropic/OpenAI SDKs,
// Nest's CryptoModule) that don't run in a browser and pull in Node-only shims -- importing the
// root here broke the Next.js client bundle. cosineSimilarity/classifySimilarity have no such
// dependency, so packages/shared/package.json exposes them on their own "exports" subpath.
import { cosineSimilarity, classifySimilarity, FaceVerdict } from '@exam-platform/shared/face/similarity';
import { detectViolationReason, detectLookingDown, ViolationReason } from '../webcam-detection';
import { createViolationVoter } from '../webcam-voting';
import { createBrowserEmbedder } from '../face-embedder';
import { useReportProctoringEvent, useReportWebcamSnapshot, useReportWebcamViolation } from './useAttempt';
import { ExamProctoringConfig } from '../types';

const SAMPLE_INTERVAL_MS = 500;
const PERIODIC_SNAPSHOT_MIN_MS = 120_000;
const PERIODIC_SNAPSHOT_MAX_MS = 180_000;
// Far more expensive than the 500ms landmark loop above (a full model forward pass, not
// landmark geometry), so the browser advisory tier runs on its own, much slower interval.
const IDENTITY_HINT_INTERVAL_MS = 4_000;

// The browser tier is advisory only: `onHint` may update a candidate-facing hint and nothing
// else. It must never be wired to report an event, set a flag, or otherwise touch exam state --
// only the server tier decides those. `referenceEmbedding` is whatever the page currently holds
// (e.g. decoded from an enrolment embedding); pass null while none is available yet, which the
// hook treats as "nothing to compare against" rather than as a failure.
export interface IdentityHintConfig {
  referenceEmbedding: Float32Array | null;
  onHint: (verdict: FaceVerdict | null) => void;
}
// Self-hosted from the app's own origin, NOT jsdelivr / storage.googleapis.com.
// Candidates take proctored exams on locked-down office networks that block
// third-party CDNs; loading the MediaPipe runtime or model cross-origin left
// webcam proctoring unable to initialise, which on a webcam-required exam blocks
// the candidate entirely. scripts/copy-mediapipe.mjs populates /mediapipe/* at
// build time (wasm from node_modules, model vendored in the repo). See ADO #6826.
export const MEDIAPIPE_WASM_URL = '/mediapipe/wasm';
export const FACE_LANDMARKER_MODEL_URL = '/mediapipe/face_landmarker.task';

function captureSnapshot(video: HTMLVideoElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d')?.drawImage(video, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.5);
}

export function useWebcamMonitor(
  enabled: boolean,
  onViolationReason?: (reason: string) => void,
  config?: ExamProctoringConfig,
  capture?: () => string | null,
  identity?: IdentityHintConfig,
): void {
  const reportViolation = useReportWebcamViolation();
  const reportViolationRef = useRef(reportViolation.mutate);
  reportViolationRef.current = reportViolation.mutate;

  // Same ref-mirror pattern useProctoringMonitor uses for its `capture` -- identity-stable in
  // practice (useScreenCapture), but mirrored anyway so the effect below still depends only on
  // [enabled] and never re-subscribes (tearing down and restarting the camera/model) when a
  // function identity changes.
  const captureRef = useRef(capture);
  captureRef.current = capture;

  const reportEvent = useReportProctoringEvent();
  const reportEventRef = useRef(reportEvent);
  reportEventRef.current = reportEvent;

  const reportSnapshot = useReportWebcamSnapshot();
  const reportSnapshotRef = useRef(reportSnapshot);
  reportSnapshotRef.current = reportSnapshot;

  const onViolationRef = useRef(onViolationReason);
  onViolationRef.current = onViolationReason;

  const configRef = useRef(config);
  configRef.current = config;

  // `identity` (its reference embedding especially) can change identity every render -- same
  // ref-mirror reasoning as `capture` above, so a fresh object here never tears down and
  // restarts the camera/model.
  const identityRef = useRef(identity);
  identityRef.current = identity;

  useEffect(() => {
    // webcamEnabled === false must bail before setup() -- see the fail-safe below,
    // which reports a real no_face violation if the camera cannot be acquired.
    if (!enabled || configRef.current?.webcamEnabled === false) return;
    // E2E specs mock navigator.mediaDevices with a plain object, not a real MediaStream —
    // assigning it to video.srcObject throws, and setup()'s fail-safe below would then flag
    // a real webcam violation on every long-running spec. Playwright's init scripts set this
    // flag to skip webcam monitoring entirely in that environment; the rest of each spec's
    // flow (answering, running code, submitting) still exercises the real, unmocked behavior.
    // Gated on NODE_ENV !== 'production' so this escape hatch is dead-code-eliminated from
    // production bundles -- a candidate flipping the flag from devtools in prod cannot disable
    // proctoring.
    if (
      process.env.NODE_ENV !== 'production' &&
      typeof window !== 'undefined' &&
      (window as unknown as { __DISABLE_WEBCAM_MONITOR__?: boolean }).__DISABLE_WEBCAM_MONITOR__
    ) {
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let snapshotTimer: ReturnType<typeof setTimeout> | undefined;
    let identityIntervalId: ReturnType<typeof setInterval> | undefined;
    // Self-hosted, like MEDIAPIPE_WASM_URL below -- but unlike that model, this one (see
    // face-embedder.ts) is gated on a licensing review and does not exist yet. Unset in every
    // environment today, which is exactly what keeps this tier off: no env var, no embedder, no
    // difference to the candidate. Read here (not hoisted to module scope) so Next.js's
    // build-time inlining of NEXT_PUBLIC_* still applies -- it replaces the expression textually,
    // not just at module top level.
    const modelUrl = process.env.NEXT_PUBLIC_FACE_EMBEDDING_MODEL_URL;
    const embedder = modelUrl ? createBrowserEmbedder(modelUrl) : null;

    // Two independent voters debounce raw per-sample detections into confirmed episodes:
    // strike-worthy violations (8-sample window, 5 to confirm) and report-only looking_down
    // (24-sample window, 20 to confirm -- much less trigger-happy since a candidate glancing
    // down briefly is normal).
    const violationVoter = createViolationVoter({ windowSize: 8, threshold: 5 });
    const lookingVoter = createViolationVoter({ windowSize: 24, threshold: 20 });

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;

    function scheduleSnapshot() {
      const delay = PERIODIC_SNAPSHOT_MIN_MS + Math.random() * (PERIODIC_SNAPSHOT_MAX_MS - PERIODIC_SNAPSHOT_MIN_MS);
      snapshotTimer = setTimeout(() => {
        if (video.readyState >= 2) reportSnapshotRef.current(captureSnapshot(video));
        scheduleSnapshot();
      }, delay);
    }

    async function setup() {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const filesetResolver = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
      const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL_URL },
        runningMode: 'VIDEO',
        numFaces: 2,
        outputFacialTransformationMatrixes: true,
      });
      if (cancelled) {
        landmarker.close();
        return;
      }

      stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
      await video.play();

      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      intervalId = setInterval(() => {
        if (video.readyState < 2) return;

        const result = landmarker.detectForVideo(video, performance.now());

        // Strike-worthy violations and the report-only looking_down signal are voted on
        // independently from the same frame -- one confirming does not suppress the other.
        const confirmedViolation = violationVoter.push(detectViolationReason(result));
        if (confirmedViolation) {
          reportViolationRef.current({
            reason: confirmedViolation as ViolationReason,
            snapshot: captureSnapshot(video),
            screenshot: captureRef.current?.() ?? undefined,
          });
          onViolationRef.current?.(confirmedViolation);
        }

        const confirmedLookingDown = lookingVoter.push(detectLookingDown(result) ? 'looking_down' : null);
        if (confirmedLookingDown) {
          reportEventRef.current('looking_down');
        }
      }, SAMPLE_INTERVAL_MS);

      // Separate, much slower interval -- never on the SAMPLE_INTERVAL_MS landmark tick above.
      // Advisory only: the result only ever reaches `identity.onHint`, never reportViolationRef,
      // reportEventRef, or anything else that could flag the candidate.
      if (embedder) {
        identityIntervalId = setInterval(() => {
          const currentIdentity = identityRef.current;
          if (!currentIdentity || !currentIdentity.referenceEmbedding || video.readyState < 2) return;
          const referenceEmbedding = currentIdentity.referenceEmbedding;
          embedder
            .embed(video)
            .then((liveEmbedding) => {
              if (cancelled || !liveEmbedding) return;
              const score = cosineSimilarity(liveEmbedding, referenceEmbedding);
              identityRef.current?.onHint(classifySimilarity(score));
            })
            .catch(() => {
              // Belt and braces: embed() already never rejects, but this loop must never be the
              // thing that turns a model hiccup into an unhandled rejection on the exam page.
            });
        }, IDENTITY_HINT_INTERVAL_MS);
      }

      scheduleSnapshot();
    }

    setup().catch(() => {
      // Camera/model failure mid-attempt fails safe toward flagging (a "no face" violation)
      // rather than silently disabling the check. Still attach a screen capture where possible --
      // this is exactly the kind of machine misfire the feature exists to give a reviewer
      // evidence for.
      reportViolationRef.current({ reason: 'no_face', snapshot: '', screenshot: captureRef.current?.() ?? undefined });
    });

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (identityIntervalId) clearInterval(identityIntervalId);
      if (snapshotTimer) clearTimeout(snapshotTimer);
      stream?.getTracks().forEach((track) => track.stop());
      // Actually releases the ONNX session -- see face-embedder.ts. Without this, every
      // mount/unmount of the exam page (or every attempt re-render that tears the effect down)
      // would leak a session for the life of the tab.
      embedder?.close();
    };
  }, [enabled]);
}
