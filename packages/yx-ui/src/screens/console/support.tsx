import { useState } from 'react';
import { Button } from '../../components/button';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { Text } from '../../components/foundations';
import { Segment } from '../../components/segment';
import { DataTable, type TableColumn } from '../../components/table';
import { useRun } from '../org/org-kit';
import { ConsolePage, SupportBadge, when } from './console-kit';
import type { LoadState, SupportSession } from './types';

export interface SupportSessionsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  /** Every company's sessions, newest first. */
  sessions: SupportSession[];
  onOpenCompany: (organizationId: string) => void;
  onOpenSession: (session: SupportSession) => Promise<void>;
  onEndSession: (id: string) => Promise<void>;
  onWithdrawRequest: (id: string) => Promise<void>;
  now?: Date;
}

/** Console › Support sessions (P02 Q8): every request and session, who asked, why, and the window the company approved. */
export function SupportSessionsScreen(props: SupportSessionsScreenProps) {
  const [whose, setWhose] = useState<'mine' | 'all'>('mine');
  const { busy, error, run } = useRun();
  const now = props.now ?? new Date();
  const live = (s: SupportSession) => s.status === 'approved' && Boolean(s.endsAt) && new Date(s.endsAt!) > now;
  const rows = props.sessions.filter((s) => whose === 'all' || s.mine);
  const columns: TableColumn<SupportSession>[] = [
    {
      key: 'company',
      header: 'Company',
      value: (s) => s.company ?? '',
      render: (s) => (
        <span className="yx-auth__item-main">
          <Text weight="medium">{s.company}</Text>
          <Text tone="secondary" size="sm">{s.mine ? 'You' : s.requestedBy}</Text>
        </span>
      ),
      width: 220,
      hideable: false,
    },
    { key: 'status', header: 'State', value: (s) => s.status, render: (s) => <SupportBadge status={s.status} />, width: 190 },
    { key: 'reason', header: 'Reason', value: (s) => s.reason, render: (s) => (s.ticket ? `${s.ticket} · ${s.reason}` : s.reason), width: 300, optional: true },
    { key: 'window', header: 'Window', value: (s) => s.endsAt ?? s.createdAt, render: (s) => (s.startsAt ? `Until ${when(s.endsAt)}` : `${s.hours} hours asked ${when(s.createdAt)}`), width: 230, optional: true },
    { key: 'decided', header: 'Company decision', value: (s) => s.decidedBy ?? '', render: (s) => (s.decidedBy ? `${s.decidedBy}${s.decisionNote ? ` · “${s.decisionNote}”` : ''}` : '—'), width: 220, optional: true },
  ];
  return (
    <ConsolePage
      crumb="Support sessions"
      title="Support sessions"
      description="Access to a company's data only with its System Admin's approval, for a fixed window, read-only. Ask from the company's page."
      state={props.state}
      onRetry={props.onRetry}
      what="the support sessions"
    >
      {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
      <DataTable
        label="Support sessions"
        columns={columns}
        rows={rows}
        getRowId={(s) => s.id}
        rowNoun={['session', 'sessions']}
        cardSummary
        toolbar={<Segment label="Whose sessions" options={[{ value: 'mine', label: 'Mine' }, { value: 'all', label: 'Everyone' }]} value={whose} onChange={setWhose} />}
        onRowClick={(s) => props.onOpenCompany(s.organizationId)}
        rowButtons={(s) =>
          s.mine && live(s) ? (
            <>
              <Button size="sm" variant="primary" loading={busy === `open-${s.id}`} onClick={() => void run(`open-${s.id}`, () => props.onOpenSession(s))}>
                Open company
              </Button>
              <Button size="sm" loading={busy === `end-${s.id}`} onClick={() => void run(`end-${s.id}`, () => props.onEndSession(s.id))}>
                End
              </Button>
            </>
          ) : s.mine && s.status === 'requested' ? (
            <Button size="sm" loading={busy === `wd-${s.id}`} onClick={() => void run(`wd-${s.id}`, () => props.onWithdrawRequest(s.id))}>
              Withdraw
            </Button>
          ) : null
        }
        empty={<EmptyState compact title={whose === 'mine' ? 'You have no support sessions.' : 'No support sessions yet.'} description="Open a company and choose Ask for support access." />}
      />
    </ConsolePage>
  );
}
