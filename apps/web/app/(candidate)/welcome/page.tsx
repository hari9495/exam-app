'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Info, ShieldCheck } from 'lucide-react';
import { CandidateButton } from '../components/CandidateButton';
import { CameraPreview } from '../components/CameraPreview';
import { PracticeStep } from '../components/PracticeStep';
import { FaceEnrolmentStep, EnrolmentPolicy } from '../components/FaceEnrolmentStep';
import { useAttemptQuery, useStartAttempt } from '../../../lib/hooks/useAttempt';
import { isAttemptStarted } from '../../../lib/types';
import { useToast } from '../../../components/ui';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';
import { reportClientError } from '../../../lib/client-error-reporter';

export default function CandidateWelcomePage() {
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useCandidateAuth();
  const { data: current, isLoading, isError } = useAttemptQuery();
  const startAttempt = useStartAttempt();
  const { toast } = useToast();
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'checking' | 'granted' | 'denied'>('idle');
  const [consentChecked, setConsentChecked] = useState(false);
  // Honor-system attestation -- a browser cannot see or close other apps, so this sets the
  // expectation up front; the periodic AI screen analysis is what actually verifies it.
  const [appsClosedChecked, setAppsClosedChecked] = useState(false);
  const [step, setStep] = useState<'practice' | 'consent'>('practice');
  const [multiMonitorBlocked, setMultiMonitorBlocked] = useState(false);
  const [screenShareUnsupported, setScreenShareUnsupported] = useState(false);
  const [faceStatus, setFaceStatus] = useState<'pending' | 'enrolled' | 'not_verified'>('pending');

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

  const proctoring = current.exam.proctoring;
  // UX-only detection -- SEB's user agent contains "SEB/x.y". The server independently
  // verifies the SEB ConfigKey hash on /attempt/start, so spoofing this string only gets a
  // candidate as far as a rejected start.
  const inSeb = typeof navigator !== 'undefined' && navigator.userAgent.includes('SEB');
  const sebGateActive = proctoring?.lockdownRequired === true && !inSeb;
  const faceVerificationRequired = proctoring?.faceVerificationEnabled === true;
  const faceGateActive = faceVerificationRequired && faceStatus === 'pending';

  if (step === 'practice') {
    return (
      <div className="mx-auto flex flex-1 max-w-xl flex-col justify-center gap-6 p-8">
        <PracticeStep onDone={() => setStep('consent')} />
      </div>
    );
  }

  async function handleEnableCamera() {
    if (proctoring?.webcamEnabled === false) return;
    setCameraStatus('checking');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((track) => track.stop());
      setCameraStatus('granted');
    } catch {
      setCameraStatus('denied');
    }
  }

  async function handleDownloadSebConfig() {
    try {
      const base = process.env.NEXT_PUBLIC_EXAM_RUNTIME_API_BASE ?? 'http://localhost:3002/api/v1';
      const response = await fetch(`${base}/attempt/seb-config`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!response.ok) {
        throw new Error(`Download failed (${response.status})`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'exam.seb';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      toast('Could not download the exam configuration. Please try again.', 'error');
    }
  }

  async function handleStart() {
    // Re-checked on every click: unplugging the display then clicking again proceeds.
    // undefined (Firefox/Safari) can't be detected -- fail open, matching the
    // platform's client-side proctoring posture.
    const watchesMultiMonitor = !proctoring?.disabledSignals.includes('multi_monitor_detected');
    if (watchesMultiMonitor && (window.screen as Screen & { isExtended?: boolean }).isExtended === true) {
      setMultiMonitorBlocked(true);
      return;
    }
    setMultiMonitorBlocked(false);

    if (proctoring?.screenCaptureEnabled && typeof navigator.mediaDevices?.getDisplayMedia !== 'function') {
      setScreenShareUnsupported(true);
      return;
    }
    setScreenShareUnsupported(false);

    try {
      await startAttempt.mutateAsync();
      router.push('/exam');
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't start the exam — please try again.", 'error');
      reportClientError(accessToken, {
        kind: 'start_failed',
        message: error instanceof Error ? error.message : 'Start attempt failed',
      });
    }
  }

  return (
    <div className="mx-auto flex flex-1 max-w-xl flex-col justify-center gap-6 p-8">
      <div className="rounded-lg border border-candidate-border bg-white p-6 shadow-sm">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-candidate-primary">
          Hi, {current.candidateName} — you&apos;re invited to
        </p>
        <h1 className="mb-3 text-xl font-bold text-candidate-text">{current.exam.title}</h1>
        <p className="mb-4 text-sm text-candidate-text-secondary">Duration: {current.exam.durationMinutes} minutes</p>
        {current.sections.length > 0 ? (
          <div className="mb-4 rounded-md border border-candidate-border p-3">
            <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-candidate-text-secondary">What&apos;s In This Exam</h2>
            <ul className="text-sm text-candidate-text-secondary">
              {current.sections.map((section) => (
                <li key={section.title} className="flex justify-between py-0.5">
                  <span>{section.title}</span>
                  <span>{section.questionCount} question{section.questionCount === 1 ? '' : 's'}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-candidate-text-tertiary">
              {(() => {
                const total = current.sections.reduce((sum, section) => sum + section.questionCount, 0);
                return `${total} question${total === 1 ? '' : 's'} total`;
              })()}
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
                <h2 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-candidate-text-secondary">
                  <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Instructions
                </h2>
                <p className="whitespace-pre-wrap text-sm text-candidate-text-secondary">{current.exam.instructions}</p>
              </div>
            ) : null}

            <div className="mb-4 rounded-md border border-candidate-border p-3">
              <h2 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-candidate-text-secondary">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Monitoring &amp; Consent
              </h2>
              <p className="mb-2 text-xs text-candidate-text-secondary">This exam is monitored. While you take it, we collect:</p>
              <ul className="mb-2 list-disc pl-4 text-xs text-candidate-text-secondary">
                {proctoring?.webcamEnabled !== false ? <li>Webcam snapshots and face-presence checks</li> : null}
                {proctoring?.screenCaptureEnabled ? <li>Screenshots of your entire screen when a rule is broken</li> : null}
                <li>Browser activity (tab switches, fullscreen exits, copy/paste, right-click, developer tools)</li>
                <li>Code-editor activity (paste sizes, typing-volume aggregates)</li>
              </ul>
              <p className="mb-3 text-xs text-candidate-text-secondary">
                Seen by the hiring organization&apos;s staff and stored with your attempt.
              </p>
              {proctoring?.webcamEnabled !== false ? <CameraPreview status={cameraStatus} onEnable={handleEnableCamera} /> : null}
              <label className="mt-3 flex items-start gap-2 text-xs text-candidate-text-secondary">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(event) => setConsentChecked(event.target.checked)}
                  className="mt-0.5"
                />
                I understand and consent to monitoring during this exam
              </label>
              <label className="mt-2 flex items-start gap-2 text-xs text-candidate-text-secondary">
                <input
                  type="checkbox"
                  checked={appsClosedChecked}
                  onChange={(event) => setAppsClosedChecked(event.target.checked)}
                  className="mt-0.5"
                />
                I have closed all other applications, browser windows and tabs — including messaging
                apps and any screen-sharing or remote-access tools
              </label>
              <p className="mt-1 text-xs text-candidate-text-tertiary">
                If you do not consent, close this page and contact your recruiter.
              </p>
            </div>

            {multiMonitorBlocked ? (
              <div className="mb-3 rounded-md border border-candidate-danger-border bg-candidate-danger-bg p-3 text-sm text-candidate-danger">
                Please disconnect additional displays before starting the exam.
              </div>
            ) : null}

            {screenShareUnsupported ? (
              <div className="mb-3 rounded-md border border-candidate-danger-border bg-candidate-danger-bg p-3 text-sm text-candidate-danger">
                This exam records your screen, which this browser does not support. Please use desktop Chrome, Edge or Firefox on a computer.
              </div>
            ) : null}

            {sebGateActive ? (
              <div className="mb-3 rounded-md border border-candidate-border p-3">
                <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-candidate-text-secondary">
                  Safe Exam Browser Required
                </h2>
                <p className="mb-2 text-xs text-candidate-text-secondary">
                  This exam can only be taken inside Safe Exam Browser, which locks your computer to the exam and closes
                  other applications while you take it.
                </p>
                <ol className="mb-3 list-decimal pl-4 text-xs text-candidate-text-secondary">
                  <li>
                    Install Safe Exam Browser from{' '}
                    <a href="https://safeexambrowser.org/download_en.html" target="_blank" rel="noreferrer" className="underline">
                      safeexambrowser.org
                    </a>
                  </li>
                  <li>Download your exam configuration below</li>
                  <li>Open the downloaded file — Safe Exam Browser will bring you back to this page, ready to start</li>
                </ol>
                <CandidateButton onClick={handleDownloadSebConfig} className="w-full">
                  Download exam configuration (.seb)
                </CandidateButton>
              </div>
            ) : faceGateActive ? (
              <FaceEnrolmentStep
                policy={(proctoring?.faceEnrolmentPolicy as EnrolmentPolicy | undefined) ?? 'retry_then_allow'}
                onSettled={setFaceStatus}
              />
            ) : proctoring?.webcamEnabled === false || cameraStatus === 'granted' ? (
              <CandidateButton onClick={handleStart} disabled={startAttempt.isPending || !consentChecked || !appsClosedChecked} className="w-full">
                {startAttempt.isPending ? 'Starting…' : 'Start exam'}
              </CandidateButton>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
