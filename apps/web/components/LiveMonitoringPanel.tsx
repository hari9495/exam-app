'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ShieldAlert, ShieldCheck, AlertTriangle, AlertCircle, Info, Search, Users, Activity, CheckCircle2, BellRing } from 'lucide-react';
import { useUnblockAttempt, useBypassProctoring, useRevokeProctoringBypass } from '../lib/hooks/useAttemptModeration';
import { useProctoringEvents } from '../lib/hooks/useProctoringEvents';
import { Table, Badge, Button, Card, Modal, Select, useToast, useColumnVisibility, type Column } from './ui';
import { RosterRow, ProctoringFlag, ConnectionStatus } from '../lib/types';

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  invited: 'default',
  in_progress: 'warning',
  submitted: 'success',
  auto_submitted: 'success',
  force_submitted: 'danger',
  blocked: 'danger',
};

// Highest urgency first: a blocked candidate needs the recruiter's attention right
// now, an active one is worth watching, and a normal successful submission needs
// nothing further -- so it sinks to the bottom, same idea as the STATUS_VARIANT
// tones above (danger -> warning -> neutral -> success), just as a sort order.
const STATUS_PRIORITY: Record<string, number> = {
  blocked: 0,
  paused: 1,
  in_progress: 2,
  pending_manual_grade: 3,
  invited: 4,
  force_submitted: 5,
  revoked: 6,
  auto_submitted: 7,
  submitted: 8,
};
const DEFAULT_STATUS_PRIORITY = 4;

const STATUS_LABEL: Record<string, string> = {
  blocked: 'Blocked',
  paused: 'Paused',
  in_progress: 'In Progress',
  pending_manual_grade: 'Pending Grade',
  invited: 'Invited',
  force_submitted: 'Force-submitted',
  revoked: 'Revoked',
  auto_submitted: 'Auto-submitted',
  submitted: 'Submitted',
};

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  ...Object.keys(STATUS_PRIORITY).map((status) => ({ value: status, label: STATUS_LABEL[status] })),
];

const RECENT_ALERT_WINDOW_MS = 5 * 60 * 1000;

// The alerts feed is no longer capped exam-wide (retention is age + per-attempt based,
// so it can hold thousands). The sidebar only ever needs to show the newest handful --
// counts and the flagged set still read the full array below.
const SIDEBAR_ALERT_LIMIT = 50;

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

// 'tab_switch' -> 'Tab switch'. Purely cosmetic -- the raw eventType string is
// still what every other part of the app (exports, the proctoring log) shows.
function formatEventType(eventType: string): string {
  const spaced = eventType.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const SEVERITY_ICON: Record<string, typeof AlertTriangle> = {
  high: AlertTriangle,
  medium: AlertCircle,
  low: Info,
};

const SEVERITY_BORDER: Record<string, string> = {
  high: 'border-l-status-danger',
  medium: 'border-l-status-warning',
  low: 'border-l-recruiter-border',
};

const SEVERITY_ICON_COLOR: Record<string, string> = {
  high: 'text-status-danger',
  medium: 'text-status-warning',
  low: 'text-recruiter-text-tertiary',
};

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

function formatEventDetails(metadata: Record<string, unknown>, event: { eventType: string; severity: string }): string[] {
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
  if (metadata.screenshotCapReached === true) {
    details.push('Screen-capture limit reached — no image for this event');
  }
  // metadata.reason is client-reportable free-form data (ReportProctoringEventDto.metadata is a
  // bare @IsObject(), and sanitizeMetadataOrDrop only strips screenshot/snapshot-shaped keys --
  // `reason` passes straight through untouched). Gating on it alone would let a candidate POST
  // { eventType: 'tab_switch', metadata: { reason: 'absent' } } and have a genuine,
  // strike-worthy violation rendered with an exculpatory "no strike" label written by the
  // accused. The server's screenShareState 'absent' arm is the only writer of a low-severity
  // screen_share_stopped row -- a client-reported one always gets 'high' from
  // getProctoringEventSeverity, and the client cannot influence severity -- so require both as
  // server-controlled proof this is really that row.
  if (metadata.reason === 'absent' && event.eventType === 'screen_share_stopped' && event.severity === 'low') {
    details.push('Share ended by a page refresh or tab close — no strike');
  }
  return details;
}

function ProctoringLogModal({ attemptId, onClose }: { attemptId: string; onClose: () => void }) {
  const { data: events, isLoading } = useProctoringEvents(attemptId);
  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);

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
            const details = metadata ? formatEventDetails(metadata, event) : [];
            const snapshot = metadata && typeof metadata.snapshot === 'string' && metadata.snapshot !== '' ? metadata.snapshot : null;
            const screenshot = metadata && typeof metadata.screenshot === 'string' && metadata.screenshot !== '' ? metadata.screenshot : null;
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
                  <button type="button" onClick={() => setSelectedSnapshot(snapshot)} aria-label="Enlarge Webcam Snapshot">
                    <img src={snapshot} alt="" className="mt-1 h-16 w-16 rounded object-cover" />
                  </button>
                )}
                {screenshot && (
                  <button type="button" onClick={() => setSelectedScreenshot(screenshot)} aria-label="Enlarge Screen Capture">
                    <img src={screenshot} alt="" className="mt-1 h-16 w-16 rounded object-cover" />
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

      <Modal open={selectedScreenshot !== null} title="Screen capture" onClose={() => setSelectedScreenshot(null)}>
        {selectedScreenshot && <img src={selectedScreenshot} alt="Screen capture" className="w-full rounded" />}
      </Modal>
    </Modal>
  );
}

