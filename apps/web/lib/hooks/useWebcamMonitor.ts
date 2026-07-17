'use client';

import { useEffect, useRef } from 'react';
import { detectViolationReason, ViolationReason } from '../webcam-detection';
import { useReportWebcamViolation } from './useAttempt';

const SAMPLE_INTERVAL_MS = 500;
const SUSTAINED_VIOLATION_MS = 3000;
const MEDIAPIPE_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const FACE_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export function useWebcamMonitor(enabled: boolean): void {
  const reportViolation = useReportWebcamViolation();
  const reportRef = useRef(reportViolation.mutate);
  reportRef.current = reportViolation.mutate;

  useEffect(() => {
    if (!enabled) return;
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
    let violationSince: number | null = null;
    let currentReason: ViolationReason | null = null;
    let alreadyReported = false;

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;

    async function setup() {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const filesetResolver = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
      const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL_URL },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
      });
      if (cancelled) {
        landmarker.close();
        return;
      }

      stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
      await video.play();

      intervalId = setInterval(() => {
        if (video.readyState < 2) return;

        const result = landmarker.detectForVideo(video, performance.now());
        const reason = detectViolationReason(result);
        const now = Date.now();

        if (reason === null) {
          violationSince = null;
          currentReason = null;
          alreadyReported = false;
          return;
        }

        if (currentReason !== reason) {
          currentReason = reason;
          violationSince = now;
          alreadyReported = false;
          return;
        }

        if (!alreadyReported && violationSince !== null && now - violationSince >= SUSTAINED_VIOLATION_MS) {
          alreadyReported = true;
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          canvas.getContext('2d')?.drawImage(video, 0, 0);
          reportRef.current({ reason, snapshot: canvas.toDataURL('image/jpeg', 0.5) });
        }
      }, SAMPLE_INTERVAL_MS);
    }

    setup().catch(() => {
      // Camera/model failure mid-attempt fails safe toward flagging (a sustained "no
      // face" violation) rather than silently disabling the check.
      reportRef.current({ reason: 'no_face', snapshot: '' });
    });

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [enabled]);
}
