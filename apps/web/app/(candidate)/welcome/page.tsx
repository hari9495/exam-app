'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PracticeStep } from '../components/PracticeStep';
import { FaceEnrolmentStep, EnrolmentPolicy, FaceEnrolmentPayload } from '../components/FaceEnrolmentStep';
import { useAskForHelp, useAttemptQuery, useCandidateHelp, useFaceEnrolment, useReuseOffer, useStartAttempt } from '../../../lib/hooks/useAttempt';
import { ConsentScreen, ReadyToStartScreen, approvedForYou, type LiveConsent, type LiveReadyToStart, type ManualIdentityCheck } from '@yukthix/ui/assessments';
import { isAttemptStarted } from '../../../lib/types';
import { useToast } from '../../../components/ui';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';
import { reportClientError } from '../../../lib/client-error-reporter';

export default function CandidateWelcomePage() {
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useCandidateAuth();
  const { data: current, isLoading, isError } = useAttemptQuery();
  const startAttempt = useStartAttempt();
  // AS-3 (PRC-32): an earlier result this invitation may use (or already uses) is offered first; "retake" skips it.
  const { data: reuse } = useReuseOffer();
  const faceEnrolment = useFaceEnrolment();
  // AS-4b (answers 2011, 2164): help asked for before the test, and what was approved.
  const help = useCandidateHelp();
  const askForHelp = useAskForHelp();
  const { toast } = useToast();
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'checking' | 'granted' | 'denied'>('idle');
  // AS-4a part 2 (answer 2201): practice, then the designed consent (PRC-24), then the designed selfie (PRC-25) when a
  // photo check applies, then the start card.
  const [step, setStep] = useState<'practice' | 'consent' | 'identity' | 'start'>('practice');
  const [declined, setDeclined] = useState(false);
  const [multiMonitorBlocked, setMultiMonitorBlocked] = useState(false);
  const [screenShareUnsupported, setScreenShareUnsupported] = useState(false);
  const [faceStatus, setFaceStatus] = useState<'pending' | 'enrolled' | 'not_verified'>('pending');
  // FaceEnrolment rows are keyed on the attempt, and the enrolment step renders here IN PLACE OF
  // the Start button -- so while it is on screen there is no attempt to key a row to. The payload
  // waits here and is POSTed the moment /attempt/start returns.
  const [facePayload, setFacePayload] = useState<FaceEnrolmentPayload | null>(null);

  useEffect(() => {
    if (!authLoading && !accessToken) {
      router.push('/session-ended');
    } else if (isError) {
      router.push('/session-ended');
    } else if (current && isAttemptStarted(current) && current.status !== 'in_progress') {
      router.push('/submitted');
    } else if (current && isAttemptStarted(current)) {
      router.push('/exam');
    } else if (reuse?.reused || (reuse?.offer && !new URLSearchParams(window.location.search).has('retake'))) {
      router.push('/reuse');
    }
  }, [current, isError, router, accessToken, authLoading, reuse]);

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
  // AS-4b (PRC-24): an approved manual identity check lets the candidate start without the photo.
  const approvedHelp = help.data?.approved ?? [];
  const manualCheckApproved = approvedHelp.includes('identity');
  const manualCheckAsked = help.data?.request?.status === 'pending' && help.data.request.kinds.includes('identity');
  const approvedLine = approvedForYou(approvedHelp, help.data?.extraTimePercent ?? 0);
  const policy = (proctoring?.faceEnrolmentPolicy as EnrolmentPolicy | undefined) ?? 'retry_then_allow';
  const manualCheck: ManualIdentityCheck = {
    state: manualCheckApproved ? 'approved' : manualCheckAsked ? 'asked' : 'none',
    onAsk: () => askForHelp.mutateAsync({ kinds: ['identity'], extraTimePercent: null, note: null, evidence: null }),
  };

  if (step === 'practice') {
    return (
      <div className="mx-auto flex flex-1 max-w-xl flex-col justify-center gap-6 p-8">
        <PracticeStep onDone={() => setStep('consent')} />
      </div>
    );
  }

  if (step === 'consent') {
    const camera = proctoring?.webcamEnabled !== false;
    const consent: LiveConsent = {
      candidateName: current.candidateName,
      companyName: current.organizationName ?? '',
      testName: current.exam.title,
      rows: [
        { what: 'Camera', how: camera ? 'Snapshots and checks that your face is in view' : 'Not used for this test', on: camera },
        { what: 'Screen', how: proctoring?.screenCaptureEnabled ? 'Screenshots of your whole screen when a rule is broken' : 'Not recorded', on: Boolean(proctoring?.screenCaptureEnabled) },
        { what: 'Browser activity', how: 'Tab switches, leaving full screen, copy and paste, right-click, developer tools', on: true },
        { what: 'Code editor activity', how: 'Paste sizes and typing amounts in code answers', on: true },
        { what: 'Photo check', how: faceVerificationRequired ? 'A photo at the start, to check it is still you during the test' : 'Not used for this test', on: faceVerificationRequired },
      ],
      retentionDays: current.exam.evidenceRetentionDays ?? 30,
      faceChecks: faceVerificationRequired,
      faceRequired: policy === 'require_enrolment',
      // Honor-system attestation -- a browser cannot see or close other apps, so this sets the
      // expectation up front; the periodic AI screen analysis is what actually verifies it.
      attestation: 'I have closed all other applications, browser windows and tabs, including messaging apps and any screen-sharing or remote-access tools',
      declined,
      manual: faceVerificationRequired && policy === 'require_enrolment' ? manualCheck : null,
      onDecline: () => setDeclined(true),
      onAgree: ({ faceChecks }) => {
        setDeclined(false);
        if (!faceVerificationRequired || manualCheckApproved) return setStep('start');
        if (faceChecks) return setStep('identity');
        // A refusal is still a fact about this candidate: recorded as not_verified with no image and no consent,
        // so it never reads as a test that simply had the check switched off.
        setFacePayload({ status: 'not_verified', consentGiven: false });
        setFaceStatus('not_verified');
        setStep('start');
      },
    };
    return <ConsentScreen live={consent} />;
  }

  if (step === 'identity') {
    return (
      <FaceEnrolmentStep
        policy={policy}
        candidateName={current.candidateName}
        companyName={current.organizationName ?? ''}
        manualCheck={manualCheck}
        onSettled={(payload) => {
          setFacePayload(payload);
          setFaceStatus(payload.status);
          setStep('start');
        }}
      />
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
      // Only now does an attempt exist to hang the enrolment row off. Best-effort on purpose:
      // if this POST fails the candidate is already in the exam and stays in it, unenrolled --
      // a candidate must never be stuck. (Under require_enrolment they never reached this
      // button without a settled enrolment in the first place.)
      if (facePayload) {
        try {
          await faceEnrolment.mutateAsync(facePayload);
        } catch (error) {
          reportClientError(accessToken, {
            kind: 'face_enrolment_failed',
            message: error instanceof Error ? error.message : 'Face enrolment record failed',
            severity: 'warn',
          });
        }
      }
      router.push('/exam');
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't start the exam — please try again.", 'error');
      reportClientError(accessToken, {
        kind: 'start_failed',
        message: error instanceof Error ? error.message : 'Start attempt failed',
      });
    }
  }

  // Answer 2232: the designed "Ready to start" step (PRC-22) in place of the older start card.
  const ready: LiveReadyToStart = {
    companyName: current.organizationName ?? '',
    candidateName: current.candidateName,
    testTitle: current.exam.title,
    durationMinutes: current.exam.durationMinutes,
    sections: current.sections.map((section) => ({ title: section.title, questions: section.questionCount })),
    instructions: current.exam.instructions ?? null,
    notes: [
      ...(approvedLine ? [`${approvedLine}.`] : []),
      ...(manualCheckApproved && faceVerificationRequired ? ['A manual identity check was approved for you: no photo is needed to start.'] : []),
    ],
    window:
      current.schedulingWindowState === 'not_open'
        ? { state: 'not_open', opensAt: current.exam.availabilityWindowStart ? new Date(current.exam.availabilityWindowStart).toLocaleString() : null }
        : current.schedulingWindowState === 'closed'
          ? { state: 'closed' }
          : { state: 'open' },
    camera:
      proctoring?.webcamEnabled === false
        ? null
        : { state: cameraStatus === 'granted' ? 'on' : cameraStatus === 'checking' ? 'checking' : cameraStatus === 'denied' ? 'blocked' : 'off', onTurnOn: handleEnableCamera },
    problem: multiMonitorBlocked
      ? 'Please disconnect additional displays before starting the test.'
      : screenShareUnsupported
        ? 'This test records your screen, which this browser does not support. Please use desktop Chrome, Edge or Firefox on a computer.'
        : null,
    seb: sebGateActive ? { onDownload: handleDownloadSebConfig } : null,
    // The photo step was not finished (e.g. the page came back to here): go back through it.
    onPhoto: faceVerificationRequired && faceStatus === 'pending' && !manualCheckApproved ? () => setStep('consent') : undefined,
    onAccommodation: () => router.push('/accommodation'),
    onReadiness: () => router.push('/readiness'),
    onMyTests: () => router.push('/my-tests'),
    // faceEnrolment.isPending matters because the enrolment POST runs AFTER start resolves: without it the button
    // re-enables mid-flight and a second click would try to start the attempt all over again.
    starting: startAttempt.isPending || faceEnrolment.isPending,
    onStart: handleStart,
  };
  return <ReadyToStartScreen live={ready} />;
}
