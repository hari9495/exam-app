import { useState, type ReactNode } from 'react';
import { Button } from '../../../components/button';
import { Badge, type BadgeTone } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors, type FormErrorItem } from '../../../components/field';
import { TextArea, TextField } from '../../../components/inputs';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import { IrreversibleSheet } from '../pay-kit';
import { FileButton } from './compliance';
import { PersonPicker, type PersonHit } from './inputs';
import { monthText } from './periods';
import { ReasonDrawer, rupees } from './runs';
import { EntityPicker } from './setup';
import type { Confirmation, LoadState } from './types';
import type { SetupEntity } from './types-5b';
import type {
  AdvisoryView,
  CertificateRow,
  DeclarationInput,
  DeclarationLine,
  LoanChangeInput,
  LoanRequestInput,
  LoanView,
  MyCertificate,
  MyDeclarations,
  PartAImport,
  ProofDecision,
  ProofQueueLine,
  RegisterRow,
} from './types-ops';
const MONTH = /^\d{4}-\d{2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function Failed({ error }: { error: string | null }) {
  return error ? (
    <InlineAlert tone="danger" title="This didn't go through">
      {error}
    </InlineAlert>
  ) : null;
}

/** A drawer with a form: errors show only after Save is pressed (no red while typing). */
export function FormDrawer({ title, subtitle, confirm, errors, onClose, onSave, children }: { title: string; subtitle?: string; confirm: string; errors: FormErrorItem[]; onClose: () => void; onSave: () => Promise<unknown>; children: (errorOf: (id: string) => string | undefined) => ReactNode }) {
  const { busy, error, run } = useRun();
  const save = useSaveErrors(errors);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      subtitle={subtitle}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={() => {
              if (errors.length) {
                save.reveal();
                // Founder rule: the first bad field takes focus (after the error summary's own focus on show).
                return void setTimeout(() => document.getElementById(errors[0].fieldId)?.focus());
              }
              void run('save', async () => {
                await onSave();
                onClose();
              });
            }}
          >
            {confirm}
          </Button>
        </>
      }
    >
      <div className="yx-tim-form">
        <ErrorSummary errors={save.shownErrors} />
        <Failed error={error} />
        {children(save.errorOf)}
      </div>
    </Drawer>
  );
}

/** Asks before a step that cannot be undone and has nothing to type (freezing a register). */
function ConfirmDrawer({ title, children, confirm, onClose, onConfirm }: { title: string; children: ReactNode; confirm: string; onClose: () => void; onConfirm: () => Promise<unknown> }) {
  const { busy, error, run } = useRun();
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy === 'go'} onClick={() => void run('go', async () => (await onConfirm(), onClose()))}>
            {confirm}
          </Button>
        </>
      }
    >
      <div className="yx-tim-stack">
        <Failed error={error} />
        {children}
      </div>
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ registers (CMP-09) and advisories (CMP-12)

const REGISTER: Record<string, { label: string; tone: BadgeTone }> = {
  generated: { label: 'Made', tone: 'info' },
  frozen: { label: 'Frozen', tone: 'warning' },
  signed: { label: 'Signed', tone: 'success' },
  superseded: { label: 'Replaced', tone: 'neutral' },
};
const registerName = (key: string) => key.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export interface RegistersScreenProps {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  month: string;
  onMonth: (m: string) => void;
  registers: RegisterRow[] | null;
  can: { generate: boolean; sign: boolean; download: boolean };
  onGenerate: (reason?: string) => Promise<unknown>;
  onDownload: (r: RegisterRow) => Promise<unknown>;
  onFreeze: (r: RegisterRow) => Promise<unknown>;
  onSign: (r: RegisterRow, file: File) => Promise<unknown>;
  onPack: () => Promise<unknown>;
}

