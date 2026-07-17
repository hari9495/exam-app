'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CandidateButton } from '../components/CandidateButton';
import { CameraPreview } from '../components/CameraPreview';
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
              <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-candidate-text-secondary">Camera monitoring</h2>
              <p className="mb-3 text-xs text-candidate-text-secondary">
                This exam is monitored. Tab switches, exiting fullscreen, copy/paste, right-click, developer tools, and your
                webcam will be reported.
              </p>
              <CameraPreview status={cameraStatus} onEnable={handleEnableCamera} />
            </div>

            {cameraStatus === 'granted' ? (
              <CandidateButton onClick={handleStart} disabled={startAttempt.isPending} className="w-full">
                {startAttempt.isPending ? 'Starting…' : 'Start exam'}
              </CandidateButton>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
