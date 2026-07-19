'use client';

import { useEffect, useRef } from 'react';
import { useExamMonitoring } from '../lib/hooks/useExamMonitoring';
import { useUnblockAttempt } from '../lib/hooks/useAttemptModeration';
import { Table, Badge, Card, useToast, type Column } from './ui';
import { RosterRow, ConnectionStatus } from '../lib/types';

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  invited: 'default',
  in_progress: 'warning',
  submitted: 'success',
  auto_submitted: 'success',
  force_submitted: 'danger',
  blocked: 'danger',
};

const RECENT_ALERT_WINDOW_MS = 5 * 60 * 1000;

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

export function LiveMonitoringPanel({ examId }: { examId: string }) {
  const { roster, alerts, connectionStatus, joinError } = useExamMonitoring(examId);
  const { toast } = useToast();
  const unblockAttempt = useUnblockAttempt();
  const previousStatusRef = useRef<ConnectionStatus>(connectionStatus);

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
    { key: 'status', header: 'Status', render: (row) => <Badge variant={STATUS_VARIANT[row.status] ?? 'default'}>{row.status}</Badge> },
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
      render: (row) =>
        row.status === 'blocked' && row.attemptId ? (
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
        ) : null,
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
    </div>
  );
}