/** The month's statutory registers: made once payroll is approved, frozen, signed with the company's token, packed for an inspector. */
export function RegistersScreen(p: RegistersScreenProps) {
  const [remaking, setRemaking] = useState(false);
  const [freezing, setFreezing] = useState<RegisterRow | null>(null);
  const { busy, error, run } = useRun();
  const latest = (p.registers ?? []).filter((r, i, all) => all.findIndex((x) => x.registerType === r.registerType && x.locationId === r.locationId) === i);
  return (
    <LivePage title="Statutory registers" description="Wage, deduction and other registers for a month, made from approved payroll. A frozen register never changes; a fix is a new version." state={p.state} onRetry={p.onRetry} what="registers" grantedBy="your compliance owner">
      <div className="yx-tim-row">
        <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} id="rg-entity" />
        <FormField id="rg-month" label="Month">
          <TextField type="month" value={p.month} onChange={(m) => MONTH.test(m) && p.onMonth(m)} />
        </FormField>
      </div>
      <Failed error={error} />
      {!p.entityId && <EmptyState title="Choose a legal entity" description="Registers are kept for each legal entity and month." compact />}
      {p.entityId && p.registers && (
        <>
          <div className="yx-tim-row">
            {p.can.generate && (
              <Button variant="primary" loading={busy === 'make'} onClick={() => (latest.length ? setRemaking(true) : void run('make', () => p.onGenerate()))}>
                {latest.length ? 'Make a new version' : 'Make registers'}
              </Button>
            )}
            {p.can.sign && latest.some((r) => r.status !== 'generated') && (
              <Button loading={busy === 'pack'} onClick={() => void run('pack', p.onPack)}>
                Make inspection pack
              </Button>
            )}
          </div>
          {!latest.length ? (
            <EmptyState title={`No registers for ${monthText(p.month)}`} description="Make them once every payroll of the month is approved." compact />
          ) : (
            <table className="yx-tim-table" aria-label="Registers">
              <thead>
                <tr>
                  <th scope="col">Register</th>
                  <th scope="col">Version</th>
                  <th scope="col">Rows</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="yx-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {latest.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">{registerName(r.registerType)}</th>
                    <td>v{r.version}</td>
                    <td>{r.rows}</td>
                    <td>
                      <Badge tone={REGISTER[r.status]?.tone ?? 'neutral'}>{REGISTER[r.status]?.label ?? r.status}</Badge>
                    </td>
                    <td>
                      <div className="yx-tim-row">
                        {p.can.download && (
                          <Button size="sm" loading={busy === `d-${r.id}`} onClick={() => void run(`d-${r.id}`, () => p.onDownload(r))} aria-label={`Download the ${registerName(r.registerType)} register`}>
                            Download
                          </Button>
                        )}
                        {p.can.sign && r.status === 'generated' && (
                          <Button size="sm" onClick={() => setFreezing(r)} aria-label={`Freeze the ${registerName(r.registerType)} register`}>
                            Freeze
                          </Button>
                        )}
                        {p.can.sign && r.status === 'frozen' && (
                          <FileButton label="Upload signed PDF" accept=".pdf,application/pdf" ariaLabel={`Upload the signed ${registerName(r.registerType)} register`} loading={busy === `s-${r.id}`} onFile={(f) => void run(`s-${r.id}`, () => p.onSign(r, f))} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {remaking && <ReasonDrawer title="Make a new version?" subtitle="The earlier version stays as it is; the new one replaces it for signing." label="Why" confirm="Make new version" onClose={() => setRemaking(false)} onSave={(why) => p.onGenerate(why)} />}
      {freezing && (
        <ConfirmDrawer title={`Freeze the ${registerName(freezing.registerType)} register?`} confirm="Freeze" onClose={() => setFreezing(null)} onConfirm={() => p.onFreeze(freezing)}>
          <p>A frozen register never changes again. Download it, sign it with the company&apos;s token, and upload the signed PDF.</p>
        </ConfirmDrawer>
      )}
    </LivePage>
  );
}

export interface AdvisoriesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  advisories: AdvisoryView[] | null;
  onReview: (a: AdvisoryView, note: string) => Promise<unknown>;
}

/** Changes in labour and tax law that apply to the entity's states, each marked reviewed with what was done. */
export function AdvisoriesScreen(p: AdvisoriesScreenProps) {
  const [reviewing, setReviewing] = useState<AdvisoryView | null>(null);
  return (
    <LivePage title="Compliance advisories" description="Law changes that apply where this legal entity has people. Read each one, act on it, and mark it reviewed with what you did." state={p.state} onRetry={p.onRetry} what="advisories" grantedBy="your compliance owner">
      <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} id="ad-entity" />
      {!p.entityId && <EmptyState title="Choose a legal entity" description="Advisories follow the states the entity has people in." compact />}
      {p.entityId && p.advisories && !p.advisories.length && <EmptyState title="No advisories" description="Nothing new applies to this legal entity." compact />}
      {p.entityId &&
        p.advisories?.map((a) => (
          <Card key={`${a.code}-${a.version}`} title={a.title} actions={<>{a.reviewed ? <Badge tone="success">Reviewed</Badge> : <Badge tone="warning">To review</Badge>} {a.verify && <Badge tone="info">Check the source</Badge>}</>}>
            <p className="yx-tim-note">
              {a.jurisdiction === 'IN' ? 'All India' : a.jurisdiction} · from {dateText(a.effectiveFrom)}
            </p>
            <p>{a.summary}</p>
            <p>
              <strong>What to do:</strong> {a.action}
            </p>
            {a.link && /^https:\/\//i.test(a.link) && (
              <p>
                <a href={a.link} target="_blank" rel="noopener noreferrer">
                  Read the source
                </a>
              </p>
            )}
            {a.reviewed ? (
              <p className="yx-tim-note">
                Reviewed {dateText(a.reviewed.at.slice(0, 10))}: {a.reviewed.note}
              </p>
            ) : (
              <Button onClick={() => setReviewing(a)} aria-label={`Mark "${a.title}" reviewed`}>
                Mark reviewed
              </Button>
            )}
          </Card>
        ))}
      {reviewing && <ReasonDrawer title="Mark reviewed" subtitle={reviewing.title} label="What you did" confirm="Mark reviewed" onClose={() => setReviewing(null)} onSave={(note) => p.onReview(reviewing, note)} />}
    </LivePage>
  );
}

// ------------------------------------------------------------------------------------------ Part A and certificates (PAY-5.08, CMP-07)

const taxYears = () => {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return [y - 2, y - 1, y].map((s) => `${s}-${String((s + 1) % 100).padStart(2, '0')}`);
};
const formText = (f: string) => (f === 'form130' ? 'Form 130' : 'Form 16');

export interface TaxCertificatesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  taxYear: string;
  onTaxYear: (y: string) => void;
  certificates: CertificateRow[] | null;
  nameOf: (employeeId: string) => string;
  can: { importZip: boolean; issueAll: boolean };
  onImportZip: (file: File) => Promise<PartAImport>;
  onPartA: (c: CertificateRow, file: File) => Promise<unknown>;
  onIssue: (c: CertificateRow, confirmation: Confirmation) => Promise<unknown>;
  onIssueAll: (confirmation: Confirmation) => Promise<{ issued: number; failed: { id: string; reason: string }[] }>;
}

/** Year-end certificates: Part A from TRACES (one ZIP for everyone, or one PDF), then Part B issued with Part A. */
export function TaxCertificatesScreen(p: TaxCertificatesScreenProps) {
  const [imported, setImported] = useState<PartAImport | null>(null);
  const [issuing, setIssuing] = useState<CertificateRow | 'all' | null>(null);
  const [issuedAll, setIssuedAll] = useState<{ issued: number; failed: { id: string; reason: string }[] } | null>(null);
  const { busy, error, run } = useRun();
  const ready = (p.certificates ?? []).filter((c) => c.partA && !c.issued);
  const form = (p.certificates ?? [])[0]?.form ?? (Number(p.taxYear.slice(0, 4)) >= 2026 ? 'form130' : 'form16');
  const phrase = `ISSUE ${form.toUpperCase()} ${p.taxYear}`;
  return (
    <LivePage title="Tax certificates" description="Part A comes from TRACES; Part B is worked out from the year's payroll. Issued certificates reach employees in My pay documents." state={p.state} onRetry={p.onRetry} what="tax certificates" grantedBy="your payroll admin">
      <div className="yx-tim-row">
        <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} id="tc-entity" />
        <FormField id="tc-year" label="Tax year">
          <Segment label="Tax year" value={p.taxYear} onChange={p.onTaxYear} options={taxYears().map((y) => ({ value: y, label: y }))} />
        </FormField>
      </div>
      <Failed error={error} />
      {!p.entityId && <EmptyState title="Choose a legal entity" description="Certificates are issued by each legal entity (its TAN)." compact />}
      {p.entityId && p.certificates && (
        <>
          <div className="yx-tim-row">
            {p.can.importZip && <FileButton label="Upload Part A ZIP from TRACES" accept=".zip,application/zip" ariaLabel="Upload the Part A ZIP downloaded from TRACES" loading={busy === 'zip'} onFile={(f) => void run('zip', async () => setImported(await p.onImportZip(f)))} />}
            {p.can.issueAll && ready.length > 0 && (
              <Button variant="primary" onClick={() => setIssuing('all')}>
                Issue {ready.length} ready
              </Button>
            )}
          </div>
          {imported && (
            <InlineAlert tone={imported.unmatched.length ? 'warning' : 'success'} title={`${imported.matched} of ${imported.files} Part A files matched`}>
              {imported.unmatched.length > 0 && (
                <ul className="yx-tim-list">
                  {imported.unmatched.slice(0, 20).map((u) => (
                    <li key={u}>{u}</li>
                  ))}
                </ul>
              )}
            </InlineAlert>
          )}
          {issuedAll && (
            <InlineAlert tone={issuedAll.failed.length ? 'warning' : 'success'} title={`${issuedAll.issued} issued`}>
              {issuedAll.failed.length > 0 && `${issuedAll.failed.length} could not be issued: ${issuedAll.failed[0].reason}`}
            </InlineAlert>
          )}
          {!p.certificates.length ? (
            <EmptyState title="No certificates yet" description="Upload the Part A ZIP from TRACES; each file is matched to the person by PAN." compact />
          ) : (
            <table className="yx-tim-table" aria-label="Tax certificates">
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Form</th>
                  <th scope="col">Part A</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="yx-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.certificates.map((c) => (
                  <tr key={c.id}>
                    <th scope="row">{p.nameOf(c.employeeId)}</th>
                    <td>{formText(c.form)}</td>
                    <td>{c.partA ? <Badge tone="success">Attached</Badge> : <Badge tone="warning">Missing</Badge>}</td>
                    <td>{c.issued ? <Badge tone="success">Issued</Badge> : <Badge tone="neutral">Not issued</Badge>}</td>
                    <td>
                      {!c.issued && (
                        <div className="yx-tim-row">
                          <FileButton label={c.partA ? 'Replace Part A' : 'Attach Part A'} accept=".pdf,application/pdf" ariaLabel={`Attach Part A for ${p.nameOf(c.employeeId)}`} loading={busy === `a-${c.id}`} onFile={(f) => void run(`a-${c.id}`, () => p.onPartA(c, f))} />
                          {c.partA && (
                            <Button size="sm" onClick={() => setIssuing(c)} aria-label={`Issue the certificate of ${p.nameOf(c.employeeId)}`}>
                              Issue
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {issuing && (
        <IrreversibleSheet
          open
          onOpenChange={(o) => !o && setIssuing(null)}
          title={issuing === 'all' ? `Issue ${ready.length} certificates for ${p.taxYear}` : `Issue ${p.nameOf(issuing.employeeId)}'s certificate`}
          impact={[
            { label: 'Form', value: formText(form) },
            { label: 'Tax year', value: p.taxYear },
            { label: 'People', value: issuing === 'all' ? String(ready.length) : '1' },
          ]}
          cannotUndo="An issued certificate is published to the employee and never changes."
          correction="A correction return issues a revised certificate that supersedes it."
          phrase={phrase}
          maker="preparer"
          checker="you"
          confirmLabel="Issue"
          confirmVariant="primary"
          error={error}
          onConfirm={() =>
            void run('issue', async () => {
              const confirmation = { phrase, impact: [{ label: 'Tax year', value: p.taxYear }] };
              if (issuing === 'all') setIssuedAll(await p.onIssueAll(confirmation));
              else await p.onIssue(issuing, confirmation);
              setIssuing(null);
            })
          }
        />
      )}
    </LivePage>
  );
}
