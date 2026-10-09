// T9 portals for people linked to the workforce: pre-joiners, alumni and nominees, external trainers,
// POSH IC external members and external parties, the audit-committee chair, anonymous reporters and the public verify page.
import { useMemo, useState, type ReactNode } from 'react';
import { Download, FileText, Lock, Send, Upload } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Card, DescriptionList, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { EmptyState, InlineAlert, Meter } from '../../components/feedback';
import { FormField, FieldRow } from '../../components/field';
import { CurrencyField, TextArea, TextField, MaskedField } from '../../components/inputs';
import { Checkbox, RadioGroup } from '../../components/choice';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { FileUpload, type UploadItem } from '../../components/upload';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { ApprovalTimeline, type ApprovalStep } from '../../components/timeline';
import { Icon } from '../../components/foundations';
import { formatDate, formatINR, formatTime } from '../../lib/format';
import {
  alumniAccessEnds,
  checklistPercent,
  daysUntil,
  formatAccessCode,
  isCompleteAccessCode,
  nomineeShareError,
  verifyDocument,
  type VerifiableDoc,
} from './portals-logic';
import { BlockNote, ConsentPanel, Fact, FactRow, OtpInput, QrCode, StepDots, TenantPortal } from './portals-kit';
import type { IcCase, Nominee, PortalDoc, PreItem, TrainerSession, WbCase } from './t9-data';

const fakeUpload = () => Promise.resolve();
const uploaded = (name: string, status: UploadItem['status'] = 'done', error?: string): UploadItem => ({
  id: name,
  file: new File(['x'], name, { type: 'application/pdf' }),
  status,
  progress: 100,
  error,
});

const PRE_STATUS: Record<PreItem['status'], { tone: BadgeTone; text: string }> = {
  done: { tone: 'success', text: 'Done' },
  'in-review': { tone: 'info', text: 'HR is checking' },
  todo: { tone: 'neutral', text: 'To do' },
  'sent-back': { tone: 'danger', text: 'Sent back' },
  blocked: { tone: 'warning', text: 'Waiting' },
};

/* ================================================================== */
/* T9-01 Pre-boarding portal                                           */
/* ================================================================== */

export interface Joiner {
  name: string;
  email: string;
  role: string;
  department: string;
  manager: string;
  location: string;
  address: string;
  joiningDate: Date;
  reportingTime: string;
  buddy: string;
  batch: string | null;
}

export type PreOutcome = 'in-progress' | 'postponed' | 'reneged' | 'withdrawn' | 'cancelled' | 'joined';

export interface PreboardingPortalProps {
  tenant: string;
  accent?: string;
  joiner: Joiner;
  items: PreItem[];
  today: Date;
  outcome?: PreOutcome;
  /** For postponed: the new joining date. */
  newJoiningDate?: Date;
  tab?: 'checklist' | 'offer' | 'documents';
  children?: ReactNode;
}

const PRE_NAV = (tab: string) => [
  { label: 'Checklist', active: tab === 'checklist' },
  { label: 'Offer and letters', active: tab === 'offer' },
  { label: 'Documents', active: tab === 'documents' },
];

