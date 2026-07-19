'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CandidateButton } from '../components/CandidateButton';
import { CameraPreview } from '../components/CameraPreview';
import { PracticeStep } from '../components/PracticeStep';
import { useAttemptQuery, useStartAttempt } from '../../../lib/hooks/useAttempt';
import { isAttemptStarted } from '../../../lib/types';
import { useToast } from '../../../components/ui';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';

export default function CandidateWelcomePage() {
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useCandidateAuth();
  const { data: current, isLoading, isError } = useAttemptQuery();
  const startAttempt = useStartAttempt();
  const { toast } = useToast();
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'checking' | 'granted' | 'denied'>('idle');
  const [consentChecked, setConsentChecked] = useState(false);
  const [step, setStep] = useState<'practice' | 'consent'>('practice');

  useEffect(() => {
    if (!authLoading && !accessToken) {
      router.push('/session-ended');
    } else if (isError) {
      router.push('/session-ended');
    } else if (current && isAttemptStarted(current) && current.status !== 'in_progress') {
      router.push('/submitted');
    } else if (current && isAttemptStarted(current)) {
      router.push('/exam');
    }
  }, [current, isError, router, accessToken, authLoading]);

  if (isLoading || isError || !current || isAttemptStarted(current)) {
    return <p className="p-8 text-sm text-candidate-text-tertiary">Loading…</p>;
  }

  if (step === 'practice') {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-8">
        <PracticeStep onDone={() => setStep('consent')} />
      </div>
    );
  }

  async function handleEnableCamera() {
    setCameraStatus('checking');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((track) => track.stop());
      setCameraStatus('granted');
    } catch {
      setCameraStatus('denied');
    }
  }

  async function handleStart() {
    try {
      await startAttempt.mutateAsync();
      router.push('/exam');
    } catch {
      toast("Couldn't start the exam — please check your connection and try again.", 'error');
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-8">
      <div className="rounded-lg border border-candidate-border bg-white p-6 shadow-sm">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-candidate-primary">You&apos;re invited to</p>
        <h1 className="mb-3 text-xl font-bold text-candidate-text">{current.exam.title}</h1>
        <p className="mb-4 text-sm text-candidate-text-secondary">Duration: {current.exam.durationMinutes} minutes</p>
        {current.sections.length > 0 ? (
          <div className="mb-4 rounded-md border border-candidate-border p-3">
            <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-candidate-text-secondary">What&apos;s in this exam</h2>
            <ul className="text-sm text-candidate-text-secondary">
              {current.sections.map((section) => (
                <li key={section.title} className="flex justify-between py-0.5">
                  <span>{section.title}</span>
                  <span>{section.questionCount} question{section.questionCount === 1 ? '' : 's'}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-candidate-text-tertiary">
              {current.sections.reduce((sum, section) => sum + section.questionCount, 0)} questions total
            </p>
          </div>
        ) : null}

        {current.schedulingWindowState === 'not_open' ? (
          <div className="rounded-md border border-candidate-border bg-candidate-bg p-3 text-sm text-candidate-text-secondary">
            This exam opens on {new Date(current.exam.availabilityWindowStart as string).toLocaleString()}. Come back then to start.
          </div>
        ) : current.schedulingWindowState === 'closed' ? (
          <div className="rounded-md border border-candidate-danger-border bg-candidate-danger-bg p-3 text-sm text-candidate-danger">
            This exam&apos;s availability window has closed. Please contact the recruiter who invited you.
          </div>
        ) : (
          <>
            {current.exam.instructions ? (
              <div className="mb-3 rounded-md border border-candidate-border p-3">
                <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-candidate-text-secondary">Instructions</h2>
                <p className="whitespace-pre-wrap text-sm text-candidate-text-secondary">{current.exam.instructions}</p>
              </div>
            ) : null}

            <div className="mb-4 rounded-md border border-candidate-border p-3">
              <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-candidate-text-secondary">Monitoring &amp; consent</h2>
              <p className="mb-2 text-xs text-candidate-text-secondary">This exam is monitored. While you take it, we collect:</p>
              <ul className="mb-2 list-disc pl-4 text-xs text-candidate-text-secondary">
                <li>Webcam snapshots and face-presence checks</li>
                <li>Browser activity (tab switches, fullscreen exits, copy/paste, right-click, developer tools)</li>
                <li>Code-editor activity (paste sizes, typing-volume aggregates)</li>
              </ul>
              <p className="mb-3 text-xs text-candidate-text-secondary">
                Seen by the hiring organization&apos;s staff and stored with your attempt.
              </p>
              <CameraPreview status={cameraStatus} onEnable={handleEnableCamera} />
              <label className="mt-3 flex items-start gap-2 text-xs text-candidate-text-secondary">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(event) => setConsentChecked(event.target.checked)}
                  className="mt-0.5"
                />
                I understand and consent to monitoring during this exam
              </label>
              <p className="mt-1 text-xs text-candidate-text-tertiary">
                If you do not consent, close this page and contact your recruiter.
              </p>
            </div>

            {cameraStatus === 'granted' ? (
              <CandidateButton onClick={handleStart} disabled={startAttempt.isPending || !consentChecked} className="w-full">
                {startAttempt.isPending ? 'Starting…' : 'Start exam'}
              </CandidateButton>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
