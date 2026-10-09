import { useState } from 'react';
import { Button } from '../../../components/button';
import { Badge, type BadgeTone } from '../../../components/display';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { TextField } from '../../../components/inputs';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import { IrreversibleSheet } from '../pay-kit';
import { monthText } from './periods';
import type { Confirmation, ExchangeFile, ExchangeFiles, LoadState, PayDocument, PayDocuments, VerifyResult } from './types';

// Pay documents (P05, PAY-1.09 / 1.10) and exchange files (PAY-1.11): issued documents never change (a correction
// supersedes them), each has a reference without gaps, a SHA-256 and a public verify code; files carry their hash, rows
// and totals, download through a single-use link and are released by a second person.

const DOC_STATUS: Record<PayDocument['status'], { label: string; tone: BadgeTone }> = {
  issued: { label: 'Issued', tone: 'success' },
  superseded: { label: 'Superseded', tone: 'neutral' },
  awaiting_signature: {
    label: 'Waiting for the company signature',
    tone: 'warning',
  },
};
const FILE_STATUS: Record<ExchangeFile['status'], { label: string; tone: BadgeTone }> = {
  generated: { label: 'Waiting for release', tone: 'info' },
  release_pending: { label: 'Release asked', tone: 'info' },
  released: { label: 'Released', tone: 'success' },
  superseded: { label: 'Replaced', tone: 'neutral' },
};
const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;
const rupees = (v: string) => {
  const [i, f = '00'] = v.split('.');
  const head = i.slice(0, -3);
  return `₹${head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},` : ''}${i.slice(-3)}.${f.padEnd(2, '0')}`;
};

// ------------------------------------------------------------------------------------------ documents

export interface PayDocumentsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: PayDocuments | null;
  entityId: string | null;
  onEntity: (id: string | null) => void;
  onDownload: (doc: PayDocument) => Promise<unknown>;
  verifyUrl: (code: string) => string;
}

export function PayDocumentsScreen(p: PayDocumentsScreenProps) {
  const d = p.data;
  const { busy, error, run } = useRun();
  return (
    <LivePage
      title="Pay documents"
      description="Payslips, letters and advices as issued. An issued document never changes; a correction issues a new one that supersedes it. Every view of someone else's document is recorded."
      state={p.state}
      onRetry={p.onRetry}
      what="pay documents"
      grantedBy="your payroll admin"
    >
      {d && (
        <>
          <FormField id="pd-entity" label="Legal entity">
            <Select value={p.entityId} onChange={p.onEntity} clearable placeholder="All in your scope" options={d.entities.map((e) => ({ value: e.id, label: e.name }))} />
          </FormField>
          {error && (
            <InlineAlert tone="danger" title="Not downloaded">
              {error}
            </InlineAlert>
          )}
          <Card title="Documents">
            {d.documents.length ? (
              <DocTable docs={d.documents} showPerson busy={busy} onDownload={(x) => void run(x.id, () => p.onDownload(x))} verifyUrl={p.verifyUrl} />
            ) : (
              <EmptyState compact title="No documents yet" description="Payslips appear here when payroll issues them." />
            )}
          </Card>
        </>
      )}
    </LivePage>
  );
}

function DocTable({ docs, showPerson, busy, onDownload, verifyUrl }: { docs: PayDocument[]; showPerson?: boolean; busy: string | null; onDownload: (d: PayDocument) => void; verifyUrl: (code: string) => string }) {
  return (
    <table className="yx-tim-table" aria-label="Pay documents">
      <thead>
        <tr>
          {showPerson && <th scope="col">Person</th>}
          <th scope="col">Document</th>
          <th scope="col">Reference</th>
          <th scope="col">Issued</th>
          <th scope="col">Status</th>
          <th scope="col">Check it</th>
          <th scope="col">
            <span className="yx-visually-hidden">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {docs.map((x) => (
          <tr key={x.id}>
            {showPerson && <td>{x.person}</td>}
            <th scope="row">{x.title}</th>
            <td className="yx-tim-note">{x.referenceNo}</td>
            <td>{dateText(x.issuedAt.slice(0, 10))}</td>
            <td>
              <Badge tone={DOC_STATUS[x.status].tone}>{DOC_STATUS[x.status].label}</Badge>
            </td>
            <td className="yx-tim-note">
              {x.verifyCode ? (
                <a href={verifyUrl(x.verifyCode)} target="_blank" rel="noreferrer">
                  {x.verifyCode}
                </a>
              ) : (
                ''
              )}
            </td>
            <td>
              {x.purged ? (
                <span className="yx-tim-note">Deleted after its retention period</span>
              ) : (
                <Button size="sm" loading={busy === x.id} onClick={() => onDownload(x)}>
                  Download PDF
                </Button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface MyPayDocumentsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: PayDocument[] | null;
  onDownload: (doc: PayDocument) => Promise<unknown>;
  verifyUrl: (code: string) => string;
  title?: string;
}

/** Me › Pay documents, and the alumni / nominee portal's list. */
export function MyPayDocumentsScreen(p: MyPayDocumentsScreenProps) {
  const { busy, error, run } = useRun();
  return (
    <LivePage title={p.title ?? 'My pay documents'} description="Your payslips and letters as issued. Anyone you give one to can check it with its code." state={p.state} onRetry={p.onRetry} what="your pay documents">
      {error && (
        <InlineAlert tone="danger" title="Not downloaded">
          {error}
        </InlineAlert>
      )}
      {p.data && (p.data.length ? <DocTable docs={p.data} busy={busy} onDownload={(x) => void run(x.id, () => p.onDownload(x))} verifyUrl={p.verifyUrl} /> : <EmptyState compact title="No pay documents yet" />)}
    </LivePage>
  );
}

// ------------------------------------------------------------------------------------------ exchange files

export interface ExchangeFilesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: ExchangeFiles | null;
  me: string;
  onDownload: (file: ExchangeFile) => Promise<unknown>;
  onRelease: (file: ExchangeFile, confirmation: Confirmation) => Promise<unknown>;
}

export function ExchangeFilesScreen(p: ExchangeFilesScreenProps) {
  const d = p.data;
  const [releasing, setReleasing] = useState<ExchangeFile | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const { busy, error, run, clearError } = useRun();
  const entity = (id: string) => d?.entities.find((e) => e.id === id)?.name ?? '';
  return (
    <LivePage
      title="Payroll files"
      description="Bank, statutory and accounting files as generated, with their hash, rows and totals. They never change. Someone other than the person who made a file releases it."
      state={p.state}
      onRetry={p.onRetry}
      what="payroll files"
      grantedBy="your payroll admin"
    >
      {done && (
        <InlineAlert tone="success" title="Released">
          {done}
        </InlineAlert>
      )}
      {error && !releasing && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      {d &&
        (d.files.length ? (
          <Card title="Files">
            <table className="yx-tim-table" aria-label="Payroll files">
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col">Legal entity</th>
                  <th scope="col">Month</th>
                  <th scope="col">Rows</th>
                  <th scope="col">Total</th>
                  <th scope="col">SHA-256</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="yx-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.files.map((f) => (
                  <tr key={f.id}>
                    <th scope="row">
                      {f.kindLabel}
                      <div className="yx-tim-note">
                        {f.fileName} · made by {f.generatedBy}
                        {f.releasedBy ? ` · released by ${f.releasedBy}` : ''}
                      </div>
                    </th>
                    <td>{entity(f.legalEntityId)}</td>
                    <td>{f.month ? monthText(f.month) : ''}</td>
                    <td>{f.rows}</td>
                    <td>{f.totals.amount ? rupees(f.totals.amount) : ''}</td>
                    <td className="yx-tim-note" title={f.sha256}>
                      {short(f.sha256)}
                    </td>
                    <td>
                      <Badge tone={FILE_STATUS[f.status].tone}>{FILE_STATUS[f.status].label}</Badge>
                    </td>
                    <td>
                      <div className="yx-tim-row">
                        <Button size="sm" loading={busy === f.id} onClick={() => void run(f.id, () => p.onDownload(f))}>
                          Download
                        </Button>
                        {f.canRelease && (
                          <Button size="sm" variant="primary" onClick={() => setReleasing(f)}>
                            Release
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <EmptyState title="No payroll files yet" description="Bank and statutory files appear here when payroll generates them." />
        ))}
      {releasing && (
        <IrreversibleSheet
          open
          onOpenChange={(o) => {
            if (!o) {
              setReleasing(null);
              clearError();
            }
          }}
          title={`Release ${releasing.kindLabel.toLowerCase()}`}
          subtitle={releasing.fileName}
          impact={[
            { label: 'Rows', value: String(releasing.rows) },
            {
              label: 'Total',
              value: releasing.totals.amount ? rupees(releasing.totals.amount) : '—',
            },
            { label: 'SHA-256', value: short(releasing.sha256) },
            { label: 'Made by', value: releasing.generatedBy },
          ]}
          cannotUndo="A released file is final: the month can no longer be reopened."
          correction="A mistake found later is paid as a correction in the next payroll."
          phrase={`RELEASE ${releasing.rows}`}
          maker={releasing.generatedBy}
          checker={p.me}
          confirmLabel="Release the file"
          confirmVariant="primary"
          error={error}
          onConfirm={() =>
            void run('release', async () => {
              const f = releasing;
              await p.onRelease(f, {
                phrase: `RELEASE ${f.rows}`,
                impact: [
                  { label: 'Rows', value: String(f.rows) },
                  { label: 'Total', value: f.totals.amount ?? '' },
                  { label: 'SHA-256', value: f.sha256 },
                ],
              });
              setReleasing(null);
              setDone(`${f.fileName} is released.`);
            })
          }
        />
      )}
    </LivePage>
  );
}

// ------------------------------------------------------------------------------------------ public verify and the alumni portal

export interface VerifyDocumentScreenProps {
  code: string;
  onCode: (code: string) => void;
  onCheck: (code: string) => Promise<VerifyResult>;
}

/** The public page behind a document's code (YX-DOC-11): company, kind, name, date and whether it is current. */
export function VerifyDocumentScreen(p: VerifyDocumentScreenProps) {
  const [result, setResult] = useState<VerifyResult | null>(null);
  const { busy, error, run } = useRun();
  const errors = /^[A-Za-z2-9]{10}$/.test(p.code.trim())
    ? []
    : [
        {
          fieldId: 'vf-code',
          message: 'Enter the 10-letter code printed on the document.',
        },
      ];
  const save = useSaveErrors(errors);
  return (
    <div className="yx-auth__page yx-tim-live">
      <Card title="Check a YukthiX document">
        <form
          className="yx-tim-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (errors.length) return save.reveal();
            void run('check', async () => setResult(await p.onCheck(p.code.trim().toUpperCase())));
          }}
        >
          <ErrorSummary errors={save.shownErrors} />
          <FormField id="vf-code" label="Code on the document" required error={save.errorOf('vf-code')}>
            <TextField value={p.code} onChange={p.onCode} autoComplete="off" spellCheck={false} />
          </FormField>
          <Button type="submit" variant="primary" loading={busy === 'check'}>
            Check
          </Button>
          {error && (
            <InlineAlert tone="danger" title="Not found">
              {error}
            </InlineAlert>
          )}
          {result && (
            <InlineAlert tone={result.status === 'current' ? 'success' : 'warning'} title={result.status === 'current' ? 'This document is genuine and current' : 'This document was replaced by a corrected one'}>
              {result.kind} for {result.name}, issued by {result.company} on {dateText(result.issuedOn)}.
            </InlineAlert>
          )}
        </form>
      </Card>
    </div>
  );
}

export interface PayPortalSignInProps {
  company: string;
  onSendCode: (email: string) => Promise<unknown>;
  onVerify: (email: string, code: string) => Promise<unknown>;
}

/** Former employees and nominees sign in with a one-time code by email (YX-DOC-16 / 19). */
export function PayPortalSignIn(p: PayPortalSignInProps) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useRun();
  const errors = [
    ...(!/^\S+@\S+\.\S+$/.test(email.trim())
      ? [
          {
            fieldId: 'pp-email',
            message: 'Enter the email address the company has for you.',
          },
        ]
      : []),
    ...(sent && !/^\d{6}$/.test(code.trim())
      ? [
          {
            fieldId: 'pp-code',
            message: 'Enter the 6-digit code from the email.',
          },
        ]
      : []),
  ];
  const save = useSaveErrors(errors);
  return (
    <div className="yx-auth__page yx-tim-live">
      <Card title={`${p.company}: your pay documents`}>
        <form
          className="yx-tim-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (errors.length) return save.reveal();
            void run('go', async () => {
              if (!sent) {
                await p.onSendCode(email.trim());
                setSent(true);
              } else await p.onVerify(email.trim(), code.trim());
            });
          }}
        >
          <p className="yx-tim-muted">For people who have left, for 7 years, and for nominees HR has added. Read only.</p>
          <ErrorSummary errors={save.shownErrors} />
          <FormField id="pp-email" label="Email" required error={save.errorOf('pp-email')}>
            <TextField type="email" value={email} onChange={setEmail} autoComplete="email" disabled={sent} />
          </FormField>
          {sent && (
            <>
              <InlineAlert tone="info" title="Check your email">
                If this email may sign in, a code is on its way. It works for 5 minutes.
              </InlineAlert>
              <FormField id="pp-code" label="Code" required error={save.errorOf('pp-code')}>
                <TextField value={code} onChange={setCode} inputMode="numeric" autoComplete="one-time-code" />
              </FormField>
            </>
          )}
          {error && (
            <InlineAlert tone="danger" title="Not signed in">
              {error}
            </InlineAlert>
          )}
          <Button type="submit" variant="primary" loading={busy === 'go'}>
            {sent ? 'Sign in' : 'Send me a code'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
