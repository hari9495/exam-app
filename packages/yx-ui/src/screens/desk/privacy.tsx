import { useEffect, useState } from 'react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { NumberField, TextArea } from '../../components/inputs';
import { Switch } from '../../components/choice';
import { Segment } from '../../components/segment';
import { Dialog } from '../../components/overlay';
import { Card } from '../../components/shell';
import { useRun } from '../org/org-kit';
import { DeskPage, when } from './desk-kit';
import type { LoadState } from './types';

// Privacy requests and keeping data (SD-1.30): people ask for a copy of what the Service Desk holds about them or for
// it to be erased; the Service Desk admin completes or refuses each one with a note. Erasing and changing what is kept
// need a fresh second factor (asked for by the app). A legal hold stops all erasing.

export type PrivacyStatus = 'open' | 'done' | 'refused';

export interface PrivacyRequestRow {
  id: string;
  kind: 'access' | 'erasure';
  source: string;
  note: string | null;
  status: PrivacyStatus;
  decisionNote: string | null;
  result: Record<string, unknown> | null;
  createdAt: string;
  doneAt: string | null;
  person: { id: string; name: string; email: string | null };
}

export interface PrivacySettings {
  /** null: keep the words of closed tickets. */
  retentionMonths: number | null;
  legalHold: boolean;
  binDays: number;
  updatedAt?: string | null;
}

export interface PrivacyScreenProps {
  state: LoadState;
  onRetry?: () => void;
  status: PrivacyStatus;
  onStatus: (s: PrivacyStatus) => void;
  requests: PrivacyRequestRow[];
  legalHold: boolean;
  settings: PrivacySettings | null;
  onDecide: (request: PrivacyRequestRow, action: 'complete' | 'refuse', note: string) => Promise<unknown>;
  onSaveSettings: (s: Omit<PrivacySettings, 'updatedAt'>) => Promise<void>;
}

const STATUSES = [
  { value: 'open' as const, label: 'Open' },
  { value: 'done' as const, label: 'Done' },
  { value: 'refused' as const, label: 'Refused' },
];
const KIND_WORD = { access: 'Copy of their data', erasure: 'Erase their data' } as const;

