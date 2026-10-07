import { useState } from 'react';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { EmptyState, Pagination } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextArea } from '../../components/inputs';
import { ConfirmDialog } from '../../components/overlay';
import { DataTable, type TableColumn } from '../../components/table';
import { RESULTS, deviceLabel, methodLabel, when, ipLabel } from './kit';
import type { LoginEventRow, Page } from './types';

export interface LoginEventsTableProps {
  page: Page<LoginEventRow> | null;
  state: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  onPageChange: (page: number) => void;
  /** Admin view: who tried to sign in. */
  showPerson?: boolean;
  /** Filters are on: an empty list says "No results for these filters". */
  filtered?: boolean;
  onClearFilters?: () => void;
  label: string;
  /** Admin view: clears the person's account lock (the host confirms it's the admin first). */
  onUnlock?: (row: LoginEventRow, reason: string) => Promise<void>;
}

/** The API's minimum: the reason goes on the audit log. */
export const UNLOCK_REASON_MIN = 10;

/** A row that shows a known person's account locking: the place to offer Unlock. */
export const showsLock = (r: LoginEventRow) => Boolean(r.userId) && (r.result === 'locked' || Boolean(r.reason?.includes('lockout_started')));

function UnlockDialog({ row, onUnlock }: { row: LoginEventRow; onUnlock: (row: LoginEventRow, reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  return (
    <ConfirmDialog
      trigger={<Button size="sm" aria-label={`Unlock ${row.identifier}`}>Unlock</Button>}
      title={`Unlock ${row.identifier}?`}
      consequence="They can try to sign in again straight away. Their password and second step don't change, and a blocked network stays blocked. They're emailed, and this is recorded in the audit log."
      confirmLabel="Unlock account"
      confirmDisabled={reason.trim().length < UNLOCK_REASON_MIN}
      onConfirm={() => onUnlock(row, reason.trim())}
      onOpenChange={(open) => !open && setReason('')}
    >
      <FormField label="Reason" required helper={`At least ${UNLOCK_REASON_MIN} characters, for example how you checked it's them.`}>
        <TextArea value={reason} onChange={setReason} rows={3} maxLength={500} />
      </FormField>
    </ConfirmDialog>
  );
}

/** Sign-in attempts, newest first (YX-IAM-10). Server-paged; becomes cards on phones. */
export function LoginEventsTable({ page, state, onRetry, onPageChange, showPerson, filtered, onClearFilters, label, onUnlock }: LoginEventsTableProps) {
  const columns: TableColumn<LoginEventRow>[] = [
    { key: 'when', header: 'When', value: (r) => r.createdAt, render: (r) => when(r.createdAt), width: 190, hideable: false },
    ...(showPerson ? [{ key: 'who', header: 'Email or number', value: (r: LoginEventRow) => r.identifier, width: 220 }] : []),
    {
      key: 'result',
      header: 'Result',
      value: (r) => r.result,
      render: (r) => (
        <span className="yx-auth__badges">
          <Badge tone={RESULTS[r.result]?.tone ?? 'neutral'}>{RESULTS[r.result]?.label ?? r.result}</Badge>
          {r.newDevice && <Badge tone="info">New device</Badge>}
        </span>
      ),
      width: 190,
    },
    { key: 'method', header: 'Method', value: (r) => methodLabel(r.method), width: 160 },
    { key: 'device', header: 'Device', value: (r) => deviceLabel(r.userAgent), optional: true, width: 170 },
    { key: 'ip', header: 'IP address', value: (r) => ipLabel(r.ipAddress), optional: true, width: 150 },
  ];
  return (
    <div className="yx-auth__stack">
      <DataTable
        label={label}
        columns={columns}
        rows={page?.data ?? []}
        getRowId={(r) => r.id}
        state={state}
        onRetry={onRetry}
        errorTitle="We couldn't load sign-in activity."
        empty={<EmptyState compact title="No sign-in attempts yet." />}
        filtered={filtered}
        onClearFilters={onClearFilters}
        rowNoun={['sign-in attempt', 'sign-in attempts']}
        rowButtons={onUnlock ? (r) => (showsLock(r) ? <UnlockDialog row={r} onUnlock={onUnlock} /> : null) : undefined}
        cardSummary
      />
      {page && page.total > page.pageSize && <Pagination page={page.page} pageSize={page.pageSize} total={page.total} onPageChange={onPageChange} />}
    </div>
  );
}
