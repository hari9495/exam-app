'use client';

// v2 LiveMonitoringPanel — re-skin of components/LiveMonitoringPanel.tsx on v2 primitives. All
// roster/alert/countdown/bypass logic and the pure display helpers are verbatim (format only).
// Reuses the moderation + proctoring-events hooks as-is.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ShieldAlert, ShieldCheck, AlertTriangle, AlertCircle, Info, Search, Users, Activity, CheckCircle2, BellRing, RefreshCw } from 'lucide-react';
import { useUnblockAttempt, useBypassProctoring, useRevokeProctoringBypass } from '../../../../lib/hooks/useAttemptModeration';
import { useProctoringEvents } from '../../../../lib/hooks/useProctoringEvents';
import { useToast } from '../../../../components/ui';
import { RosterRow, ProctoringFlag, ConnectionStatus } from '../../../../lib/types';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, DT_FEATURES, dt, SortHead, Pill, Dialog, Dropdown, DropdownItem } from '../../../../components/ui-v2';
import { STATUS, VIZ } from '../../../../components/ui-v2/viz';
import { ListFilter, Check } from 'lucide-react';

const TONE_COLOR = { default: 'var(--muted)', success: STATUS.ok, warning: STATUS.warn, danger: STATUS.bad } as const;
const STATUS_VARIANT: Record<string, keyof typeof TONE_COLOR> = { invited: 'default', in_progress: 'warning', submitted: 'success', auto_submitted: 'success', force_submitted: 'danger', blocked: 'danger' };
const STATUS_PRIORITY: Record<string, number> = { blocked: 0, paused: 1, in_progress: 2, pending_manual_grade: 3, invited: 4, force_submitted: 5, revoked: 6, auto_submitted: 7, submitted: 8 };
const DEFAULT_STATUS_PRIORITY = 4;
const STATUS_LABEL: Record<string, string> = { blocked: 'Blocked', paused: 'Paused', in_progress: 'In Progress', pending_manual_grade: 'Pending Grade', invited: 'Invited', force_submitted: 'Force-submitted', revoked: 'Revoked', auto_submitted: 'Auto-submitted', submitted: 'Submitted' };
const STATUS_FILTER_OPTIONS = [{ value: 'all', label: 'All statuses' }, ...Object.keys(STATUS_PRIORITY).map((status) => ({ value: status, label: STATUS_LABEL[status] }))];
const RECENT_ALERT_WINDOW_MS = 5 * 60 * 1000;
const SEVERITY_RANK: Record<string, number> = { low: 1, medium: 2, high: 3 };
const INTEGRITY_LEVEL_LABEL: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' };
const INTEGRITY_LEVEL_COLOR: Record<string, string> = { low: 'var(--muted)', medium: STATUS.warn, high: STATUS.bad };
const SIDEBAR_ALERT_LIMIT = 50;
const BYPASSABLE_STATUSES = ['in_progress', 'paused', 'blocked'];
const SEVERITY_COLOR: Record<string, string> = { high: STATUS.bad, medium: STATUS.warn, low: 'var(--muted)' };
const SEVERITY_ICON: Record<string, typeof AlertTriangle> = { high: AlertTriangle, medium: AlertCircle, low: Info };

