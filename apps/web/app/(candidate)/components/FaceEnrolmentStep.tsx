'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFaceEnrolment } from '../../../lib/hooks/useAttempt';
import { assessFaceQuality } from '../../../lib/face-quality';
import { createBlinkChallenge } from '../../../lib/face-liveness';
import { MEDIAPIPE_WASM_URL, FACE_LANDMARKER_MODEL_URL } from '../../../lib/hooks/useWebcamMonitor';

export type EnrolmentPolicy = 'allow_unenrolled' | 'retry_then_allow' | 'require_enrolment';
type Phase = 'consent' | 'capture' | 'blocked';

const MAX_ATTEMPTS = 3;

interface Props {
  policy: EnrolmentPolicy;
  onSettled: (status: 'enrolled' | 'not_verified') => void;
}

export function FaceEnrolmentStep({ policy, onSettled }: Props) {
  const [phase, setPhase] = useState<Phase>('consent');
  const [attempts, setAttempts] = useState(0);
  const [hint, setHint] = useState('Look at the camera and blink.');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const enrol = useFaceEnrolment();

  // Every settle path funnels through here so a failure can never leave the candidate on a
  // spinner: if the POST itself fails we still call onSettled, because the exam must go on.
  const settle = useCallback(
    async (status: 'enrolled' | 'not_verified', body: Parameters<typeof enrol.mutateAsync>[0]) => {
      try {
        await enrol.mutateAsync(body);
      } catch {
        // Recording enrolment is best-effort; it must never block the exam.
      }
      onSettled(status);
    },
    [enrol, onSettled],
  );

  function handleDecline() {
    if (policy === 'require_enrolment') {
      setPhase('blocked');
      return;
    }
    void settle('not_verified', { status: 'not_verified', consentGiven: false });
  }

  // Called once the blink challenge is satisfied AND the quality gate passes.
  const handleCaptured = useCallback(
    (snapshot: string, metrics: unknown) => {
      void settle('enrolled', {
        status: 'enrolled',
        snapshot,
        qualityJson: JSON.stringify(metrics),
        consentGiven: true,
      });
    },
    [settle],
  );

  const handleAttemptFailed = useCallback(
    (why: string) => {
      setHint(why);
      setAttempts((previous) => {
        const next = previous + 1;
        if (next >= MAX_ATTEMPTS) {
          if (policy === 'require_enrolment') {
            setPhase('blocked');
          } else {
            void settle('not_verified', { status: 'not_verified', consentGiven: true });
          }
        }
        return next;
      });
    },
    [policy, settle],
  );

  useEnrolmentCapture({
    active: phase === 'capture' && attempts < MAX_ATTEMPTS,
    videoRef,
    onCaptured: handleCaptured,
    onFailed: handleAttemptFailed,
  });

  if (phase === 'blocked') {
    return (
      <div className="rounded-lg border border-candidate-danger-border bg-candidate-danger-bg p-4 text-sm">
        <p className="font-medium text-candidate-danger">We couldn&apos;t take your photo.</p>
        <p className="mt-1">
          This exam requires a photo before you can start. Please contact your recruiter.
        </p>
      </div>
    );
  }

  if (phase === 'consent') {
    return (
      <div className="rounded-lg border border-candidate-border p-4 text-sm">
        <h3 className="mb-2 font-medium">Photo check before you start</h3>
        <p>
          We&apos;ll take a photo of your face and use it only to check that it&apos;s still you
          during this exam. It&apos;s kept for 90 days and deleted when your data is deleted.
        </p>
        {policy === 'require_enrolment' ? (
          <p className="mt-2 text-candidate-text-faint">
            This exam requires the photo &mdash; if you don’t agree, you won’t be able to start.
          </p>
        ) : null}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="rounded bg-candidate-primary px-3 py-1.5 text-white"
            onClick={() => setPhase('capture')}
          >
            I agree
          </button>
          <button
            type="button"
            className="rounded border border-candidate-border px-3 py-1.5"
            onClick={handleDecline}
          >
            I don’t agree
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-candidate-border p-4 text-sm">
      <video ref={videoRef} autoPlay playsInline muted className="w-full max-w-sm rounded" />
      <p className="mt-2">{hint}</p>
      <p className="mt-1 text-xs text-candidate-text-faint">
        Attempt {Math.min(attempts + 1, MAX_ATTEMPTS)} of {MAX_ATTEMPTS}
      </p>
    </div>
  );
}

function useEnrolmentCapture({
  active,
  videoRef,
  onCaptured,
  onFailed,
}: {
  active: boolean;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  onCaptured: (snapshot: string, metrics: unknown) => void;
  onFailed: (why: string) => void;
}) {
  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const challenge = createBlinkChallenge();

    async function run() {
      try {
        // Same self-hosted model source as useWebcamMonitor -- never a CDN.
        const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
        const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
        const landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL_URL },
          outputFaceBlendshapes: true,
          runningMode: 'VIDEO',
          numFaces: 2,
        });
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const tick = () => {
          if (cancelled) return;
          const result = landmarker.detectForVideo(video, performance.now());
          if (challenge.push(result) === 'satisfied') {
            const verdict = assessFaceQuality(result);
            if (verdict.ok) {
              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              canvas.getContext('2d')?.drawImage(video, 0, 0);
              onCaptured(canvas.toDataURL('image/jpeg', 0.8), verdict.metrics);
              return;
            }
            // Quality failed after a genuine blink: that is one spent attempt, and the next
            // attempt needs a fresh blink rather than inheriting this one.
            challenge.reset();
            onFailed(verdict.hint);
            return;
          }
          timer = setTimeout(tick, 200);
        };
        tick();
      } catch {
        // No camera, permission refused, or the model failed to load: one failed attempt,
        // never a stall. The candidate must always be able to move forward.
        if (!cancelled) {
          onFailed('We could not use your camera. Check it is not in use by another app.');
        }
      }
    }
    void run();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [active, videoRef, onCaptured, onFailed]);
}