export function LiveMonitoringPanel({
  roster,
  alerts,
  flagged,
  connectionStatus,
  joinError,
  notificationPermission,
  onEnableNotifications,
}: {
  roster: RosterRow[];
  alerts: ProctoringFlag[];
  flagged: Set<string>;
  connectionStatus: ConnectionStatus;
  joinError: string | null;
  // ponytail: optional only so the existing test file keeps compiling without supplying
  // them; they fail closed (Enable alerts button just doesn't render), so no wrong-render
  // risk today, but a caller can silently omit both and lose the feature with no type
  // error. Make required once this panel's test file is updated to pass them.
  notificationPermission?: NotificationPermission | 'unsupported';
  onEnableNotifications?: () => void;
}) {
  const { toast } = useToast();
  const unblockAttempt = useUnblockAttempt();
  const bypassProctoring = useBypassProctoring();
  const revokeProctoringBypass = useRevokeProctoringBypass();
  const [logAttemptId, setLogAttemptId] = useState<string | null>(null);
  const [bypassAttemptId, setBypassAttemptId] = useState<string | null>(null);
  const [bypassReason, setBypassReason] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const previousStatusRef = useRef<ConnectionStatus>(connectionStatus);

  // Searched, filtered, then sorted by urgency (see STATUS_PRIORITY) so the roster
  // always opens with whoever needs the recruiter's attention first, not insertion order.
  const visibleRoster = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = roster.filter(
      (row) =>
        (statusFilter === 'all' || row.status === statusFilter) &&
        (!query || row.candidateName.toLowerCase().includes(query)),
    );
    return [...filtered].sort(
      (a, b) => (STATUS_PRIORITY[a.status] ?? DEFAULT_STATUS_PRIORITY) - (STATUS_PRIORITY[b.status] ?? DEFAULT_STATUS_PRIORITY),
    );
  }, [roster, statusFilter, search]);

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

  // Single pass over the full alert array per render instead of a filter per roster row
  // (was O(roster x alerts) -- thousands of alerts x hundreds of rows on every socket event).
  const mediumOrHighCountByAttempt = useMemo(() => {
    const counts = new Map<string, number>();
    for (const alert of alerts) {
      if (alert.severity !== 'medium' && alert.severity !== 'high') continue;
      counts.set(alert.attemptId, (counts.get(alert.attemptId) ?? 0) + 1);
    }
    return counts;
  }, [alerts]);

  const rosterColumns: Column<RosterRow>[] = [
    { key: 'name', header: 'Candidate', render: (row) => row.candidateName, sortValue: (row) => row.candidateName },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <>
          <Badge variant={STATUS_VARIANT[row.status] ?? 'default'}>{STATUS_LABEL[row.status] ?? row.status}</Badge>
          {row.proctoringBypassed ? <Badge variant="warning">Proctoring relaxed</Badge> : null}
          {row.attemptId && flagged.has(row.attemptId) ? <Badge variant="danger">Needs attention</Badge> : null}
        </>
      ),
      sortValue: (row) => STATUS_PRIORITY[row.status] ?? DEFAULT_STATUS_PRIORITY,
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
        const count = (row.attemptId && mediumOrHighCountByAttempt.get(row.attemptId)) || 0;
        return count > 0 ? <Badge variant="danger">{count}</Badge> : <span className="text-gray-400">0</span>;
      },
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.status === 'blocked' && row.attemptId ? (
            <Button
              size="sm"
              onClick={() => {
                unblockAttempt.mutate(row.attemptId as string, {
                  onSuccess: () => toast('Candidate unblocked.', 'success'),
                  onError: () => toast("Couldn't unblock the candidate — please try again.", 'error'),
                });
              }}
              disabled={unblockAttempt.isPending}
            >
              Unblock
            </Button>
          ) : null}
          {row.attemptId ? (
            <Button size="sm" variant="secondary" onClick={() => setLogAttemptId(row.attemptId)}>
              View log
            </Button>
          ) : null}
          {row.attemptId && BYPASSABLE_STATUSES.includes(row.status) && row.proctoringBypassed ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                revokeProctoringBypass.mutate(row.attemptId as string, {
                  onSuccess: () => toast('Proctoring restored.', 'success'),
                  onError: () => toast("Couldn't restore proctoring — please try again.", 'error'),
                });
              }}
              disabled={revokeProctoringBypass.isPending}
            >
              Restore proctoring
            </Button>
          ) : null}
          {row.attemptId && BYPASSABLE_STATUSES.includes(row.status) && !row.proctoringBypassed ? (
            <Button size="sm" variant="secondary" onClick={() => setBypassAttemptId(row.attemptId)}>
              Relax proctoring
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const { visibleColumns: visibleRosterColumns, chooser: rosterColumnChooser } = useColumnVisibility(
    'live-monitoring-roster',
    rosterColumns,
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="grid flex-1 grid-cols-4 gap-4">
          <Card className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-recruiter-text-tertiary">
              <Users size={14} />
              <p className="text-xs font-medium uppercase tracking-wide">Online now</p>
            </div>
            <p className="text-2xl font-semibold text-recruiter-text">{onlineCount}</p>
          </Card>
          <Card className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-recruiter-text-tertiary">
              <Activity size={14} />
              <p className="text-xs font-medium uppercase tracking-wide">In progress</p>
            </div>
            <p className="text-2xl font-semibold text-recruiter-text">{inProgressCount}</p>
          </Card>
          <Card className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-recruiter-text-tertiary">
              <CheckCircle2 size={14} />
              <p className="text-xs font-medium uppercase tracking-wide">Submitted</p>
            </div>
            <p className="text-2xl font-semibold text-recruiter-text">{submittedCount}</p>
          </Card>
          <Card className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-recruiter-text-tertiary">
              <BellRing size={14} />
              <p className="text-xs font-medium uppercase tracking-wide">Alerts (last 5 min)</p>
            </div>
            <p className={`text-2xl font-semibold ${recentAlertsCount > 0 ? 'text-status-danger' : 'text-recruiter-text'}`}>
              {recentAlertsCount}
            </p>
          </Card>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {notificationPermission === 'default' ? (
            <Button size="sm" variant="secondary" onClick={onEnableNotifications}>
              Enable alerts
            </Button>
          ) : null}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              connectionStatus === 'connected'
                ? 'bg-status-success-bg text-status-success'
                : connectionStatus === 'connecting'
                  ? 'bg-status-neutral-bg text-status-neutral'
                  : 'bg-status-danger-bg text-status-danger'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                connectionStatus === 'connected'
                  ? 'animate-pulse bg-status-success'
                  : connectionStatus === 'connecting'
                    ? 'bg-status-neutral'
                    : 'bg-status-danger'
              }`}
            />
            {connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting…' : 'Disconnected'}
          </span>
        </div>
      </div>

      {joinError ? (
        <p role="alert" className="text-sm text-red-600">
          {joinError}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <div className="mb-2 flex items-end gap-2">
              <div className="relative max-w-xs flex-1">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-recruiter-text-tertiary" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search candidates…"
                  aria-label="Search candidates"
                  className="w-full rounded-md border border-recruiter-border py-1.5 pl-8 pr-3 text-sm"
                />
              </div>
              <Select label="Status" value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} />
              {rosterColumnChooser}
            </div>
            <Table
              columns={visibleRosterColumns}
              rows={visibleRoster}
              // invitationId, not candidateId -- a candidate can have more than one invitation
              // for the same exam (re-invite), and a duplicate React key across rows makes sort
              // reordering mis-assign/duplicate DOM nodes (ADO #6841).
              rowKey={(row) => row.invitationId}
              emptyMessage={
                statusFilter === 'all' && !search.trim() ? 'No candidates invited yet.' : 'No candidates match your search or filter.'
              }
            />
          </div>
          <Card className="flex h-fit flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ShieldAlert size={16} className="text-recruiter-text-tertiary" />
                <h3 className="text-sm font-semibold text-recruiter-text">Proctoring alerts</h3>
              </div>
              {alerts.length > 0 && (
                <span className="rounded-full bg-recruiter-bg-subtle px-2 py-0.5 text-xs font-medium text-recruiter-text-secondary">
                  {alerts.length}
                </span>
              )}
            </div>
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <ShieldCheck size={28} className="text-status-success" />
                <p className="text-sm text-recruiter-text-secondary">No proctoring alerts yet.</p>
              </div>
            ) : (
              <ul className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto">
                {alerts.slice(0, SIDEBAR_ALERT_LIMIT).map((alert, index) => {
                  const candidate = roster.find((row) => row.attemptId === alert.attemptId);
                  const SeverityIcon = SEVERITY_ICON[alert.severity] ?? Info;
                  return (
                    <li
                      key={`${alert.attemptId}-${alert.occurredAt}-${index}`}
                      className={`flex flex-col gap-1 rounded-md border border-recruiter-border border-l-[3px] bg-white p-2.5 text-sm ${SEVERITY_BORDER[alert.severity] ?? 'border-l-recruiter-border'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 font-medium text-recruiter-text">
                          <SeverityIcon size={13} className={`shrink-0 ${SEVERITY_ICON_COLOR[alert.severity] ?? 'text-recruiter-text-tertiary'}`} />
                          <span className="truncate">{candidate?.candidateName ?? 'Unknown candidate'}</span>
                        </span>
                        <Badge variant={alert.severity === 'high' ? 'danger' : alert.severity === 'medium' ? 'warning' : 'default'}>{alert.severity}</Badge>
                      </div>
                      <p className="text-recruiter-text-secondary">{formatEventType(alert.eventType)}</p>
                      <p className="text-xs text-recruiter-text-tertiary">{formatRelativeTime(alert.occurredAt)}</p>
                    </li>
                  );
                })}
              </ul>
            )}
            {alerts.length > SIDEBAR_ALERT_LIMIT && (
              <p className="text-center text-xs text-recruiter-text-tertiary">Showing the latest {SIDEBAR_ALERT_LIMIT} of {alerts.length} alerts.</p>
            )}
          </Card>
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
            <Button size="sm" variant="secondary" onClick={() => { setBypassAttemptId(null); setBypassReason(''); }}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmBypass}
              disabled={!bypassReason.trim() || bypassProctoring.isPending}
            >
              Confirm
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
