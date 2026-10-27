import { useState } from 'react';
import { Download, Mail } from 'lucide-react';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { TextArea } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { DataTable, type TableColumn } from '../../../components/table';
import { LivePage, dateText } from '../../time/live/kit';
import { EmailDialog, STAGE } from './candidates';
import type { CandidateProfileView, Choice, EmailCompose, EmailTemplateChoice, LoadState, MergeChoices, MergeField } from './types';

// Recruitment batch AT4, wired (M10-BUILD-DESIGN §7.1, §7.2, §13): one candidate — contact, résumé, applications,
// assessments, interviews, messages, consents with their versions, lists, merges, legal hold and when the retention
// sweep would anonymise them. Merge here keeps this candidate and merges another one into it.

const PURPOSE: Record<string, string> = { application: 'Applying for a job', talent_pool: 'Kept for other roles' };
const day = (iso: string) => dateText(iso.slice(0, 10));

export interface CandidateProfileScreenProps {
  state: LoadState;
  onRetry?: () => void;
  profile: CandidateProfileView | null;
  canManage: boolean;
  canDataRights: boolean;
  templates: EmailTemplateChoice[];
  senders: Choice[];
  /** Other candidates to merge into this one (searchable). */
  mergeCandidates: Choice[];
  onMergeSearch?: (q: string) => void;
  /** The other candidate's values, for the field-by-field choice. */
  loadOther: (id: string) => Promise<{ name: string; phone: string | null; hasResume: boolean }>;
  onBack: () => void;
  onOpenJob: (jobId: string) => void;
  onResume: () => Promise<unknown>;
  onEmail: (c: EmailCompose) => Promise<unknown>;
  onMerge: (mergedId: string, choices: MergeChoices) => Promise<unknown>;
  onHold: (on: boolean, reason: string | null) => Promise<unknown>;
  onWithdrawPool: () => Promise<unknown>;
  onErase: () => Promise<unknown>;
}

