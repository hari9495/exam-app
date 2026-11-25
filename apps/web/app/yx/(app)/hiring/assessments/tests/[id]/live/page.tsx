'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { LiveConsoleScreen, scoreFromFlags, type LiveThreadMessage, type LiveTileData } from '@yukthix/ui/assessments';
import { apiFetch } from '../../../../../../../../lib/api-client';
import { useAuth } from '../../../../../../../../lib/auth-context';
import { useApi, useApiWrite } from '../../../../../../../../lib/yx-hiring';
import { useExamMonitoring } from '../../../../../../../../lib/hooks/useExamMonitoring';

// Assessments AS-5 part 2 › Tests › a test › Live console (PRC-13, answer 2006): the test's attempts live from the
// monitoring socket, by concern; a proctor pauses, resumes or ends an attempt with a reason the record keeps (ending asks
// for the second factor: apiFetch asks and retries), and messages the candidate.
const STATUS: Record<string, LiveTileData['status']> = {
  in_progress: 'in-progress',
  paused: 'paused',
  blocked: 'paused',
  submitted: 'submitted',
  auto_submitted: 'submitted',
  pending_manual_grade: 'submitted',
  force_submitted: 'terminated',
};

export default function YxLiveConsolePage() {
  const { id } = useParams<{ id: string }>();
  const test = useApi<{ title: string }>(`/exams/${id}`);
  const m = useExamMonitoring(id);
  const write = useApiWrite();
  const { accessToken } = useAuth();
  // Answer 2277: one "opened the live console" record per visit (not per refresh of the data).
  const recorded = useRef<string | null>(null);
  useEffect(() => {
    if (!accessToken || recorded.current === id) return;
    recorded.current = id;
    void apiFetch(`/asmt/live/${encodeURIComponent(id)}/opened`, { method: 'POST' }, accessToken).catch(() => undefined);
  }, [id, accessToken]);
  // Answer 2268: each running attempt's latest camera frame, refreshed every minute.
  const frames = useApi<{ attemptId: string; url: string }[]>(`/asmt/live/${id}/frames`);
  const refetchFrames = frames.refetch;
  useEffect(() => {
    const t = setInterval(() => void refetchFrames(), 60_000);
    return () => clearInterval(t);
  }, [refetchFrames]);
  const thumbs = useMemo(() => new Map((frames.data ?? []).map((f) => [f.attemptId, f.url])), [frames.data]);
  const events = useMemo(() => {
    const by: Record<string, { id: string; type: string; severity: string; at: string }[]> = {};
    m.alerts.forEach((a, i) => (by[a.attemptId] ??= []).push({ id: `${a.attemptId}-${i}`, type: a.eventType, severity: a.severity, at: a.occurredAt }));
    return by;
  }, [m.alerts]);
  const tiles: LiveTileData[] = m.roster
    .filter((r) => r.attemptId)
    .map((r) => {
      const flags = events[r.attemptId!] ?? [];
      const status = STATUS[r.status] ?? 'waiting';
      return {
        id: r.attemptId!,
        name: r.candidateName,
        status: status === 'in-progress' && !r.online ? 'disconnected' : status,
        score: scoreFromFlags(flags),
        thumbUrl: thumbs.get(r.attemptId!),
        flags: flags.length,
        lastFlag: flags.length ? flags[flags.length - 1]!.type.replace(/_/g, ' ') : undefined,
        question: r.totalQuestions ? `${r.answeredCount ?? 0} of ${r.totalQuestions} answered` : 'Not started',
        secondsLeft: r.remainingSeconds ?? 0,
      };
    });
  const post = async (path: string, body: unknown) => {
    await write('POST', path, body);
    m.refresh();
  };
  return (
    <LiveConsoleScreen
      tiles={[]}
      live={{
        testName: test.data?.title ?? 'Test',
        connection: m.connectionStatus as 'connecting' | 'connected' | 'reconnecting' | 'disconnected',
        state: m.joinError ? 'error' : m.connectionStatus === 'connecting' && !m.roster.length ? 'loading' : 'ready',
        error: m.joinError,
        onRetry: m.refresh,
        tiles,
        events,
        onPause: (attemptId, reason, message) => post(`/attempts/${attemptId}/pause`, { reason, ...(message ? { message } : {}) }),
        onResume: (attemptId, reason) => post(`/attempts/${attemptId}/resume`, { reason }),
        onEnd: (attemptId, reason) => post(`/attempts/${attemptId}/force-submit`, { reason }),
        onMessage: (attemptId, text) => post(`/attempts/${attemptId}/message`, { body: text }),
        // Answer 2269: the thread both ways (the drawer reloads it while open).
        onThread: (attemptId) => apiFetch(`/attempts/${encodeURIComponent(attemptId)}/messages`, {}, accessToken ?? undefined) as Promise<LiveThreadMessage[]>,
      }}
    />
  );
}