// T9-01
/** Pre-boarding home: welcome, completion %, the checklist by section (M01 §3.5) and the outcome banner. */
export function PreboardingPortalScreen({ tenant, accent, joiner, items, today, outcome = 'in-progress', newJoiningDate, tab = 'checklist', children }: PreboardingPortalProps) {
  const pct = checklistPercent(items);
  const endsOn = outcome === 'postponed' && newJoiningDate ? newJoiningDate : joiner.joiningDate;
  const ended = outcome === 'withdrawn' || outcome === 'cancelled' || outcome === 'reneged' || outcome === 'joined';
  const next = items.find((i) => (i.status === 'todo' || i.status === 'sent-back') && !i.hrOwned);
  const sections = Array.from(new Set(items.map((i) => i.section)));
  return (
    <TenantPortal
      tenant={tenant}
      portal="Your joining checklist"
      accent={accent}
      nav={ended ? [] : PRE_NAV(tab)}
      access={{ kind: 'otp', identity: joiner.email, endsOn: ended ? today : endsOn, today: ended ? new Date(today.getTime() + 86_400_000) : today, endsBecause: 'your joining date' }}
      footer={{ privacy: 'Privacy notice for pre-joiners (G-09)' }}
      pinned={!ended && tab === 'checklist' && next ? <Button variant="primary">{next.status === 'sent-back' ? `Fix ${next.title.toLowerCase()}` : `Continue: ${next.title}`}</Button> : undefined}
    >
      {outcome === 'postponed' && newJoiningDate && (
        <InlineAlert tone="info" title={`Your joining date moved to ${formatDate(newJoiningDate)}`}>
          Open items now fall due before the new date. What you have already finished stays done.
        </InlineAlert>
      )}
      {outcome === 'withdrawn' && (
        <InlineAlert tone="warning" title="This offer has been withdrawn">
          {tenant} withdrew the offer on {formatDate(today)} and sent you a letter explaining why. This page is now closed. Your details are kept as a cancelled record, not
          deleted, as the law requires. Contact the HR team if you have questions.
        </InlineAlert>
      )}
      {outcome === 'reneged' && (
        <InlineAlert tone="info" title="You declined this offer">
          We recorded your reason and let the hiring team know. This page is now closed. Thank you for letting us know.
        </InlineAlert>
      )}
      {outcome === 'cancelled' && (
        <InlineAlert tone="warning" title="Your pre-joining access has ended">
          Your joining was cancelled, so sign-in to this page has stopped. Contact the HR team if you think this is a mistake.
        </InlineAlert>
      )}
      {outcome === 'joined' && (
        <InlineAlert tone="success" title={`Welcome to ${tenant}`}>
          You have joined, so this page is closed. Everything you filled in is already in your employee profile. Sign in to the employee app with your work email.
        </InlineAlert>
      )}

      {!ended && children}
      {!ended && !children && (
        <>
          <section className="yx-ps-hero">
            <h1>Welcome, {joiner.name.split(' ')[0]}</h1>
            <p>
              You join as {joiner.role} in {joiner.department} on <strong>{formatDate(endsOn)}</strong>. Finish the items below before then so your first day is about
              meeting your team, not paperwork.
            </p>
          </section>
          <div className="yx-split">
            <div className="yx-split__main">
              <Card title="Your progress">
                <Meter label="Checklist complete" value={pct} max={100} warnAt={101} dangerAt={101} valueText={`${pct}% · ${items.filter((i) => i.status === 'done' || i.status === 'in-review').length} of ${items.length}`} />
              </Card>
              {items.some((i) => i.status === 'sent-back') && (
                <InlineAlert tone="danger" title="HR sent back an item">
                  {items
                    .filter((i) => i.status === 'sent-back')
                    .map((i) => `${i.title}: ${i.note}`)
                    .join(' ')}
                </InlineAlert>
              )}
              {sections.map((s) => (
                <Card key={s} title={s}>
                  <ul className="yx-ps-list">
                    {items
                      .filter((i) => i.section === s)
                      .map((i) => (
                        <li key={i.id}>
                          <div className="yx-ps-list__main">
                            <span className="yx-ps-list__title">{i.title}</span>
                            {(i.hint || i.note || i.due) && (
                              <span className="yx-ps-list__meta">
                                {[i.hint, i.note, i.due && i.status !== 'done' ? `Due ${formatDate(i.due)}` : null].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </div>
                          <Badge tone={PRE_STATUS[i.status].tone}>{i.hrOwned && i.status === 'todo' ? 'HR completes this' : PRE_STATUS[i.status].text}</Badge>
                          {!i.hrOwned && i.status !== 'done' && i.status !== 'in-review' && (
                            <Button size="sm">{i.status === 'sent-back' ? 'Fix' : 'Open'}</Button>
                          )}
                        </li>
                      ))}
                  </ul>
                </Card>
              ))}
            </div>
            <div className="yx-split__aside">
              <Card title="Your first day">
                <DescriptionList
                  items={[
                    { label: 'Date', value: formatDate(endsOn) },
                    { label: 'Report at', value: `${formatTime(joiner.reportingTime)} · ${joiner.location}` },
                    { label: 'Address', value: joiner.address },
                    { label: 'Your manager', value: joiner.manager },
                    { label: 'Your buddy', value: joiner.buddy },
                    ...(joiner.batch ? [{ label: 'Joining batch', value: joiner.batch }] : []),
                  ]}
                />
              </Card>
              <Card title="Bring on day one">
                <ul className="yx-ps-list">
                  <li>Original PAN and Aadhaar (to be seen, not kept)</li>
                  <li>Safety shoes for the plant floor</li>
                  <li>Two passport-size photos</li>
                </ul>
              </Card>
              <DeclineOffer />
            </div>
          </div>
        </>
      )}
    </TenantPortal>
  );
}

function DeclineOffer() {
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  return (
    <Card title="Changed your mind?">
      <p className="yx-ps-muted">If you no longer plan to join, tell us here. The hiring team is told straight away.</p>
      <ConfirmDialog
        trigger={<Button variant="danger">Decline offer</Button>}
        title="Decline the offer from Kaveri Foods?"
        consequence="Your pre-joining access ends and the hiring team is told. You can't undo this from here."
        confirmLabel="Decline offer"
        destructive
        confirmDisabled={!reason}
        onConfirm={() => undefined}
      >
        <FormField label="Reason" required>
          <Select
            value={reason}
            onChange={setReason}
            options={['Accepted another offer', 'Counter-offer from current employer', 'Location or relocation', 'Personal reasons', 'Other'].map((x) => ({ value: x, label: x }))}
            placeholder="Choose a reason"
          />
        </FormField>
        <FormField label="Anything else" optional>
          <TextArea value={note} onChange={setNote} rows={3} />
        </FormField>
      </ConfirmDialog>
    </Card>
  );
}

/** Family and nominees form: shares per scheme must add up to 100% (PF, gratuity, group insurance). */
export function NomineeForm({ defaultNominees }: { defaultNominees: Nominee[] }) {
  const [rows, setRows] = useState(defaultNominees);
  const [tried, setTried] = useState(false);
  const errs = {
    pf: nomineeShareError(rows.map((r) => r.pf)),
    gratuity: nomineeShareError(rows.map((r) => r.gratuity)),
    insurance: nomineeShareError(rows.map((r) => r.insurance)),
  };
  const set = (id: string, k: 'pf' | 'gratuity' | 'insurance', v: number | null) => setRows((xs) => xs.map((r) => (r.id === id ? { ...r, [k]: v ?? 0 } : r)));
  const anyErr = Object.values(errs).some(Boolean);
  return (
    <Card
      title="Family and nominees"
      footer={
        <>
          <Button>Save draft</Button>
          <Button variant="primary" onClick={() => setTried(true)}>
            Save nominees
          </Button>
        </>
      }
    >
      <div className="yx-ps-stack">
        <p className="yx-ps-muted">Nominate who receives your PF, gratuity and group insurance. Each scheme's shares must add up to 100%.</p>
        {tried && anyErr && (
          <InlineAlert tone="danger" title="Fix the shares before saving">
            {[errs.pf && `PF: ${errs.pf}`, errs.gratuity && `Gratuity: ${errs.gratuity}`, errs.insurance && `Group insurance: ${errs.insurance}`].filter(Boolean).join(' ')}
          </InlineAlert>
        )}
        {tried && !anyErr && <InlineAlert tone="success" title="Nominees saved">HR will add these to Form 2 and Form F when you join.</InlineAlert>}
        <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Nominee shares, scrolls sideways on small screens">
        <table className="yx-ps-slabgrid">
          <caption className="yx-visually-hidden">Nominee shares</caption>
          <thead>
            <tr>
              <th scope="col">Nominee</th>
              <th scope="col">Relation</th>
              <th scope="col">Date of birth</th>
              <th scope="col">PF %</th>
              <th scope="col">Gratuity %</th>
              <th scope="col">Insurance %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.name}</th>
                <td>{r.relation}</td>
                <td>{formatDate(r.dob)}</td>
                {(['pf', 'gratuity', 'insurance'] as const).map((k) => (
                  <td key={k} data-num>
                    <input
                      aria-label={`${r.name} ${k === 'pf' ? 'PF' : k} share`}
                      inputMode="numeric"
                      value={r[k]}
                      aria-invalid={tried && !!errs[k]}
                      onChange={(e) => set(r.id, k, Number(e.target.value.replace(/\D/g, '')))}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3}>
                Total
              </th>
              {(['pf', 'gratuity', 'insurance'] as const).map((k) => {
                const t = rows.reduce((a, r) => a + r[k], 0);
                return (
                  <td key={k} data-num>
                    {t}% {t !== 100 && <Badge tone="danger">Must be 100%</Badge>}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
        </div>
        <Button size="sm">Add nominee</Button>
      </div>
    </Card>
  );
}

export type BankStage = 'step-up' | 'form' | 'verifying' | 'verified' | 'mismatch';

/** Bank details behind a step-up code (AAL1 + step-up for bank and PAN, M01 §3.5); auto-verified by penny drop (P10 Q6). */
export function BankDetailsStep({ stage: initial, holderName }: { stage: BankStage; holderName: string }) {
  const [stage, setStage] = useState(initial);
  const [otp, setOtp] = useState('');
  const [ifsc, setIfsc] = useState(stage === 'form' ? '' : 'KVBL0001203');
  const [acct, setAcct] = useState(stage === 'form' ? '' : '1203155000041872');
  const [acct2, setAcct2] = useState(stage === 'form' ? '' : '1203155000041872');
  const mismatch = acct2 !== '' && acct !== acct2;
  if (stage === 'step-up')
    return (
      <Card title="Confirm it's you">
        <div className="yx-ps-stack">
          <p className="yx-ps-muted">Bank and PAN details need a fresh code. We sent one to your mobile ending 321.</p>
          <FormField label="Code" hideLabel>
            <OtpInput value={otp} onChange={setOtp} />
          </FormField>
          <div className="yx-ps-row">
            <Button variant="primary" disabled={otp.length < 6} onClick={() => setStage('form')}>
              Verify
            </Button>
          </div>
        </div>
      </Card>
    );
  return (
    <Card
      title="Bank account for salary"
      footer={
        stage === 'form' ? (
          <Button variant="primary" onClick={() => !mismatch && ifsc && acct && setStage('verifying')}>
            Verify account
          </Button>
        ) : stage === 'mismatch' ? (
          <>
            <Button onClick={() => setStage('form')}>Edit details</Button>
            <Button variant="primary">Send to HR to check</Button>
          </>
        ) : undefined
      }
    >
      <div className="yx-ps-stack">
        <FieldRow>
          <FormField label="IFSC" required helper="11 characters, printed on your cheque book">
            <MaskedField kind="ifsc" value={ifsc} onChange={setIfsc} disabled={stage !== 'form'} />
          </FormField>
          <FormField label="Account holder">
            <TextField value={holderName} disabled />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField label="Account number" required>
            <TextField value={acct} onChange={setAcct} inputMode="numeric" autoComplete="off" disabled={stage !== 'form'} />
          </FormField>
          <FormField label="Re-enter account number" required error={mismatch ? 'The two account numbers are different. Check both.' : null}>
            <TextField value={acct2} onChange={setAcct2} inputMode="numeric" autoComplete="off" disabled={stage !== 'form'} />
          </FormField>
        </FieldRow>
        {stage === 'verifying' && (
          <InlineAlert tone="info" title="Checking your account">
            We are sending ₹1 to confirm the account and the name on it. This usually takes under a minute.
          </InlineAlert>
        )}
        {stage === 'verified' && (
          <InlineAlert tone="success" title="Account verified">
            Karur Vysya Bank, Hosur branch. Name at the bank: MEENAKSHI SUNDARAM, matches your profile.
          </InlineAlert>
        )}
        {stage === 'mismatch' && (
          <InlineAlert tone="warning" title="The name at the bank doesn't match">
            The bank returned "M SUNDARAM RAJAGOPAL". If this is your account, send it to HR to check with a cancelled cheque or passbook page.
          </InlineAlert>
        )}
      </div>
    </Card>
  );
}

/** Tax regime choice and previous-employer income (Form 12B). Estimate only, not tax advice. */
export function TaxRegimeStep({ defaultRegime = null }: { defaultRegime?: 'new' | 'old' | null }) {
  const [regime, setRegime] = useState<string | undefined>(defaultRegime ?? undefined);
  const [hadJob, setHadJob] = useState(true);
  const [gross, setGross] = useState<number | null>(4_20_000);
  const [tds, setTds] = useState<number | null>(18_600);
  return (
    <Card title="Choose your tax regime" footer={<Button variant="primary" disabled={!regime}>Save choice</Button>}>
      <div className="yx-ps-stack">
        <RadioGroup
          value={regime}
          onChange={setRegime}
          options={[
            { value: 'new', label: 'New regime (default)', description: 'Lower slab rates, few deductions. Standard deduction ₹75,000.' },
            { value: 'old', label: 'Old regime', description: 'Claim HRA, 80C, 80D and home loan interest with proofs.' },
          ]}
        />
        <p className="yx-ps-muted">You can change this once more in the April declaration window. This is an estimate, not tax advice.</p>
        <Checkbox checked={hadJob} onChange={setHadJob} label="I worked for another employer earlier this financial year" />
        {hadJob && (
          <FieldRow>
            <FormField label="Gross salary from last employer (FY 2026-27)" helper="From your last payslip or Form 16 Part B">
              <CurrencyField value={gross} onChange={setGross} />
            </FormField>
            <FormField label="TDS already deducted">
              <CurrencyField value={tds} onChange={setTds} />
            </FormField>
          </FieldRow>
        )}
      </div>
    </Card>
  );
}

export type LetterSignState = 'loi' | 'to-sign' | 'signed' | 'declined';

/** LOI, offer and appointment letter in one record (E18, YX-LC-24), with e-sign (P05 Q2). */
export function OfferLettersPanel({ state, joiner, ctc }: { state: LetterSignState; joiner: Joiner; ctc: number }) {
  const [agree, setAgree] = useState(false);
  return (
    <div className="yx-ps-stack">
      <Card title={state === 'loi' ? 'Letter of intent' : 'Appointment letter'} actions={<Badge tone={state === 'signed' ? 'success' : state === 'declined' ? 'danger' : 'warning'}>{state === 'signed' ? 'Signed' : state === 'declined' ? 'Declined' : 'Waiting for your signature'}</Badge>}>
        <div className="yx-ps-stack">
          <DescriptionList
            columns={2}
            items={[
              { label: 'Designation', value: joiner.role },
              { label: 'Department', value: joiner.department },
              { label: 'Location', value: joiner.location },
              { label: 'Joining date', value: formatDate(joiner.joiningDate) },
              { label: 'Annual CTC', value: formatINR(ctc) },
              { label: 'Probation', value: '6 months' },
              { label: 'Reference', value: 'KF/HR/APT/2026/0187', mono: true },
            ]}
          />
          {state === 'loi' && (
            <InlineAlert tone="info" title="Your formal offer follows">
              This letter confirms our intent to hire you. The appointment letter with the full salary break-up will appear here after your documents are checked.
            </InlineAlert>
          )}
          <div className="yx-ps-row">
            <Button icon={FileText}>Read the full letter</Button>
            <Button icon={Download}>Download PDF</Button>
          </div>
        </div>
      </Card>
      {state === 'to-sign' && (
        <Card title="Sign with Aadhaar e-sign" footer={<Button variant="primary" disabled={!agree}>Sign letter</Button>}>
          <div className="yx-ps-stack">
            <StepDots steps={['Read', 'Agree', 'Sign with OTP']} current={agree ? 2 : 1} />
            <Checkbox checked={agree} onChange={setAgree} label="I have read the appointment letter and accept its terms" />
            <p className="yx-ps-muted">You get a one-time code from UIDAI on your Aadhaar-linked mobile. We never see or store the code.</p>
          </div>
        </Card>
      )}
      {state === 'signed' && (
        <InlineAlert tone="success" title="Signed on 24 Sep 2026, 7:18 pm">
          A signed copy is in Documents. HR countersigned on 25 Sep 2026.
        </InlineAlert>
      )}
    </div>
  );
}

/** Documents with camera upload; HR verifies PAN, Aadhaar, bank and education proofs (P05 Q7). */
export function PreboardingDocuments({ items }: { items: PreItem[] }) {
  const docs = items.filter((i) => i.section === 'Documents');
  return (
    <div className="yx-ps-stack">
      {docs.map((doc) => (
        <Card key={doc.id} title={doc.title} actions={<Badge tone={PRE_STATUS[doc.status].tone}>{PRE_STATUS[doc.status].text}</Badge>}>
          {doc.status === 'sent-back' && (
            <InlineAlert tone="danger" title="Upload this again">
              {doc.note}
            </InlineAlert>
          )}
          {(doc.status === 'todo' || doc.status === 'sent-back') && (
            <FileUpload upload={fakeUpload} accept={['.pdf', '.jpg', '.png']} maxSize={5 * 1024 * 1024} defaultItems={doc.status === 'sent-back' ? [uploaded('relieving-letter-page1.pdf', 'error', 'Sent back by HR')] : []} />
          )}
          {(doc.status === 'done' || doc.status === 'in-review') && <p className="yx-ps-muted">{doc.status === 'done' ? 'Verified by HR.' : 'Uploaded. HR is checking it.'}</p>}
        </Card>
      ))}
    </div>
  );
}

/* ================================================================== */
/* T9-02 Alumni + nominee portal                                       */
/* ================================================================== */

// T9-02
/** Alumni: own payslips, Form 16 and letters, read-only, for 7 years from exit (YX-DOC-16). */
export function AlumniPortalScreen({
  tenant,
  accent,
  person,
  docs,
  today,
  tab = 'Payslip',
}: {
  tenant: string;
  accent?: string;
  person: { name: string; email: string; exitDate: Date; lastRole: string; code: string };
  docs: PortalDoc[];
  today: Date;
  tab?: 'Payslip' | 'Form 16' | 'Letter';
}) {
  const ends = alumniAccessEnds(person.exitDate);
  const kinds: ('Payslip' | 'Form 16' | 'Letter')[] = ['Payslip', 'Form 16', 'Letter'];
  const label = { Payslip: 'Payslips', 'Form 16': 'Form 16', Letter: 'Letters' } as const;
  return (
    <TenantPortal
      tenant={tenant}
      portal="Former employee documents"
      accent={accent}
      access={{ kind: 'otp', identity: person.email, endsOn: ends, today, endsBecause: '7 years after you left' }}
      footer={{ privacy: 'Privacy notice for former employees (G-09)' }}
    >
      <section className="yx-ps-hero">
        <h1>Your documents from {tenant}</h1>
        <p>
          {person.lastRole} · {person.code} · left on {formatDate(person.exitDate)}. You can view and download these, but not change them.
        </p>
      </section>
      <Tabs defaultValue={tab.replace(/\s+/g, '-')}>
        <TabsList aria-label="Document type">
          {kinds.map((k) => (
            <TabsTrigger key={k} value={k.replace(/\s+/g, '-')} count={docs.filter((x) => x.kind === k).length}>
              {label[k]}
            </TabsTrigger>
          ))}
        </TabsList>
        {kinds.map((k) => {
          const list = docs.filter((x) => x.kind === k);
          return (
            <TabsContent key={k} value={k.replace(/\s+/g, '-')}>
              {list.length === 0 ? (
                <EmptyState title={`No ${label[k].toLowerCase()} were issued to you.`} description="If you expected one, ask the HR team; they can publish it here." />
              ) : (
                <DocList docs={list} />
              )}
            </TabsContent>
          );
        })}
      </Tabs>
      <p className="yx-ps-muted">
        Need a document that isn't here, like a salary certificate for a loan? <Link href="#">Ask the HR team</Link>.
      </p>
    </TenantPortal>
  );
}

function DocList({ docs }: { docs: PortalDoc[] }) {
  const groups = Array.from(new Set(docs.map((x) => x.period ?? '')));
  return (
    <div className="yx-ps-stack">
      {groups.map((g) => (
        <Card key={g || 'all'} title={g || undefined}>
          <ul className="yx-ps-list">
            {docs
              .filter((x) => (x.period ?? '') === g)
              .map((x) => (
                <li key={x.id}>
                  <Icon icon={FileText} />
                  <div className="yx-ps-list__main">
                    <span className="yx-ps-list__title">{x.title}</span>
                    <span className="yx-ps-list__meta">
                      Issued {formatDate(x.issuedOn)} · PDF · {x.size}
                    </span>
                  </div>
                  {x.status === 'pending' ? <Badge tone="warning">HR is preparing this</Badge> : <Button size="sm" icon={Download}>Download</Button>}
                </li>
              ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

/** Nominee or legal heir: only the claim documents HR releases (YX-DOC-19). */
export function NomineePortalScreen({
  tenant,
  accent,
  nominee,
  deceased,
  docs,
  fnf,
  today,
  claimsClosed,
}: {
  tenant: string;
  accent?: string;
  nominee: { name: string; relation: string; email: string };
  deceased: { name: string; code: string; role: string; dateOfDeath: Date };
  docs: PortalDoc[];
  fnf: { label: string; amount: number }[];
  today: Date;
  claimsClosed?: boolean;
}) {
  const net = fnf.reduce((a, l) => a + l.amount, 0);
  return (
    <TenantPortal
      tenant={tenant}
      portal="Nominee claim documents"
      accent={accent}
      access={
        claimsClosed
          ? { kind: 'otp', identity: nominee.email, endsOn: today, today: new Date(today.getTime() + 86_400_000) }
          : { kind: 'otp', identity: nominee.email, endsOn: new Date(2033, 7, 3), today, endsBecause: 'or when HR closes the claims' }
      }
      footer={{ privacy: 'Privacy notice for nominees (G-09)' }}
    >
      <section className="yx-ps-hero">
        <h1>Documents for {deceased.name}'s claims</h1>
        <p>
          We are sorry for your loss. {tenant} has released these documents to you as {nominee.relation.toLowerCase()} and nominee, so you can file claims with the
          EPFO and the insurer.
        </p>
      </section>
      {claimsClosed ? (
        <InlineAlert tone="info" title="All claims are settled">
          HR closed the claims on {formatDate(today)}, so this page has closed. If you still need a copy of a document, contact the HR team.
        </InlineAlert>
      ) : (
        <div className="yx-split">
          <div className="yx-split__main">
            <DocList docs={docs} />
          </div>
          <div className="yx-split__aside">
            <Card title="Full and final settlement">
              <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Settlement lines, scrolls sideways on small screens">
              <table className="yx-ps-slabgrid">
                <caption className="yx-visually-hidden">Settlement lines</caption>
                <tbody>
                  {fnf.map((l) => (
                    <tr key={l.label}>
                      <th scope="row">{l.label}</th>
                      <td data-num>{formatINR(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Paid to the nominee's account</th>
                    <td data-num>
                      <strong>{formatINR(net)}</strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
              </div>
              <p className="yx-ps-muted">Paid on 22 Sep 2026 to the account in the nomination form.</p>
            </Card>
            <Card title="How to file">
              <ol className="yx-ps-stack">
                <li>Download the three EPFO forms; the employer part is already attested.</li>
                <li>File them on the EPFO portal or at the Hosur regional office.</li>
                <li>The gratuity form will appear here once HR signs it.</li>
              </ol>
            </Card>
          </div>
        </div>
      )}
    </TenantPortal>
  );
}

/* ================================================================== */
/* T9-03 External trainer portal                                       */
/* ================================================================== */

// T9-03
/** External trainer: own sessions only; mark attendance, enter results, see the feedback summary (M07 Q6). */
export function TrainerPortalScreen({
  tenant,
  accent,
  trainer,
  sessions,
  selectedId,
  today,
  accessEnds,
  tab = 'attendance',
}: {
  tenant: string;
  accent?: string;
  trainer: { name: string; firm: string; email: string };
  sessions: TrainerSession[];
  selectedId: string;
  today: Date;
  accessEnds: Date;
  tab?: 'attendance' | 'results' | 'feedback';
}) {
  const [sel, setSel] = useState(selectedId);
  const s = sessions.find((x) => x.id === sel) ?? sessions[0];
  const [rows, setRows] = useState(s.attendees);
  const [saved, setSaved] = useState<string | null>(null);
  const ended = daysUntil(accessEnds, today) < 0;
  const invalidScore = rows.some((r) => r.score != null && (r.score < 0 || r.score > 100));
  const passed = rows.filter((r) => r.score != null && r.score >= s.passMark).length;
  const future = s.status === 'upcoming';
  return (
    <TenantPortal
      tenant={tenant}
      portal="Trainer sessions"
      accent={accent}
      access={{ kind: 'otp', identity: trainer.email, endsOn: accessEnds, today, endsBecause: '14 days after your last session' }}
      footer={{ privacy: 'Privacy notice for external trainers (G-09)' }}
    >
      {ended ? (
        <InlineAlert tone="info" title="Your access has ended">
          Access closes 14 days after your last session. {tenant}'s learning team can reopen it if you have another session.
        </InlineAlert>
      ) : (
        <div className="yx-split">
          <div className="yx-split__main">
            <Card title={s.course} actions={<Badge tone={s.status === 'today' ? 'info' : s.status === 'completed' ? 'success' : 'neutral'}>{s.status === 'today' ? 'Today' : s.status === 'completed' ? 'Completed' : 'Upcoming'}</Badge>}>
              <p className="yx-ps-muted">
                {formatDate(s.date)} · {formatTime(s.time)} · {s.venue} · {s.attendees.length} of {s.seats} seats · pass mark {s.passMark}%
              </p>
            </Card>
            {saved && (
              <InlineAlert tone="success" title={saved}>
                HR can see this now.
              </InlineAlert>
            )}
            <Tabs defaultValue={tab}>
              <TabsList aria-label="Session">
                <TabsTrigger value="attendance">Attendance</TabsTrigger>
                <TabsTrigger value="results">Results</TabsTrigger>
                <TabsTrigger value="feedback">Feedback</TabsTrigger>
              </TabsList>
              <TabsContent value="attendance">
                {future ? (
                  <EmptyState title="Attendance opens on the day of the session." description={`You can mark attendance from ${formatDate(s.date)}.`} />
                ) : (
                  <Card footer={<Button variant="primary" onClick={() => setSaved(`Attendance saved: ${rows.filter((r) => r.present).length} present`)}>Save attendance</Button>}>
                    <ul className="yx-ps-list">
                      {rows.map((r) => (
                        <li key={r.id}>
                          <span className="yx-ps-list__main">{r.name}</span>
                          <Checkbox checked={!!r.present} onChange={(c) => setRows((xs) => xs.map((x) => (x.id === r.id ? { ...x, present: c } : x)))} label="Present" />
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </TabsContent>
              <TabsContent value="results">
                {s.status !== 'completed' && s.status !== 'today' ? (
                  <EmptyState title="Results open after the session." />
                ) : (
                  <Card
                    footer={
                      <Button variant="primary" disabled={invalidScore} onClick={() => setSaved(`Results saved: ${passed} passed`)}>
                        Save results
                      </Button>
                    }
                  >
                    {invalidScore && (
                      <InlineAlert tone="danger" title="Scores must be between 0 and 100">
                        Fix the highlighted scores before saving.
                      </InlineAlert>
                    )}
                    <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Scores, scrolls sideways on small screens">
                    <table className="yx-ps-slabgrid">
                      <caption className="yx-visually-hidden">Scores</caption>
                      <thead>
                        <tr>
                          <th scope="col">Attendee</th>
                          <th scope="col">Score %</th>
                          <th scope="col">Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id} data-invalid={r.score != null && (r.score < 0 || r.score > 100) ? true : undefined}>
                            <th scope="row">{r.name}</th>
                            <td data-num>
                              {r.present === false ? (
                                'Absent'
                              ) : (
                                <input
                                  aria-label={`${r.name} score`}
                                  inputMode="numeric"
                                  value={r.score ?? ''}
                                  aria-invalid={r.score != null && (r.score < 0 || r.score > 100)}
                                  onChange={(e) => {
                                    const v = e.target.value === '' ? null : Number(e.target.value.replace(/[^\d-]/g, ''));
                                    setRows((xs) => xs.map((x) => (x.id === r.id ? { ...x, score: v } : x)));
                                  }}
                                />
                              )}
                            </td>
                            <td>{r.present === false ? <Badge>Absent</Badge> : r.score == null ? <Badge>Not entered</Badge> : r.score >= s.passMark ? <Badge tone="success">Passed</Badge> : <Badge tone="danger">Not passed</Badge>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </Card>
                )}
              </TabsContent>
              <TabsContent value="feedback">
                {s.feedback ? (
                  <Card title="Feedback summary">
                    <FactRow label="Feedback">
                      <Fact label="Responses" value={`${s.feedback.responses} of ${rows.filter((r) => r.present).length}`} />
                      <Fact label="Average rating" value={`${s.feedback.avg} / 5`} />
                    </FactRow>
                    <ul className="yx-ps-list">
                      {s.feedback.comments.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                    <p className="yx-ps-muted">Comments are anonymous and shown only when 5 or more people respond.</p>
                  </Card>
                ) : (
                  <EmptyState title="No feedback yet." description="Attendees get the feedback form when the session ends." />
                )}
              </TabsContent>
            </Tabs>
          </div>
          <div className="yx-split__aside">
            <Card title="Your sessions">
              <ul className="yx-ps-list">
                {sessions.map((x) => (
                  <li key={x.id}>
                    <div className="yx-ps-list__main">
                      <span className="yx-ps-list__title">{x.course}</span>
                      <span className="yx-ps-list__meta">
                        {formatDate(x.date)} · {x.attendees.length} attendees
                      </span>
                    </div>
                    <Button
                      size="sm"
                      aria-pressed={x.id === sel}
                      onClick={() => {
                        setSel(x.id);
                        setRows(x.attendees);
                        setSaved(null);
                      }}
                    >
                      {x.id === sel ? 'Open' : 'View'}
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
            <p className="yx-ps-muted">You see attendee names only; no other employee details are shared with you.</p>
          </div>
        </div>
      )}
    </TenantPortal>
  );
}

/* ================================================================== */
/* T9-04 POSH IC external member + external party                      */
/* ================================================================== */

const IC_STEPS = ['Acknowledged', 'Notice sent', 'Hearing scheduled', 'Inquiry', 'Findings drafted', 'Decision', 'Appeal window'] as const;

// T9-04
/** IC external member: only appointed cases, restricted area, AAL2 (M08 Q4). */
export function IcMemberPortalScreen({
  tenant,
  accent,
  member,
  cases,
  openRef,
  today,
  showUndertaking,
}: {
  tenant: string;
  accent?: string;
  member: { name: string; org: string; tenureEnds: Date };
  cases: IcCase[];
  openRef?: string;
  today: Date;
  showUndertaking?: boolean;
}) {
  const [open, setOpen] = useState(openRef ?? null);
  const c = cases.find((x) => x.ref === open);
  return (
    <TenantPortal
      tenant={tenant}
      portal="Internal Committee · restricted"
      accent={accent}
      access={{ kind: 'otp', identity: member.name, endsOn: member.tenureEnds, today, endsBecause: 'end of your IC tenure' }}
      footer={{ privacy: 'Privacy notice for IC external members (G-09)' }}
    >
      <Dialog
        defaultOpen={showUndertaking}
        title="Confidentiality undertaking"
        description="Read and accept this before you open any case."
        size="md"
        footer={<Button variant="primary">Accept undertaking</Button>}
        preventClose
      >
        <div className="yx-ps-stack">
          <p className="yx-ps-p">
            I will keep the identity of the complainant, respondent and witnesses, and every detail of the inquiry, confidential as required by section 16 of the POSH Act. I
            will not copy, forward or discuss case material outside the committee.
          </p>
          <Checkbox label="I have no conflict of interest with the parties in the cases I am appointed to, and I will declare one if it arises" />
        </div>
      </Dialog>
      {c ? (
        <IcCaseDetail c={c} today={today} onBack={() => setOpen(null)} />
      ) : (
        <>
          <section className="yx-ps-hero">
            <h1>Your appointed cases</h1>
            <p>You see only cases {tenant} appointed you to. Messages outside this page only say you have an update on a confidential matter.</p>
          </section>
          {cases.length === 0 ? (
            <EmptyState title="No cases are assigned to you." description="The presiding officer adds you to a case when one is filed." />
          ) : (
            <Card>
              <ul className="yx-ps-list">
                {cases.map((x) => {
                  const left = daysUntil(x.inquiryDue, today);
                  return (
                    <li key={x.ref}>
                      <Icon icon={Lock} />
                      <div className="yx-ps-list__main">
                        <span className="yx-ps-list__title yx-ps-mono">{x.ref}</span>
                        <span className="yx-ps-list__meta">
                          Received {formatDate(x.receivedOn)} · {x.complainantType} complainant · inquiry due {formatDate(x.inquiryDue)}
                        </span>
                      </div>
                      {x.conflict ? (
                        <Badge tone="neutral">Excluded: conflict declared</Badge>
                      ) : (
                        <>
                          <Badge tone={left < 0 ? 'danger' : left <= 14 ? 'warning' : 'info'}>{left < 0 ? `${-left} days past the 90-day limit` : x.stage}</Badge>
                          <Button size="sm" onClick={() => setOpen(x.ref)}>
                            Open
                          </Button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </>
      )}
    </TenantPortal>
  );
}

function IcCaseDetail({ c, today, onBack }: { c: IcCase; today: Date; onBack: () => void }) {
  const idx = IC_STEPS.indexOf(c.stage);
  const steps: ApprovalStep[] = IC_STEPS.map((s, i) => ({ id: s, label: s, status: i < idx ? 'done' : i === idx ? 'current' : 'pending' }));
  const [note, setNote] = useState('');
  return (
    <div className="yx-ps-stack">
      <div className="yx-ps-row" data-between>
        <h1 className="yx-ps-h">
          Case <span className="yx-ps-mono">{c.ref}</span>
        </h1>
        <Button onClick={onBack}>Back to cases</Button>
      </div>
      <FactRow label="Case dates">
        <Fact label="Received" value={formatDate(c.receivedOn)} />
        <Fact label="Inquiry must finish by" value={formatDate(c.inquiryDue)} tone={daysUntil(c.inquiryDue, today) < 0 ? 'danger' : undefined} />
        <Fact label="Next hearing" value={c.nextHearing ? `${formatDate(c.nextHearing)}, 3:00 pm` : 'Not set'} />
      </FactRow>
      <div className="yx-split">
        <div className="yx-split__main">
          <Card title="Case documents" actions={<Button size="sm" icon={Upload}>Add document</Button>}>
            <ul className="yx-ps-list">
              {['Complaint (written, 2 pages)', 'Respondent reply', 'Witness statement 1', 'Notice of hearing'].map((x) => (
                <li key={x}>
                  <Icon icon={FileText} />
                  <span className="yx-ps-list__main">{x}</span>
                  <Button variant="review" size="sm">View</Button>
                </li>
              ))}
            </ul>
            <p className="yx-ps-muted">Documents open in the viewer only; download is off for this case. Every view is logged.</p>
          </Card>
          <Card title="Your notes for the committee" footer={<Button variant="primary">Save note</Button>}>
            <FormField label="Note" hideLabel helper="Visible to committee members on this case only.">
              <TextArea value={note} onChange={setNote} rows={4} />
            </FormField>
          </Card>
        </div>
        <div className="yx-split__aside">
          <Card title="Stage">
            <ApprovalTimeline steps={steps} aria-label="Case stages" />
          </Card>
          <Card title="Conflict of interest">
            <p className="yx-ps-muted">If you know either party, declare it. You will be removed from this case and it will not be shown to you again.</p>
            <ConfirmDialog trigger={<Button>Declare a conflict</Button>} title="Declare a conflict on this case?" consequence="The presiding officer is told and you lose access to this case." confirmLabel="Declare conflict" onConfirm={() => undefined} />
          </Card>
        </div>
      </div>
    </div>
  );
}

/** External party (contractor, vendor staff, client staff, visitor) filing and following one case (E16). */
export function ExternalPartyCaseScreen({ tenant, accent, today, mode }: { tenant: string; accent?: string; today: Date; mode: 'file' | 'status' }) {
  const [type, setType] = useState<string | null>('Vendor staff');
  const [when, setWhen] = useState<Date | null>(null);
  const [what, setWhat] = useState('');
  const [tried, setTried] = useState(false);
  const late = when ? daysUntil(when, today) < -90 : false;
  return (
    <TenantPortal
      tenant={tenant}
      portal="Confidential complaint"
      accent={accent}
      narrow
      access={{ kind: 'otp', identity: 'priya.menon@example.in', endsOn: new Date(2027, 0, 30), today, endsBecause: 'case closure plus the appeal window' }}
      footer={{ privacy: 'Privacy notice for external parties (G-09)' }}
      pinned={mode === 'file' ? <Button variant="primary" onClick={() => setTried(true)}>Send complaint</Button> : undefined}
    >
      {mode === 'file' ? (
        <>
          <section className="yx-ps-hero">
            <h1>Raise a complaint of sexual harassment</h1>
            <p>This goes only to {tenant}'s Internal Committee. You can follow it here. Updates by email only say you have an update on a confidential matter.</p>
          </section>
          {tried && !what && (
            <InlineAlert tone="danger" title="Describe what happened to send the complaint">
              A few lines is enough; the committee will contact you for more.
            </InlineAlert>
          )}
          <FormField label="You are" required>
            <Select value={type} onChange={setType} options={['Contractor staff', 'Vendor staff', 'Client staff', 'Visitor', 'Other'].map((x) => ({ value: x, label: x }))} />
          </FormField>
          <FieldRow>
            <FormField label="Your employer" required>
              <TextField defaultValue="Sri Lakshmi Logistics" />
            </FormField>
            <FormField label="When did it happen" required helper="Complaints are normally filed within 3 months; the committee can extend this by 3 months with reasons.">
              <DatePicker value={when} onChange={setWhen} max={today} />
            </FormField>
          </FieldRow>
          {late && <BlockNote>This date is more than 3 months ago. You can still send it; add why it is being raised now.</BlockNote>}
          <FormField label="What happened" required error={tried && !what ? 'Describe what happened.' : null}>
            <TextArea value={what} onChange={setWhat} rows={6} />
          </FormField>
          <FormField label="Supporting documents" optional>
            <FileUpload upload={fakeUpload} accept={['.pdf', '.jpg', '.png', '.mp3']} />
          </FormField>
        </>
      ) : (
        <>
          <section className="yx-ps-hero">
            <h1>
              Your complaint <span className="yx-ps-mono">POSH-2026-009</span>
            </h1>
            <p>Filed on 9 Sep 2026. The inquiry must finish within 90 days.</p>
          </section>
          <Card title="Progress">
            <ApprovalTimeline
              aria-label="Complaint progress"
              steps={[
                { id: '1', label: 'Filed', status: 'done', at: new Date(2026, 8, 9, 18, 5) },
                { id: '2', label: 'Acknowledged by the committee', status: 'done', at: new Date(2026, 8, 11, 10, 30) },
                { id: '3', label: 'Notice sent to the respondent and their employer', status: 'done', at: new Date(2026, 8, 16, 12, 0) },
                { id: '4', label: 'Hearing', status: 'current', comment: 'The committee will write to you with a date.' },
                { id: '5', label: 'Findings and decision', status: 'pending' },
              ]}
            />
          </Card>
          <Card title="Message the committee" footer={<Button variant="primary" icon={Send}>Send message</Button>}>
            <FormField label="Message" hideLabel>
              <TextArea rows={3} />
            </FormField>
          </Card>
        </>
      )}
    </TenantPortal>
  );
}

/* ================================================================== */
/* T9-05 Audit-committee chair portal                                  */
/* ================================================================== */

// T9-05
/** Whistleblower outcomes routed to the chair; acknowledge in 7 days, feedback in 3 months where the law applies (YX-CASE-17). */
export function AuditChairPortalScreen({
  tenant,
  accent,
  chair,
  cases,
  today,
  openRef,
}: {
  tenant: string;
  accent?: string;
  chair: { name: string; role: string };
  cases: WbCase[];
  today: Date;
  openRef?: string;
}) {
  const [open, setOpen] = useState(openRef ?? null);
  const c = cases.find((x) => x.ref === open);
  const active = cases.filter((x) => x.status !== 'Closed');
  const ackLate = active.filter((x) => x.status === 'Awaiting acknowledgement' && daysUntil(x.ackDue, today) <= 2);
  return (
    <TenantPortal
      tenant={tenant}
      portal="Audit committee · whistleblower cases"
      accent={accent}
      access={{ kind: 'otp', identity: chair.name, endsOn: new Date(2028, 2, 31), today, endsBecause: 'end of your tenure' }}
      footer={{ privacy: 'Privacy notice for the audit-committee chair (G-09)' }}
    >
      {c ? (
        <div className="yx-ps-stack">
          <div className="yx-ps-row" data-between>
            <h1 className="yx-ps-h">
              <span className="yx-ps-mono">{c.ref}</span> · {c.category}
            </h1>
            <Button onClick={() => setOpen(null)}>Back to cases</Button>
          </div>
          {c.retaliation && (
            <InlineAlert tone="danger" title="Retaliation flagged">
              The reporter says they were moved off a key account after reporting. The ethics officer has put a protection order in place.
            </InlineAlert>
          )}
          <FactRow label="Deadlines">
            <Fact label="Acknowledge by" value={formatDate(c.ackDue)} />
            <Fact label="Feedback to reporter by" value={formatDate(c.feedbackDue)} tone={daysUntil(c.feedbackDue, today) <= 30 ? 'warning' : undefined} />
            <Fact label="Investigated by" value={c.investigator} />
          </FactRow>
          <Card title="Outcome from the investigation">
            <DescriptionList
              items={[
                { label: 'Finding', value: 'Substantiated in part. Two purchase orders were split to stay under the approval limit.' },
                { label: 'People involved', value: 'One manager in procurement (name held by the ethics officer)' },
                { label: 'Proposed action', value: 'Final warning, recovery of ₹2,40,000, procurement approval rules tightened' },
                { label: 'Evidence', value: '14 documents, 3 interviews' },
              ]}
            />
          </Card>
          <Card
            title="Your decision"
            footer={
              <>
                <Button>Ask for more information</Button>
                <Button variant="primary">Accept outcome and close</Button>
              </>
            }
          >
            <FormField label="Note to the ethics officer" optional>
              <TextArea rows={3} />
            </FormField>
          </Card>
        </div>
      ) : (
        <>
          <section className="yx-ps-hero">
            <h1>Cases routed to you</h1>
            <p>Serious cases by category or value come to the chair. HR is not a member of this group and cannot see these cases.</p>
          </section>
          {ackLate.length > 0 && (
            <InlineAlert tone="warning" title={`${ackLate.length} case needs acknowledgement within 2 days`}>
              The law requires an acknowledgement within 7 days of the report.
            </InlineAlert>
          )}
          {active.length === 0 ? (
            <EmptyState title="No open cases." description="You will get an email when a case is routed to the committee." />
          ) : (
            <Card>
              <ul className="yx-ps-list">
                {cases.map((x) => (
                  <li key={x.ref}>
                    <div className="yx-ps-list__main">
                      <span className="yx-ps-list__title">
                        <span className="yx-ps-mono">{x.ref}</span> · {x.category}
                      </span>
                      <span className="yx-ps-list__meta">
                        {x.severity} · received {formatDate(x.receivedOn)} · feedback due {formatDate(x.feedbackDue)}
                        {x.retaliation ? ' · retaliation flagged' : ''}
                      </span>
                    </div>
                    <Badge tone={x.status === 'Closed' ? 'neutral' : x.status === 'Outcome ready' ? 'info' : x.status === 'Awaiting acknowledgement' ? 'warning' : 'neutral'}>{x.status}</Badge>
                    {x.status === 'Awaiting acknowledgement' ? (
                      <Button size="sm">Acknowledge</Button>
                    ) : (
                      <Button size="sm" onClick={() => setOpen(x.ref)}>
                        Open
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </TenantPortal>
  );
}

/* ================================================================== */
/* T9-07 Anonymous reporter case page                                  */
/* ================================================================== */

export interface AnonMessage {
  id: string;
  from: 'me' | 'desk';
  at: Date;
  text: string;
}

export type AnonStage = 'enter-code' | 'code-shown' | 'case' | 'wrong-code' | 'closed';

// T9-07
/** No login: the case access code is shown once at filing; status and two-way messages with it (YX-CASE-11). */
export function AnonymousCaseScreen({
  tenant,
  accent,
  stage: initial,
  caseInfo,
}: {
  tenant: string;
  accent?: string;
  stage: AnonStage;
  caseInfo: { ref: string; code: string; category: string; filedOn: Date; status: string; messages: AnonMessage[] };
}) {
  const [stage, setStage] = useState(initial);
  const [code, setCode] = useState(initial === 'wrong-code' ? 'K7QM-4TZ8-XR2P-9HDV' : '');
  const [saved, setSaved] = useState(false);
  const [reply, setReply] = useState('');
  const [messages, setMessages] = useState(caseInfo.messages);
  return (
    <TenantPortal
      tenant={tenant}
      portal="Speak up · anonymous report"
      accent={accent}
      narrow
      access={{ kind: 'access-code' }}
      footer={{ privacy: 'Anonymous reporter notice (G-10)', cookies: true }}
    >
      {stage === 'code-shown' && (
        <div className="yx-ps-stack">
          <InlineAlert tone="success" title="Your report was sent">
            Reference {caseInfo.ref}. The ethics desk will reply here, usually within 7 days.
          </InlineAlert>
          <Card title="Save your access code now">
            <div className="yx-ps-stack yx-ps-center">
              <p className="yx-ps-p">This is the only way back to your report. We show it once and we cannot recover it; we don't know who you are.</p>
              <span className="yx-ps-kbd-code">{caseInfo.code}</span>
              <div className="yx-ps-row">
                <Button icon={Download}>Download as text file</Button>
                <Button>Copy code</Button>
              </div>
              <Checkbox checked={saved} onChange={setSaved} label="I have saved my access code" />
              <Button variant="primary" disabled={!saved} onClick={() => setStage('case')}>
                Go to my report
              </Button>
            </div>
          </Card>
        </div>
      )}
      {(stage === 'enter-code' || stage === 'wrong-code') && (
        <div className="yx-signin">
          <div className="yx-signin__head">
            <h2 className="yx-signin__title">Check your anonymous report</h2>
            <p className="yx-signin__intro">Enter the 16-character access code you saved when you filed the report.</p>
          </div>
          <FormField label="Access code" required error={stage === 'wrong-code' ? "That code didn't match a report. Check each character; after 5 wrong tries you'll need to wait 15 minutes." : null}>
            <TextField value={code} onChange={(v) => setCode(formatAccessCode(v))} className="yx-ps-mono" placeholder="XXXX-XXXX-XXXX-XXXX" autoComplete="off" />
          </FormField>
          <Button variant="primary" fullWidth disabled={!isCompleteAccessCode(code)} onClick={() => setStage(code === caseInfo.code ? 'case' : 'wrong-code')}>
            Open report
          </Button>
          <p className="yx-signin__fine">
            Lost your code? It can't be recovered. <Link href="#">File a follow-up report</Link> and mention your earlier report's month and topic so the desk can link them.
          </p>
        </div>
      )}
      {(stage === 'case' || stage === 'closed') && (
        <div className="yx-ps-stack">
          <section className="yx-ps-hero">
            <h1>
              Report <span className="yx-ps-mono">{caseInfo.ref}</span>
            </h1>
            <p>
              {caseInfo.category} · filed {formatDate(caseInfo.filedOn)}
            </p>
          </section>
          <div className="yx-ps-row">
            <span>Status</span>
            <Badge tone={stage === 'closed' ? 'neutral' : 'info'}>{stage === 'closed' ? 'Closed' : caseInfo.status}</Badge>
          </div>
          <div className="yx-ps-chatlog" aria-live="polite" aria-label="Messages">
            {messages.map((m) => (
              <div key={m.id} className="yx-ps-bubble" data-from={m.from}>
                <span className="yx-ps-bubble__meta">
                  {m.from === 'me' ? 'You' : 'Ethics desk'} · {formatDate(m.at)}
                </span>
                <span>{m.text}</span>
              </div>
            ))}
          </div>
          {stage === 'closed' ? (
            <InlineAlert tone="info" title="This report is closed">
              The desk closed it on 28 Sep 2026 after corrective action. You can no longer send messages. File a new report if the issue comes back.
            </InlineAlert>
          ) : (
            <Card
              title="Reply to the ethics desk"
              footer={
                <Button
                  variant="primary"
                  icon={Send}
                  disabled={!reply.trim()}
                  onClick={() => {
                    setMessages((xs) => [...xs, { id: `m${xs.length + 1}`, from: 'me', at: caseInfo.filedOn, text: reply }]);
                    setReply('');
                  }}
                >
                  Send reply
                </Button>
              }
            >
              <FormField label="Your reply" hideLabel helper="Don't include your name or anything that identifies you unless you choose to.">
                <TextArea value={reply} onChange={setReply} rows={3} />
              </FormField>
            </Card>
          )}
        </div>
      )}
    </TenantPortal>
  );
}

/* ================================================================== */
/* T9-08 Public verify page                                            */
/* ================================================================== */

// T9-08
/** Public verify page: only company, letter type, name, issue date and current / superseded (P05 Q5). */
export function VerifyPageScreen({ tenant, accent, docs, code: initialCode }: { tenant: string; accent?: string; docs: VerifiableDoc[]; code: string }) {
  const [input, setInput] = useState(initialCode);
  const [code, setCode] = useState(initialCode);
  const result = useMemo(() => verifyDocument(code, docs), [code, docs]);
  return (
    <TenantPortal tenant={tenant} portal="Verify a document" accent={accent} narrow access={{ kind: 'public' }} footer={{ privacy: 'Privacy notice (G-05)', cookies: true }}>
      <section className="yx-ps-hero">
        <h1>Verify a letter or certificate</h1>
        <p>Scan the QR code on the document, or type the verification code printed under it.</p>
      </section>
      <div className="yx-ps-row">
        <FormField label="Verification code">
          <TextField value={input} onChange={setInput} className="yx-ps-mono" placeholder="KF-VRF-XXXX-XXXX" />
        </FormField>
      </div>
      <div className="yx-ps-row">
        <Button variant="primary" onClick={() => setCode(input)}>
          Verify
        </Button>
      </div>
      {code &&
        (result.state === 'not-found' ? (
          <InlineAlert tone="danger" title="We couldn't verify this code">
            No current or past document from {tenant} has this code. Check the code, or ask the person to request a fresh copy from {tenant}.
          </InlineAlert>
        ) : (
          <Card
            title={result.state === 'current' ? 'This document is genuine and current' : 'This document was replaced by a newer version'}
            actions={<Badge tone={result.state === 'current' ? 'success' : 'warning'}>{result.state === 'current' ? 'Current' : 'Superseded'}</Badge>}
          >
            <div className="yx-ps-pass">
              <QrCode value={result.doc.code} size={120} label={`QR code for ${result.doc.code}`} />
              <DescriptionList
                items={[
                  { label: 'Company', value: result.doc.company },
                  { label: 'Document', value: result.doc.type },
                  { label: 'Issued to', value: result.doc.name },
                  { label: 'Issued on', value: formatDate(result.doc.issuedOn) },
                  ...(result.doc.supersededOn ? [{ label: 'Replaced on', value: formatDate(result.doc.supersededOn) }] : []),
                  { label: 'Code', value: result.doc.code, mono: true },
                ]}
              />
            </div>
            <p className="yx-ps-muted">For privacy we show only these details. Salary and other contents are never shown here.</p>
          </Card>
        ))}
    </TenantPortal>
  );
}

/* ================================================================== */
/* Shared portal consent step (BGV) used on T9-01                      */
/* ================================================================== */

/** Background verification consent (BGV starts after offer acceptance, with consent; M01). */
export function BgvConsentStep() {
  return (
    <ConsentPanel
      title="Background verification consent"
      summary={
        <>
          <p>Kaveri Foods uses Sathya Verify Services to check your identity, address, education and last two employers.</p>
          <p>A mismatch only raises a flag for HR to discuss with you; it never withdraws your offer on its own.</p>
        </>
      }
      purposes={[
        { id: 'id', label: 'Identity and address check', required: true },
        { id: 'edu', label: 'Education check with your university', required: true },
        { id: 'emp', label: 'Employment check with your last two employers', required: true, description: 'We contact them only after you join if you ask us to wait.' },
        { id: 'crim', label: 'Court records search', description: 'Needed only for roles handling cash or stock.' },
      ]}
      noticeLabel="background verification notice"
      noticeVersion="BGV-2026.2"
      acceptLabel="Give consent"
    />
  );
}
