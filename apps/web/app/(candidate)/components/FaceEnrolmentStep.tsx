'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { assessFaceQuality } from '../../../lib/face-quality';
import { createBlinkChallenge } from '../../../lib/face-liveness';
import { MEDIAPIPE_WASM_URL, FACE_LANDMARKER_MODEL_URL } from '../../../lib/hooks/useWebcamMonitor';

export type EnrolmentPolicy = 'allow_unenrolled' | 'retry_then_allow' | 'require_enrolment';
type Phase = 'consent' | 'capture' | 'blocked';

// What the exam-runtime's POST /attempt/face-enrolment body looks like. This step BUILDS it and
// hands it up; it deliberately does not send it. The row is keyed on the attempt, and this step
// renders on the welcome page IN PLACE OF the Start button -- so at this moment there is no
// attempt to key it to and the POST could only ever 400. The welcome page holds the payload and
// sends it the instant /attempt/start returns. Consent is still given before anything is
// captured; only the moment of recording moves, by a few seconds.
export interface FaceEnrolmentPayload {
  status: 'enrolled' | 'not_verified';
  snapshot?: string;
  qualityJson?: string;
  consentGiven: boolean;
}

const MAX_ATTEMPTS = 3;
// Wall clock for a whole attempt: model load, camera permission, and the blink itself. Generous
// enough for a cold model fetch on a slow office network, short enough that three attempts still
// resolve in about a minute. Exported so the test asserts against the same budget.
export const ATTEMPT_TIMEOUT_MS = 20_000;

// allow_unenrolled and retry_then_allow are separate dropdown options and must not behave
// identically: "allow unenrolled" means don't labour the point -- the first failure settles.
// retry_then_allow spends all three attempts before giving up. require_enrolment retries too,
// and blocks instead of settling.
function attemptBudget(policy: EnrolmentPolicy): number {
  return policy === 'allow_unenrolled' ? 1 : MAX_ATTEMPTS;
}

interface Props {
  policy: EnrolmentPolicy;
  onSettled: (payload: FaceEnrolmentPayload) => void;
}

export function FaceEnrolmentStep({ policy, onSettled }: Props) {
  const [phase, setPhase] = useState<Phase>('consent');
  const [attempts, setAttempts] = useState(0);
  const [hint, setHint] = useState('Look at the camera and blink.');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const maxAttempts = attemptBudget(policy);

  function handleDecline() {
    if (policy === 'require_enrolment') {
      setPhase('blocked');
      return;
    }
    // A refusal is still a fact about this candidate. The server records it as not_verified with
    // no image and no consent moment, so a decline never reads as an exam that simply had the
    // feature switched off.
    onSettled({ status: 'not_verified', consentGiven: false });
  }

  // Called once the blink challenge is satisfied AND the quality gate passes.
  const handleCaptured = useCallback(
    (snapshot: string, metrics: unknown) => {
      onSettled({
        status: 'enrolled',
        snapshot,
        qualityJson: JSON.stringify(metrics),
        consentGiven: true,
      });
    },
    [onSettled],
  );

  // Side effects stay OUT of the setAttempts updater: StrictMode double-invokes updaters in
  // development, which double-fired the settle callback.
  const handleAttemptFailed = useCallback(
    (why: string) => {
      const next = attempts + 1;
      setHint(why);
      setAttempts(next);
      if (next >= attemptBudget(policy)) {
        if (policy === 'require_enrolment') {
          setPhase('blocked');
        } else {
          onSettled({ status: 'not_verified', consentGiven: true });
        }
      }
    },
    [attempts, policy, onSettled],
  );

  useEnrolmentCapture({
    active: phase === 'capture' && attempts < maxAttempts,
    attempt: attempts,
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
        Attempt {Math.min(attempts + 1, maxAttempts)} of {maxAttempts}
      </p>
    </div>
  );
}

function useEnrolmentCapture({
  active,
  attempt,
  videoRef,
  onCaptured,
  onFailed,
}: {
  active: boolean;
  attempt: number;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  onCaptured: (snapshot: string, metrics: unknown) => void;
  onFailed: (why: string) => void;
}) {
  // Same ref-mirror pattern useWebcamMonitor uses: both callbacks close over the react-query
  // mutation object, which is a fresh identity on every render, so depending on them directly made
  // the effect tear down and re-acquire the camera constantly -- including while the success POST
  // was in flight, which leaked the stream and could POST twice.
  const onCapturedRef = useRef(onCaptured);
  onCapturedRef.current = onCaptured;
  const onFailedRef = useRef(onFailed);
  onFailedRef.current = onFailed;

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    let stream: MediaStream | undefined;
    let landmarker: { close: () => void } | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const challenge = createBlinkChallenge();

    // Exactly one terminal outcome per attempt -- capture, failure, or teardown, whichever comes
    // first -- and it stops the tick loop and the deadline below.
    const finish = (report: () => void) => {
      if (cancelled) return;
      cancelled = true;
      report();
    };

    // A blink may simply never be seen: no face in frame, glasses glare, poor light. The challenge
    // deliberately holds its state on a faceless frame, so without a wall clock the tick loop spins
    // forever, onFailed never fires, attempts never increments, and the candidate is stuck on this
    // step under every policy. This ends the attempt wherever it stalled -- model load, permission
    // prompt, or the blink itself -- because a candidate must never be stuck.
    const deadline = setTimeout(() => {
      finish(() =>
        onFailedRef.current(
          'We could not get a clear photo in time. Face the camera in good light, then blink.',
        ),
      );
    }, ATTEMPT_TIMEOUT_MS);

    async function run() {
      try {
        // Same self-hosted model source as useWebcamMonitor -- never a CDN.
        const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
        const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
        const marker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL_URL },
          outputFaceBlendshapes: true,
          runningMode: 'VIDEO',
          numFaces: 2,
        });
        landmarker = marker;
        if (cancelled) {
          marker.close();
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        // Cleanup may have run while either await was in flight: stop the tracks here too, or the
        // candidate's camera light stays on after the step is gone.
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) throw new Error('enrolment video element is gone');
        video.srcObject = stream;
        await video.play();

        const tick = () => {
          if (cancelled) return;
          const result = marker.detectForVideo(video, performance.now());
          if (challenge.push(result) === 'satisfied') {
            const verdict = assessFaceQuality(result);
            if (verdict.ok) {
              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              canvas.getContext('2d')?.drawImage(video, 0, 0);
              const snapshot = canvas.toDataURL('image/jpeg', 0.8);
              finish(() => onCapturedRef.current(snapshot, verdict.metrics));
              return;
            }
            // Quality failed after a genuine blink: that is one spent attempt, and the next
            // attempt needs a fresh blink rather than inheriting this one.
            challenge.reset();
            finish(() => onFailedRef.current(verdict.hint));
            return;
          }
          timer = setTimeout(tick, 200);
        };
        tick();
      } catch {
        // No camera, permission refused, or the model failed to load: one failed attempt,
        // never a stall. The candidate must always be able to move forward.
        finish(() =>
          onFailedRef.current('We could not use your camera. Check it is not in use by another app.'),
        );
      }
    }
    void run();

    return () => {
      cancelled = true;
      clearTimeout(deadline);
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      landmarker?.close();
    };
    // `attempt` is a dependency on purpose: each retry must be a deliberately fresh session
    // (new stream, new model, new blink challenge, new deadline). It used to restart only as a
    // side effect of the callback identities churning above.
  }, [active, attempt, videoRef]);
}