export function PrivacyScreen(props: PrivacyScreenProps) {
  const [deciding, setDeciding] = useState<{ r: PrivacyRequestRow; action: 'complete' | 'refuse' } | null>(null);
  return (
    <DeskPage
      title="Privacy requests"
      description="People can ask for a copy of what the Service Desk holds about them, or for it to be erased. Answer each request with a note."
      state={props.state}
      onRetry={props.onRetry}
      what="the privacy requests"
    >
      <div className="yx-ops-stack">
        {props.legalHold && (
          <InlineAlert tone="warning" title="A legal hold is on">
            Nothing can be erased while the hold is on, and closed tickets are not cleared. Refuse erasure requests with a note, or lift the hold below.
          </InlineAlert>
        )}
        <Card title="Requests" actions={<Segment label="Which requests" options={STATUSES} value={props.status} onChange={props.onStatus} />}>
          {props.requests.length === 0 ? (
            <EmptyState compact title={props.status === 'open' ? 'No open requests.' : 'Nothing here.'} />
          ) : (
            <ul className="yx-ops-list" aria-label="Privacy requests">
              {props.requests.map((r) => (
                <li key={r.id} className="yx-ops-list__item">
                  <span className="yx-ops-list__main">
                    <span className="yx-ops-list__title">
                      {r.person.name || 'Someone'}
                      {r.person.email ? ` <${r.person.email}>` : ''}
                    </span>
                    <span className="yx-ops-list__sub">
                      {KIND_WORD[r.kind]} · asked {when(r.createdAt)}
                      {r.source === 'portal' ? ' · from the help portal' : ''}
                      {r.doneAt ? ` · answered ${when(r.doneAt)}` : ''}
                    </span>
                    {r.note && <span className="yx-ops-list__sub">Their note: {r.note}</span>}
                    {r.decisionNote && <span className="yx-ops-list__sub">Your note: {r.decisionNote}</span>}
                  </span>
                  <span className="yx-ops-row">
                    <Badge tone={r.kind === 'erasure' ? 'warning' : 'info'}>{r.kind === 'erasure' ? 'Erasure' : 'Copy'}</Badge>
                    {r.status === 'open' && (
                      <>
                        <Button size="sm" aria-label={`Complete the request from ${r.person.name}`} onClick={() => setDeciding({ r, action: 'complete' })}>
                          Complete
                        </Button>
                        <Button size="sm" aria-label={`Refuse the request from ${r.person.name}`} onClick={() => setDeciding({ r, action: 'refuse' })}>
                          Refuse
                        </Button>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {props.settings && <SettingsCard key={props.settings.updatedAt ?? 'new'} settings={props.settings} onSave={props.onSaveSettings} />}
      </div>
      {deciding && <DecideDialog request={deciding.r} action={deciding.action} legalHold={props.legalHold} onClose={() => setDeciding(null)} onDecide={props.onDecide} />}
    </DeskPage>
  );
}

function DecideDialog({ request: r, action, legalHold, onClose, onDecide }: { request: PrivacyRequestRow; action: 'complete' | 'refuse'; legalHold: boolean; onClose: () => void; onDecide: PrivacyScreenProps['onDecide'] }) {
  const [note, setNote] = useState('');
  const { busy, error, run } = useRun();
  const erase = action === 'complete' && r.kind === 'erasure';
  const title = action === 'refuse' ? `Refuse the request from ${r.person.name}?` : erase ? `Erase ${r.person.name}’s data for good?` : `Give ${r.person.name} a copy of their data?`;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      destructive={erase}
      preventClose={busy === 'go'}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={erase ? 'danger' : 'primary'}
            disabled={(action === 'refuse' && !note.trim()) || (erase && legalHold)}
            loading={busy === 'go'}
            onClick={() =>
              void run('go', async () => {
                await onDecide(r, action, note.trim());
                onClose();
              })
            }
          >
            {action === 'refuse' ? 'Refuse request' : erase ? 'Erase for good' : 'Complete request'}
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        {erase && (
          <InlineAlert tone="danger" title="This cannot be undone">
            Everything {r.person.name} wrote on tickets is replaced with “removed”, their files are deleted, and their comments on ratings and surveys are cleared. If they are an outside contact, their name and email go too and they are signed out of
            the help portal. Tickets stay, so your records still add up. An employee’s HR record is not touched.
          </InlineAlert>
        )}
        {erase && legalHold && <InlineAlert tone="warning">A legal hold is on, so nothing can be erased now. Refuse with a note, or lift the hold first.</InlineAlert>}
        {action === 'complete' && r.kind === 'access' && <p>{r.person.name} can then download a copy of their tickets and messages from their own requests page.</p>}
        <FormField label="Note" required={action === 'refuse'} optional={action !== 'refuse'} helper={action === 'refuse' ? 'Say why. The person sees this note.' : 'The person sees this note.'}>
          <TextArea value={note} onChange={setNote} maxLength={500} rows={3} />
        </FormField>
      </div>
    </Dialog>
  );
}

function SettingsCard({ settings, onSave }: { settings: PrivacySettings; onSave: PrivacyScreenProps['onSaveSettings'] }) {
  const [months, setMonths] = useState<number | null>(settings.retentionMonths);
  const [hold, setHold] = useState(settings.legalHold);
  const [binDays, setBinDays] = useState<number | null>(settings.binDays);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useRun();
  useEffect(() => setSaved(false), [months, hold, binDays]);
  const monthsOk = months === null || (months >= 6 && months <= 240);
  const binOk = binDays !== null && binDays >= 1 && binDays <= 90;
  return (
    <Card title="What we keep">
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="Not saved">{error}</InlineAlert>}
        {saved && <InlineAlert tone="success">Saved.</InlineAlert>}
        <FormField label="Clear the words of closed tickets after" optional helper="In months, 6 to 240. Leave empty to keep them. The ticket stays; what people wrote and their files are removed." error={monthsOk ? null : 'Use 6 to 240 months, or leave empty'}>
          <NumberField value={months} onChange={setMonths} min={6} max={240} suffix="months" />
        </FormField>
        <Switch checked={hold} onChange={setHold} label="Legal hold" description="While on, nothing is erased or cleared, for example during a legal case." />
        <FormField label="Keep deleted items in the recycle bin for" required helper="1 to 90 days, then they are gone for good." error={binOk ? null : 'Use 1 to 90 days'}>
          <NumberField value={binDays} onChange={setBinDays} min={1} max={90} suffix="days" />
        </FormField>
        <span>
          <Button variant="primary" disabled={!monthsOk || !binOk} loading={busy === 'save'} onClick={() => void run('save', async () => { await onSave({ retentionMonths: months, legalHold: hold, binDays: binDays! }); setSaved(true); })}>
            Save
          </Button>
        </span>
      </div>
    </Card>
  );
}
