'use client';

import { useEffect, useRef, useState } from 'react';
import { useUnblockAttempt, useBypassProctoring, useRevokeProctoringBypass } from '../lib/hooks/useAttemptModeration';
import { useProctoringEvents } from '../lib/hooks/useProctoringEvents';
import { Table, Badge, Card, Modal, useToast, type Column } from './ui';
import { RosterRow, ProctoringFlag, ConnectionStatus } from '../lib/types';

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  invited: 'default',
  in_progress: 'warning',
  submitted: 'success',
  auto_submitted: 'success',
  force_submitted: 'danger',
  blocked: 'danger',
};

const RECENT_ALERT_WINDOW_MS = 5 * 60 * 1000;

// The server only accepts a proctoring bypass apply/revoke from these three statuses;
// offering the buttons on a settled attempt turns a deliberate 400 into what reads as
// a transient "please try again" glitch.
const BYPASSABLE_STATUSES = ['in_progress', 'paused', 'blocked'];

function formatRemaining(seconds: number | null): string {
  if (seconds === null) {
    return '—';
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatRelativeTime(occurredAt: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(occurredAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// metadataJson is untrusted text from a column: a malformed row must render the
// event plainly rather than crash the recruiter's only view into what happened.
function parseEventMetadata(metadataJson: string | null): Record<string, unknown> | null {
  if (!metadataJson) return null;
  try {
    const parsed = JSON.parse(metadataJson);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function formatEventDetails(metadata: Record<string, unknown>): string[] {
  const details: string[] = [];
  if (typeof metadata.durationMs === 'number') {
    const seconds = metadata.durationMs / 1000;
    details.push(`Away for ${metadata.durationMs < 1000 ? seconds.toFixed(1) : Math.round(seconds)}s`);
  }
  if (typeof metadata.action === 'string') {
    details.push(metadata.action === 'paste' ? 'Paste' : 'Copy');
  }
  if (typeof metadata.trigger === 'string') {
    details.push(metadata.trigger === 'shortcut' ? 'Triggered by keyboard shortcut' : metadata.trigger);
  }
  if (typeof metadata.strike === 'number') {
    details.push(`Strike ${metadata.strike}`);
  }
  return details;
}

function ProctoringLogModal({ attemptId, onClose }: { attemptId: string; onClose: () => void }) {
  const { data: events, isLoading } = useProctoringEvents(attemptId);
  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);

  return (
    <Modal open title="Proctoring log" onClose={onClose}>
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : !events || events.length === 0 ? (
        <p className="text-sm text-gray-500">No proctoring events recorded for this attempt.</p>
      ) : (
        <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
          {events.map((event) => {
            const metadata = parseEventMetadata(event.metadataJson);
            const details = metadata ? formatEventDetails(metadata) : [];
            const snapshot = metadata && typeof metadata.snapshot === 'string' && metadata.snapshot !== '' ? metadata.snapshot : null;
            return (
              <li key={event.id} className="rounded border border-gray-200 p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{event.eventType}</span>
                  <Badge variant={event.severity === 'high' ? 'danger' : event.severity === 'medium' ? 'warning' : 'default'}>
                    {event.severity}
                  </Badge>
                </div>
                <p className="text-xs text-gray-400">{new Date(event.occurredAt).toLocaleString()}</p>
                {details.length > 0 && <p className="text-xs text-gray-600">{details.join(' — ')}</p>}
                {snapshot && (
                  <button type="button" onClick={() => setSelectedSnapshot(snapshot)} aria-label="Enlarge webcam snapshot">
                    <img src={snapshot} alt="" className="mt-1 h-16 w-16 rounded object-cover" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={selectedSnapshot !== null} title="Webcam snapshot" onClose={() => setSelectedSnapshot(null)}>
        {selectedSnapshot && <img src={selectedSnapshot} alt="Webcam snapshot" className="w-full rounded" />}
      </Modal>
    </Modal>
  );
}

export function LiveMonitoringPanel({
  examId,
  roster,
  alerts,
  connectionStatus,
  joinError,
}: {
  examId: string;
  roster: RosterRow[];
  alerts: ProctoringFlag[];
  connectionStatus: ConnectionStatus;
  joinError: string | null;
}) {
  const { toast } = useToast();
  const unblockAttempt = useUnblockAttempt();
  const bypassProctoring = useBypassProctoring();
  const revokeProctoringBypass = useRevokeProctoringBypass();
  const [logAttemptId, setLogAttemptId] = useState<string | null>(null);
  const [bypassAttemptId, setBypassAttemptId] = useState<string | null>(null);
  const [bypassReason, setBypassReason] = useState('');
  const previousStatusRef = useRef<ConnectionStatus>(connectionStatus);

  function handleConfirmBypass() {
    if (!bypassAttemptId || !bypassReason.trim()) return;
    bypassProctoring.mutate(
      { attemptId: bypassAttemptId, reason: bypassReason.trim() },
      {
        onSuccess: () => {
          toast('Proctoring relaxed for this candidate.', 'success');
          setBypassAttemptId(null);
          setBypassReason('');
        },
        onError: () => toast("Couldn't relax proctoring — please try again.", 'error'),
      },
    );
  }

  useEffect(() => {
    if (previousStatusRef.current === 'connected' && connectionStatus === 'disconnected') {
      toast('Live connection lost. Reconnecting…', 'error');
    }
    previousStatusRef.current = connectionStatus;
  }, [connectionStatus, toast]);

  const onlineCount = roster.filter((row) => row.online).length;
  const inProgressCount = roster.filter((row) => row.status === 'in_progress').length;
  const submittedCount = roster.filter((row) => row.status === 'submitted' || row.status === 'auto_submitted' || row.status === 'force_submitted').length;
  const recentAlertsCount = alerts.filter((alert) => Date.now() - new Date(alert.occurredAt).getTime() <= RECENT_ALERT_WINDOW_MS).length;

  const rosterColumns: Column<RosterRow>[] = [
    { key: 'name', header: 'Candidate', render: (row) => row.candidateName, sortValue: (row) => row.candidateName },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <>
          <Badge variant={STATUS_VARIANT[row.status] ?? 'default'}>{row.status}</Badge>
          {row.proctoringBypassed ? <Badge variant="warning">Proctoring relaxed</Badge> : null}
        </>
      ),
    },
    { key: 'online', header: 'Online', render: (row) => <Badge variant={row.online ? 'success' : 'default'}>{row.online ? 'Online' : 'Offline'}</Badge> },
    { key: 'remaining', header: 'Time remaining', render: (row) => formatRemaining(row.remainingSeconds) },
    {
      key: 'progress',
      header: 'Progress',
      render: (row) => (row.answeredCount !== null && row.totalQuestions !== null ? `${row.answeredCount} / ${row.totalQuestions}` : '—'),
    },
    {
      key: 'integrityAlerts',
      header: 'Integrity alerts',
      render: (row) => {
        const count = alerts.filter(
          (alert) => alert.attemptId === row.attemptId && (alert.severity === 'medium' || alert.severity === 'high'),
        ).length;
        return count > 0 ? <Badge variant="danger">{count}</Badge> : <span className="text-gray-400">0</span>;
      },
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.status === 'blocked' && row.attemptId ? (
            <button
              onClick={() => {
                unblockAttempt.mutate(row.attemptId as string, {
                  onSuccess: () => toast('Candidate unblocked.', 'success'),
                  onError: () => toast("Couldn't unblock the candidate — please try again.", 'error'),
                });
              }}
              disabled={unblockAttempt.isPending}
              className="rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              Unblock
            </button>
          ) : null}
          {row.attemptId ? (
            <button
              onClick={() => setLogAttemptId(row.attemptId)}
              className="rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              View log
            </button>
          ) : null}
          {row.attemptId && BYPASSABLE_STATUSES.includes(row.status) && row.proctoringBypassed ? (
            <button
              onClick={() => {
                revokeProctoringBypass.mutate(row.attemptId as string, {
                  onSuccess: () => toast('Proctoring restored.', 'success'),
                  onError: () => toast("Couldn't restore proctoring — please try again.", 'error'),
                });
              }}
              disabled={revokeProctoringBypass.isPending}
              className="rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              Restore proctoring
            </button>
          ) : null}
          {row.attemptId && BYPASSABLE_STATUSES.includes(row.status) && !row.proctoringBypassed ? (
            <button
              onClick={() => setBypassAttemptId(row.attemptId)}
              className="rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              Relax proctoring
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="grid grid-cols-4 gap-4 flex-1">
          <Card>
            <p className="text-xs text-gray-500">Online now</p>
            <p className="text-2xl font-semibold">{onlineCount}</p>
          </Card>
          <Card>
            <p className="text-xs text-gray-500">In progress</p>
            <p className="text-2xl font-semibold">{inProgressCount}</p>
          </Card>
          <Card>
            <p className="text-xs text-gray-500">Submitted</p>
            <p className="text-2xl font-semibold">{submittedCount}</p>
          </Card>
          <Card>
            <p className="text-xs text-gray-500">Alerts (last 5 min)</p>
            <p className="text-2xl font-semibold">{recentAlertsCount}</p>
          </Card>
        </div>
        <Badge variant={connectionStatus === 'connected' ? 'success' : connectionStatus === 'connecting' ? 'default' : 'danger'}>
          {connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting…' : 'Disconnected'}
        </Badge>
      </div>

      {joinError ? (
        <p role="alert" className="text-sm text-red-600">
          {joinError}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <Table columns={rosterColumns} rows={roster} rowKey={(row) => row.candidateId} emptyMessage="No candidates invited yet." />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-gray-700">Proctoring alerts</h3>
            {alerts.length === 0 ? (
              <p className="text-sm text-gray-500">No proctoring alerts yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {alerts.map((alert, index) => {
                  const candidate = roster.find((row) => row.attemptId === alert.attemptId);
                  return (
                    <li key={`${alert.attemptId}-${alert.occurredAt}-${index}`} className="rounded border border-gray-200 p-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{candidate?.candidateName ?? 'Unknown candidate'}</span>
                        <Badge variant={alert.severity === 'high' ? 'danger' : alert.severity === 'medium' ? 'warning' : 'default'}>{alert.severity}</Badge>
                      </div>
                      <p className="text-gray-600">{alert.eventType}</p>
                      <p className="text-xs text-gray-400">{formatRelativeTime(alert.occurredAt)}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {logAttemptId && <ProctoringLogModal attemptId={logAttemptId} onClose={() => setLogAttemptId(null)} />}

      {bypassAttemptId ? (
        <Modal open title="Relax proctoring for this candidate" onClose={() => { setBypassAttemptId(null); setBypassReason(''); }}>
          <p className="mb-3 text-sm text-recruiter-text-secondary">
            Violations will still be recorded, but this candidate will no longer be paused or blocked. Only this candidate is
            affected.
          </p>
          <label htmlFor="bypass-reason" className="mb-1 block text-sm font-medium text-gray-700">
            Why are you relaxing proctoring?
          </label>
          <textarea
            id="bypass-reason"
            value={bypassReason}
            onChange={(event) => setBypassReason(event.target.value)}
            rows={3}
            maxLength={500}
            className="mb-4 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setBypassAttemptId(null); setBypassReason(''); }}
              className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmBypass}
              disabled={!bypassReason.trim() || bypassProctoring.isPending}
              className="rounded-full bg-primary px-3 py-1 text-xs text-white disabled:opacity-50"
            >
              Confirm
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