function isLiveRow(row: RosterRow): boolean {
  return row.online || row.status === 'in_progress' || row.status === 'paused' || row.status === 'blocked';
}
// Server sends remainingSeconds every 15s; advance it locally in between. Only in_progress advances.
export function displayedRemainingSeconds(row: RosterRow, rosterUpdatedAt: number | null, now: number): number | null {
  if (row.remainingSeconds === null) return null;
  if (row.status !== 'in_progress' || rosterUpdatedAt === null) return row.remainingSeconds;
  const elapsed = Math.floor((now - rosterUpdatedAt) / 1000);
  return Math.max(0, row.remainingSeconds - Math.max(0, elapsed));
}
function formatRemaining(seconds: number | null): string {
  if (seconds === null) return '—';
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function formatRelativeTime(occurredAt: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(occurredAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}
function formatEventType(eventType: string): string {
  const spaced = eventType.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
function parseEventMetadata(metadataJson: string | null): Record<string, unknown> | null {
  if (!metadataJson) return null;
  try { const parsed = JSON.parse(metadataJson); return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null; } catch { return null; }
}
function formatEventDetails(metadata: Record<string, unknown>, event: { eventType: string; severity: string }): string[] {
  const details: string[] = [];
  if (typeof metadata.durationMs === 'number') { const seconds = metadata.durationMs / 1000; details.push(`Away for ${metadata.durationMs < 1000 ? seconds.toFixed(1) : Math.round(seconds)}s`); }
  if (typeof metadata.action === 'string') details.push(metadata.action === 'paste' ? 'Paste' : 'Copy');
  if (typeof metadata.trigger === 'string') details.push(metadata.trigger === 'shortcut' ? 'Triggered by keyboard shortcut' : metadata.trigger);
  if (typeof metadata.strike === 'number') details.push(`Strike ${metadata.strike}`);
  if (metadata.screenshotCapReached === true) details.push('Screen-capture limit reached — no image for this event');
  if (metadata.reason === 'absent' && event.eventType === 'screen_share_stopped' && event.severity === 'low') details.push('Share ended by a page refresh or tab close — no strike');
  return details;
}

const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, padding: 16 };

function Stat({ icon: Icon, label, value, danger }: { icon: typeof Users; label: string; value: number; danger?: boolean }) {
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}><Icon size={14} /><span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span></div>
      <p style={{ fontSize: 24, fontWeight: 600, margin: 0, color: danger && value > 0 ? 'var(--danger)' : 'var(--ink)' }}>{value}</p>
    </div>
  );
}

function ImageDialog({ src, title, onClose }: { src: string | null; title: string; onClose: () => void }) {
  return <Dialog open={src !== null} onClose={onClose} title={title}>{src && <img src={src} alt={title} style={{ width: '100%', borderRadius: 8 }} />}</Dialog>;
}

function ProctoringLogDialog({ attemptId, onClose }: { attemptId: string; onClose: () => void }) {
  const { data: events, isLoading } = useProctoringEvents(attemptId);
  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  return (
    <Dialog open onClose={onClose} title="Proctoring log">
      {isLoading ? (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</p>
      ) : !events || events.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>No proctoring events recorded for this attempt.</p>
      ) : (
        <ul style={{ display: 'flex', maxHeight: 384, flexDirection: 'column', gap: 8, overflowY: 'auto', listStyle: 'none', margin: 0, padding: 0 }}>
          {events.map((event) => {
            const metadata = parseEventMetadata(event.metadataJson);
            const details = metadata ? formatEventDetails(metadata, event) : [];
            const snapshot = metadata && typeof metadata.snapshot === 'string' && metadata.snapshot !== '' ? metadata.snapshot : null;
            const screenshot = metadata && typeof metadata.screenshot === 'string' && metadata.screenshot !== '' ? metadata.screenshot : null;
            return (
              <li key={event.id} style={{ borderRadius: 8, border: '1px solid var(--hair)', padding: 8, fontSize: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 500 }}>{event.eventType}</span>
                  <Pill c={SEVERITY_COLOR[event.severity] ?? 'var(--muted)'} label={event.severity} />
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '2px 0 0' }}>{new Date(event.occurredAt).toLocaleString()}</p>
                {details.length > 0 && <p style={{ fontSize: 12, color: 'var(--ink)', margin: '2px 0 0' }}>{details.join(' — ')}</p>}
                {snapshot && <button type="button" onClick={() => setSelectedSnapshot(snapshot)} aria-label="Enlarge webcam snapshot" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}><img src={snapshot} alt="" style={{ marginTop: 4, height: 64, width: 64, borderRadius: 6, objectFit: 'cover' }} /></button>}
                {screenshot && <button type="button" onClick={() => setSelectedScreenshot(screenshot)} aria-label="Enlarge screen capture" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}><img src={screenshot} alt="" style={{ marginTop: 4, height: 64, width: 64, borderRadius: 6, objectFit: 'cover' }} /></button>}
              </li>
            );
          })}
        </ul>
      )}
      <ImageDialog src={selectedSnapshot} title="Webcam snapshot" onClose={() => setSelectedSnapshot(null)} />
      <ImageDialog src={selectedScreenshot} title="Screen capture" onClose={() => setSelectedScreenshot(null)} />
    </Dialog>
  );
}