export function CandidateProfileScreen(p: CandidateProfileScreenProps) {
  const v = p.profile;
  const [emailing, setEmailing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [holding, setHolding] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const poolConsent = v?.consents.find((c) => c.purpose === 'talent_pool');
  const erased = Boolean(v?.candidate.erasedAt);
  return (
    <LivePage
      title={v ? v.candidate.name : 'Candidate'}
      description={v ? [v.candidate.email, v.candidate.phone].filter(Boolean).join(' · ') : undefined}
      state={p.state}
      onRetry={p.onRetry}
      what="this candidate"
      grantedBy="your admin"
      actions={
        <>
          <Button onClick={p.onBack}>All candidates</Button>
          {v && !erased && p.canManage && (
            <>
              <Button icon={Mail} disabled={v.candidate.emailOptedOut} onClick={() => setEmailing(true)}>Email</Button>
              <Button onClick={() => setMerging(true)}>Merge a duplicate into this one</Button>
            </>
          )}
        </>
      }
    >
      {v && (
        <>
          <div className="yx-tim-row">
            <Badge tone={STAGE[v.candidate.globalStage].tone}>{STAGE[v.candidate.globalStage].label}</Badge>
            {v.legalHold && <Badge tone="warning">Legal hold</Badge>}
            {erased && <Badge tone="neutral">Erased</Badge>}
            {v.candidate.emailOptedOut && <Badge tone="neutral">No emails</Badge>}
          </div>
          {v.legalHold && (
            <InlineAlert tone="warning" title="Under legal hold">
              {v.legalHold.reason ?? ''} Nothing about this candidate is erased, merged away or swept while the hold is on.
            </InlineAlert>
          )}

          <Card title="Résumé">
            {v.resume?.hasFile ? (
              <>
                {v.resume.title && <Text as="p" weight="semibold">{v.resume.title}{v.resume.years != null ? ` · ${v.resume.years} years` : ''}</Text>}
                {v.resume.summary && <Text as="p">{v.resume.summary}</Text>}
                {v.resume.skills && <Text as="p" tone="secondary">{v.resume.skills}</Text>}
                {v.resume.scan === 'clean' ? (
                  <div><Button size="sm" icon={Download} onClick={() => void p.onResume()}>Open the résumé</Button></div>
                ) : (
                  <Text as="p" tone="secondary">{v.resume.scan === 'infected' ? 'The file was blocked by the virus check.' : 'The file is waiting for the virus check.'}</Text>
                )}
              </>
            ) : (
              <Text as="p" tone="secondary">No résumé on file.</Text>
            )}
          </Card>

          <Card title="Applications">
            <DataTable
              label="Applications"
              rows={v.applications}
              getRowId={(a) => a.id}
              empty={<EmptyState compact title="No applications." />}
              columns={[
                { key: 'j', header: 'Job', value: (a) => a.jobTitle },
                { key: 's', header: 'Stage', value: (a) => a.stage ?? '', render: (a) => <span>{a.closed ? (a.closedReason ?? 'Closed') : [a.stage, a.status].filter(Boolean).join(' · ')}</span> },
                { key: 'v', header: 'Source', value: (a) => a.source ?? '' },
                { key: 'd', header: 'Applied', value: (a) => a.appliedAt, render: (a) => <span>{day(a.appliedAt)}</span> },
              ] as TableColumn<CandidateProfileView['applications'][number]>[]}
              rowButtons={(a) => <Button size="sm" onClick={() => p.onOpenJob(a.jobId)}>Open job</Button>}
            />
          </Card>

          <Card title="Assessments and interviews">
            {v.assessments.length === 0 && v.interviews.length === 0 && <Text as="p" tone="secondary">None yet.</Text>}
            {v.assessments.map((a) => (
              <Text as="p" key={a.id}>{a.exam} · {a.status} · invited {day(a.invitedAt)}</Text>
            ))}
            {v.interviews.map((i) => (
              <Text as="p" key={i.id}>Interview · {i.status} · {day(i.createdAt)}</Text>
            ))}
          </Card>

          <Card title="Messages">
            <Text as="p" tone="secondary">{v.messages.emails.length} emails · {v.messages.sms} SMS · {v.messages.whatsapp} WhatsApp</Text>
            {v.messages.emails.slice(0, 10).map((e) => (
              <Text as="p" key={e.id}>{day(e.createdAt)} · {e.subject} {e.status === 'failed' ? '(not delivered)' : ''}</Text>
            ))}
          </Card>

          <Card title="Consents and data">
            <DataTable
              label="Consents"
              rows={v.consents}
              getRowId={(c) => c.id}
              empty={<EmptyState compact title="No consent recorded." />}
              columns={[
                { key: 'p', header: 'For', value: (c) => PURPOSE[c.purpose] ?? c.purpose },
                { key: 'v', header: 'Notice version', type: 'number', value: (c) => c.version },
                { key: 'g', header: 'Given', value: (c) => c.givenAt, render: (c) => <span>{day(c.givenAt)}</span> },
                { key: 'w', header: 'Withdrawn', value: (c) => c.withdrawnAt ?? '', render: (c) => <span>{c.withdrawnAt ? day(c.withdrawnAt) : '—'}</span> },
              ] as TableColumn<CandidateProfileView['consents'][number]>[]}
            />
            <Text as="p">
              {erased ? 'This candidate was erased.' : v.retention.until ? `Kept until ${day(v.retention.until)} unless there is new activity (${v.retention.months} months after the last activity).` : ''}
            </Text>
            {v.lists.length > 0 && <Text as="p" tone="secondary">In lists: {v.lists.map((l) => l.name).join(', ')}</Text>}
            {v.merges.length > 0 && <Text as="p" tone="secondary">{v.merges.map((m) => `${m.keptId === v.candidate.id ? 'Another candidate was merged into this one' : 'Merged into another candidate'} on ${day(m.mergedAt)}`).join(' · ')}</Text>}
            {!erased && (
              <div className="yx-tim-row">
                {p.canManage && poolConsent && !poolConsent.withdrawnAt && <Button size="sm" onClick={() => setWithdrawing(true)}>Record withdrawal: kept for other roles</Button>}
                {p.canDataRights && <Button size="sm" onClick={() => setHolding(true)}>{v.legalHold ? 'Lift legal hold' : 'Place legal hold'}</Button>}
                {p.canDataRights && !v.legalHold && <Button size="sm" variant="danger" onClick={() => setErasing(true)}>Erase personal data</Button>}
              </div>
            )}
          </Card>

          {emailing && <EmailDialog count={1} templates={p.templates} senders={p.senders} onClose={() => setEmailing(false)} onSend={async (c) => { await p.onEmail(c); }} />}
          {merging && <MergeDialog {...p} keptName={v.candidate.name} kept={{ name: v.candidate.name, phone: v.candidate.phone, hasResume: Boolean(v.resume?.hasFile) }} onClose={() => setMerging(false)} />}
          {holding && <HoldDialog on={!v.legalHold} onClose={() => setHolding(false)} onSave={p.onHold} />}
          {withdrawing && (
            <ConfirmDialog open onOpenChange={(o) => !o && setWithdrawing(false)} title="Record that the candidate withdrew?" consequence="They leave every talent pool now and are not added to one again unless they agree again." confirmLabel="Record withdrawal" onConfirm={async () => { await p.onWithdrawPool(); setWithdrawing(false); }} />
          )}
          {erasing && (
            <ConfirmDialog open destructive onOpenChange={(o) => !o && setErasing(false)} title={`Erase ${v.candidate.name}'s personal data?`} consequence="Name, contact details, résumé, messages and notes are removed for good. Applications, stages and scores stay without the name. This cannot be undone." confirmLabel="Erase personal data" onConfirm={async () => { await p.onErase(); setErasing(false); }} />
          )}
        </>
      )}
    </LivePage>
  );
}

function MergeDialog(p: CandidateProfileScreenProps & { keptName: string; kept: { name: string; phone: string | null; hasResume: boolean }; onClose: () => void }) {
  const [other, setOther] = useState<string | null>(null);
  const [values, setValues] = useState<{ name: string; phone: string | null; hasResume: boolean } | null>(null);
  const [choices, setChoices] = useState<MergeChoices>({ name: 'kept', phone: 'kept', resume: 'kept' });
  const [tried, setTried] = useState(false);
  const pickOther = async (id: string | null) => {
    setOther(id);
    setValues(id ? await p.loadOther(id) : null);
  };
  const row = (f: MergeField, label: string, kept: string, merged: string) => (
    <FormField key={f} id={`mg-${f}`} label={label}>
      <Segment label={label} value={choices[f]} onChange={(v) => setChoices((c) => ({ ...c, [f]: v }))} options={[{ value: 'kept', label: kept || '(none)' }, { value: 'merged', label: merged || '(none)' }]} />
    </FormField>
  );
  return (
    <ConfirmDialog open destructive size="md" onOpenChange={(o) => !o && p.onClose()} title={`Merge a duplicate into ${p.keptName}`} consequence="Applications, messages, assessments, interviews, consents and files move to this candidate. If both applied to the same job, the duplicate's application closes as merged. A merge cannot be undone." confirmLabel="Merge"
      // Kept only while the chosen duplicate's details are still loading (a request is running).
      confirmDisabled={Boolean(other) && !values}
      onConfirm={async () => {
      setTried(true);
      if (!other || !values) return false;
      await p.onMerge(other, choices);
      p.onClose();
    }}>
      <FormField id="mg-other" label="Duplicate to merge in" required error={tried && !other ? 'Choose the duplicate to merge in.' : null}>
        <Select aria-label="Duplicate to merge in" value={other} onChange={(v) => void pickOther(v)} options={p.mergeCandidates} searchable onSearchChange={p.onMergeSearch} />
      </FormField>
      {values && (
        <>
          <Text as="p" tone="secondary">For each detail, choose which value stays.</Text>
          {row('name', 'Name', p.kept.name, values.name)}
          {row('phone', 'Phone', p.kept.phone ?? '', values.phone ?? '')}
          {row('resume', 'Résumé', p.kept.hasResume ? 'This candidate’s' : '', values.hasResume ? 'The duplicate’s' : '')}
        </>
      )}
    </ConfirmDialog>
  );
}

function HoldDialog(p: { on: boolean; onClose: () => void; onSave: (on: boolean, reason: string | null) => Promise<unknown> }) {
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && p.onClose()} title={p.on ? 'Place a legal hold?' : 'Lift the legal hold?'} consequence={p.on ? 'While the hold is on, nothing about this candidate is erased, merged away or removed by the retention sweep.' : 'The candidate is handled by the normal retention rules again.'} confirmLabel={p.on ? 'Place hold' : 'Lift hold'} onConfirm={async () => {
      setTried(true);
      if (p.on && reason.trim().length < 3) return false;
      await p.onSave(p.on, p.on ? reason.trim() : null);
      p.onClose();
    }}>
      {p.on && (
        <FormField id="lh-reason" label="Reason" required helper="For example the case or request reference." error={tried && reason.trim().length < 3 ? 'Enter a reason of at least 3 characters.' : null}>
          <TextArea value={reason} onChange={setReason} rows={3} maxLength={500} />
        </FormField>
      )}
    </ConfirmDialog>
  );
}
