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
        // ponytail: no readyState gate here — jsdom always reports readyState 0,
        // which would make this interval a permanent no-op under test. In real
        // browsers an early call before the first frame just yields a stale/empty
        // detection that self-corrects on the next 500ms tick.
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
