'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReadinessCheckScreen, type SystemCheck } from '@yukthix/ui/assessments';
import { useAttemptQuery } from '../../../lib/hooks/useAttempt';
import { isAttemptStarted } from '../../../lib/types';
import { candidateApiFetch } from '../../../lib/candidate-api-client';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';
import { readinessChecks, runProbes, type Needs } from '../../../lib/readiness';

// AS-4b (PRC-22): the designed readiness check, live: the candidate's computer checked in the browser for what this test
// needs (camera, displays, screen sharing, Safe Exam Browser, network, device). Nothing is saved; the start checks again.
export default function CandidateReadinessPage() {
  const router = useRouter();
  const { accessToken } = useCandidateAuth();
  const current = useAttemptQuery();
  const [checks, setChecks] = useState<SystemCheck[] | null>(null);
  const [running, setRunning] = useState(false);
  const preview = current.data && !isAttemptStarted(current.data) ? current.data : null;
  const p = preview?.exam.proctoring;
  const needs: Needs | null = preview
    ? { camera: p?.webcamEnabled !== false, screenShare: Boolean(p?.screenCaptureEnabled), seb: p?.lockdownRequired === true, watchesDisplays: !(p?.disabledSignals ?? []).includes('multi_monitor_detected') }
    : null;
  const key = needs ? JSON.stringify(needs) : null;
  const run = useCallback(async () => {
    if (!key) return;
    const n = JSON.parse(key) as Needs;
    setRunning(true);
    setChecks((c) => (c ?? readinessChecks({ camera: n.camera ? 'ok' : null, extendedDisplay: false, screenShareSupported: true, inSeb: true, secureContext: true, delayMs: 0, cores: null }, n)).map((x) => ({ ...x, status: 'running' as const, detail: 'Checking…', fix: undefined })));
    try {
      setChecks(readinessChecks(await runProbes(n, () => candidateApiFetch('/attempt/accommodation', {}, accessToken ?? undefined)), n));
    } finally {
      setRunning(false);
    }
  }, [key, accessToken]);
  useEffect(() => {
    void run();
  }, [run]);
  useEffect(() => {
    if (current.data && isAttemptStarted(current.data)) router.push('/exam');
  }, [current.data, router]);
  return (
    <ReadinessCheckScreen
      live={{
        companyName: current.data?.organizationName ?? '',
        testTitle: preview?.exam.title ?? 'Your test',
        checks: checks ?? [],
        running: running || !checks,
        onRunAgain: () => void run(),
        onBack: () => router.push('/welcome'),
      }}
    />
  );
}