export function LiveMonitoringPanel({
  roster, rosterUpdatedAt, alerts, flagged, connectionStatus, joinError, notificationPermission, onEnableNotifications, onRefresh,
}: {
  roster: RosterRow[]; rosterUpdatedAt?: number | null; alerts: ProctoringFlag[]; flagged: Set<string>;
  connectionStatus: ConnectionStatus; joinError: string | null;
  notificationPermission?: NotificationPermission | 'unsupported'; onEnableNotifications?: () => void; onRefresh?: () => void;
}) {
  const { toast } = useToast();
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNowMs(Date.now()), 1000); return () => clearInterval(id); }, []);
  const unblockAttempt = useUnblockAttempt();
  const bypassProctoring = useBypassProctoring();
  const revokeProctoringBypass = useRevokeProctoringBypass();
  const [logAttemptId, setLogAttemptId] = useState<string | null>(null);
  const [bypassAttemptId, setBypassAttemptId] = useState<string | null>(null);
  const [bypassReason, setBypassReason] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [subTab, setSubTab] = useState<'live' | 'offline'>('live');
  const previousStatusRef = useRef<ConnectionStatus>(connectionStatus);

  const liveCount = useMemo(() => roster.filter(isLiveRow).length, [roster]);
  const offlineCount = roster.length - liveCount;

  const visibleRoster = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = roster.filter((row) => isLiveRow(row) === (subTab === 'live') && (statusFilter === 'all' || row.status === statusFilter) && (!query || row.candidateName.toLowerCase().includes(query)));
    return [...filtered].sort((a, b) => (STATUS_PRIORITY[a.status] ?? DEFAULT_STATUS_PRIORITY) - (STATUS_PRIORITY[b.status] ?? DEFAULT_STATUS_PRIORITY));
  }, [roster, statusFilter, search, subTab]);

  function handleConfirmBypass() {
    if (!bypassAttemptId || !bypassReason.trim()) return;
    bypassProctoring.mutate({ attemptId: bypassAttemptId, reason: bypassReason.trim() }, {
      onSuccess: () => { toast('Proctoring relaxed for this candidate.', 'success'); setBypassAttemptId(null); setBypassReason(''); },
      onError: () => toast("Couldn't relax proctoring — please try again.", 'error'),
    });
  }
  useEffect(() => {
    if (previousStatusRef.current === 'connected' && connectionStatus === 'disconnected') toast('Live connection lost. Reconnecting…', 'error');
    previousStatusRef.current = connectionStatus;
  }, [connectionStatus, toast]);

  const onlineCount = roster.filter((row) => row.online).length;
  const inProgressCount = roster.filter((row) => row.status === 'in_progress').length;
  const submittedCount = roster.filter((row) => row.status === 'submitted' || row.status === 'auto_submitted' || row.status === 'force_submitted').length;
  const recentAlertsCount = alerts.filter((alert) => Date.now() - new Date(alert.occurredAt).getTime() <= RECENT_ALERT_WINDOW_MS).length;

  const mediumOrHighCountByAttempt = useMemo(() => {
    const counts = new Map<string, number>();
    for (const alert of alerts) { if (alert.severity !== 'medium' && alert.severity !== 'high') continue; counts.set(alert.attemptId, (counts.get(alert.attemptId) ?? 0) + 1); }
    return counts;
  }, [alerts]);
  const worstSeverityByAttempt = useMemo(() => {
    const worst = new Map<string, string>();
    for (const alert of alerts) { const alertRank = SEVERITY_RANK[alert.severity] ?? 0; if (alertRank === 0) continue; const currentRank = SEVERITY_RANK[worst.get(alert.attemptId) ?? ''] ?? 0; if (alertRank > currentRank) worst.set(alert.attemptId, alert.severity); }
    return worst;
  }, [alerts]);

  const columns: ColumnDef<typeof DT_FEATURES, RosterRow>[] = [
    { id: 'index', enableSorting: false, enableHiding: false, header: () => <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>#</span>, cell: ({ row }) => <span style={dt.muted}>{row.index + 1}</span> },
    { id: 'name', accessorFn: (r) => r.candidateName, header: ({ column }) => <SortHead label="Candidate" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={{ fontWeight: 500 }}>{row.original.candidateName}</span> },
    {
      id: 'status', enableSorting: false,
      header: () => (
        <Dropdown align="start" menuWidth={180} trigger={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: statusFilter !== 'all' ? 'var(--org-primary)' : 'var(--muted)' }}>Status <ListFilter size={12} style={{ opacity: 0.75 }} /></span>}>
          {(close) => STATUS_FILTER_OPTIONS.map((o) => <DropdownItem key={o.value} onClick={() => { close(); setStatusFilter(o.value); }}><span style={{ width: 15, display: 'inline-flex', flexShrink: 0, color: 'var(--org-primary)' }}>{statusFilter === o.value && <Check size={15} />}</span>{o.label}</DropdownItem>)}
        </Dropdown>
      ),
      cell: ({ row }) => (
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Pill c={TONE_COLOR[STATUS_VARIANT[row.original.status] ?? 'default']} label={STATUS_LABEL[row.original.status] ?? row.original.status} />
          {row.original.proctoringBypassed && <Pill c={STATUS.warn} label="Proctoring relaxed" />}
          {row.original.attemptId && flagged.has(row.original.attemptId) && <Pill c={STATUS.bad} label="Needs attention" />}
        </span>
      ),
    },
    { id: 'online', enableSorting: false, header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Online</span>, cell: ({ row }) => <Pill c={row.original.online ? STATUS.ok : 'var(--muted)'} label={row.original.online ? 'Online' : 'Offline'} /> },
    { id: 'remaining', enableSorting: false, header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Time left</span>, cell: ({ row }) => <span className="v2-mono" style={dt.muted}>{formatRemaining(displayedRemainingSeconds(row.original, rosterUpdatedAt ?? null, nowMs))}</span> },
    { id: 'progress', enableSorting: false, header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Progress</span>, cell: ({ row }) => <span className="v2-mono" style={dt.muted}>{row.original.answeredCount !== null && row.original.totalQuestions !== null ? `${row.original.answeredCount} / ${row.original.totalQuestions}` : '—'}</span> },
    { id: 'integrityLevel', enableSorting: false, header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Integrity</span>, cell: ({ row }) => { const level = row.original.attemptId ? worstSeverityByAttempt.get(row.original.attemptId) : undefined; return level ? <Pill c={INTEGRITY_LEVEL_COLOR[level] ?? 'var(--muted)'} label={INTEGRITY_LEVEL_LABEL[level] ?? level} /> : <span style={dt.muted}>—</span>; } },
    { id: 'integrityAlerts', enableSorting: false, header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Alerts</span>, cell: ({ row }) => { const count = (row.original.attemptId && mediumOrHighCountByAttempt.get(row.original.attemptId)) || 0; return count > 0 ? <Pill c={STATUS.bad} label={String(count)} /> : <span style={dt.muted}>0</span>; } },
    {
      id: 'actions', enableSorting: false, enableHiding: false, header: () => null,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {r.status === 'blocked' && r.attemptId && <button type="button" style={dt.primaryBtn} disabled={unblockAttempt.isPending} onClick={() => unblockAttempt.mutate(r.attemptId as string, { onSuccess: () => toast('Candidate unblocked.', 'success'), onError: () => toast("Couldn't unblock the candidate — please try again.", 'error') })}>Unblock</button>}
            {r.attemptId && <button type="button" style={dt.toolBtn} onClick={() => setLogAttemptId(r.attemptId)}>View log</button>}
            {r.attemptId && BYPASSABLE_STATUSES.includes(r.status) && r.proctoringBypassed && <button type="button" style={dt.toolBtn} disabled={revokeProctoringBypass.isPending} onClick={() => revokeProctoringBypass.mutate(r.attemptId as string, { onSuccess: () => toast('Proctoring restored.', 'success'), onError: () => toast("Couldn't restore proctoring — please try again.", 'error') })}>Restore proctoring</button>}
            {r.attemptId && BYPASSABLE_STATUSES.includes(r.status) && !r.proctoringBypassed && <button type="button" style={dt.toolBtn} onClick={() => setBypassAttemptId(r.attemptId)}>Relax proctoring</button>}
          </div>
        );
      },
    },
  ];

  const connColor = connectionStatus === 'connected' ? STATUS.ok : connectionStatus === 'connecting' ? 'var(--muted)' : STATUS.bad;
  const connLabel = connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting…' : 'Disconnected';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div style={{ display: 'grid', flex: 1, gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <Stat icon={Users} label="Online now" value={onlineCount} />
          <Stat icon={Activity} label="In progress" value={inProgressCount} />
          <Stat icon={CheckCircle2} label="Submitted" value={submittedCount} />
          <Stat icon={BellRing} label="Alerts (last 5 min)" value={recentAlertsCount} danger />
        </div>
        <div style={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: 8 }}>
          {notificationPermission === 'default' && <button type="button" style={dt.toolBtn} onClick={onEnableNotifications}>Enable alerts</button>}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 99, padding: '4px 10px', fontSize: 12, fontWeight: 500, color: connColor, background: `color-mix(in srgb, ${connColor} 12%, transparent)` }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: connColor }} />{connLabel}
          </span>
        </div>
      </div>

      {joinError ? (
        <p role="alert" style={{ fontSize: 13, color: 'var(--danger)' }}>{joinError}</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'start' }}>
          <div>
            <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--hair)', marginBottom: 12 }}>
              {(['live', 'offline'] as const).map((t) => (
                <button key={t} type="button" onClick={() => setSubTab(t)} style={{ padding: '8px 14px', fontSize: 13, fontWeight: subTab === t ? 600 : 500, color: subTab === t ? 'var(--ink)' : 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', borderBottom: `2px solid ${subTab === t ? 'var(--org-primary)' : 'transparent'}`, marginBottom: -1 }}>
                  {t === 'live' ? `Live (${liveCount})` : `Offline (${offlineCount})`}
                </button>
              ))}
            </div>
            <DataTable
              columns={columns} data={visibleRoster} getRowId={(r) => r.invitationId}
              search={search} onSearchChange={setSearch} searchPlaceholder="Search candidates…"
              toolbarExtra={onRefresh ? <button type="button" style={{ ...dt.toolBtn, opacity: connectionStatus !== 'connected' ? 0.5 : 1, cursor: connectionStatus !== 'connected' ? 'not-allowed' : 'pointer' }} disabled={connectionStatus !== 'connected'} onClick={onRefresh}><RefreshCw size={14} /> Refresh</button> : undefined}
              emptyMessage={roster.length === 0 ? 'No candidates invited yet.' : statusFilter === 'all' && !search.trim() ? (subTab === 'live' ? 'No candidates online or in progress right now.' : 'No offline candidates yet.') : 'No candidates match your search or filter.'}
              columnLabels={{ name: 'Candidate', status: 'Status', online: 'Online', remaining: 'Time left', progress: 'Progress', integrityLevel: 'Integrity', integrityAlerts: 'Alerts' }}
            />
          </div>
          <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><ShieldAlert size={16} style={{ color: 'var(--muted)' }} /><h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Proctoring alerts</h3></div>
              {alerts.length > 0 && <span style={{ borderRadius: 99, background: 'var(--surface)', border: '1px solid var(--hair)', padding: '1px 8px', fontSize: 11.5, fontWeight: 500, color: 'var(--muted)' }}>{alerts.length}</span>}
            </div>
            {alerts.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '32px 0', textAlign: 'center' }}><ShieldCheck size={28} style={{ color: STATUS.ok }} /><p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>No proctoring alerts yet.</p></div>
            ) : (
              <ul style={{ display: 'flex', maxHeight: 512, flexDirection: 'column', gap: 8, overflowY: 'auto', listStyle: 'none', margin: 0, padding: 0 }}>
                {alerts.slice(0, SIDEBAR_ALERT_LIMIT).map((alert, index) => {
                  const candidate = roster.find((row) => row.attemptId === alert.attemptId);
                  const SeverityIcon = SEVERITY_ICON[alert.severity] ?? Info;
                  const c = SEVERITY_COLOR[alert.severity] ?? 'var(--muted)';
                  return (
                    <li key={`${alert.attemptId}-${alert.occurredAt}-${index}`} style={{ display: 'flex', flexDirection: 'column', gap: 4, borderRadius: 8, border: '1px solid var(--hair)', borderLeft: `3px solid ${c}`, background: 'var(--surface)', padding: 10, fontSize: 13 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: 6, fontWeight: 500, color: 'var(--ink)' }}><SeverityIcon size={13} style={{ flexShrink: 0, color: c }} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{candidate?.candidateName ?? 'Unknown candidate'}</span></span>
                        <Pill c={c} label={alert.severity} />
                      </div>
                      <p style={{ color: 'var(--muted)', margin: 0 }}>{formatEventType(alert.eventType)}</p>
                      <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: 0 }}>{formatRelativeTime(alert.occurredAt)}</p>
                    </li>
                  );
                })}
              </ul>
            )}
            {alerts.length > SIDEBAR_ALERT_LIMIT && <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--muted)', margin: 0 }}>Showing the latest {SIDEBAR_ALERT_LIMIT} of {alerts.length} alerts.</p>}
          </div>
        </div>
      )}

      {logAttemptId && <ProctoringLogDialog attemptId={logAttemptId} onClose={() => setLogAttemptId(null)} />}

      <Dialog open={bypassAttemptId !== null} onClose={() => { setBypassAttemptId(null); setBypassReason(''); }} title="Relax proctoring for this candidate">
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 12px', lineHeight: 1.5 }}>Violations will still be recorded, but this candidate will no longer be paused or blocked. Only this candidate is affected.</p>
        <label htmlFor="bypass-reason" className="v2-label">Why are you relaxing proctoring?<span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span></label>
        <textarea id="bypass-reason" value={bypassReason} onChange={(e) => setBypassReason(e.target.value)} rows={3} maxLength={500} style={{ width: '100%', boxSizing: 'border-box', marginBottom: 16, padding: '9px 11px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" style={dt.toolBtn} onClick={() => { setBypassAttemptId(null); setBypassReason(''); }}>Cancel</button>
          <button type="button" style={{ ...dt.primaryBtn, opacity: !bypassReason.trim() || bypassProctoring.isPending ? 0.5 : 1, cursor: !bypassReason.trim() || bypassProctoring.isPending ? 'not-allowed' : 'pointer' }} onClick={handleConfirmBypass} disabled={!bypassReason.trim() || bypassProctoring.isPending}>Confirm</button>
        </div>
      </Dialog>
    </div>
  );
}
