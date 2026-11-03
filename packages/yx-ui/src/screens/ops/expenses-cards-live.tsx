// EXP-08 card statement import and matching: the designed screen with real data (founder answer 3 Nov 2026, option A).
// The design's parts are reused (OpsDesk, PageHeader, the import Stepper, Facts, the card-lines table, the phone tiles
// with the business / personal choice); what the real record needs is drawn in the same style and shared with the
// design stories: the column mapping for a new bank, the rows to fix, the same statement refused, linking a card to an
// employee, choosing another claim line, and the employee's lines on a computer.
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Link2, Upload } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button, IconButton } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { FieldRow, FormField, useTooEarly } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { RadioGroup } from '../../components/choice';
import { PersonPicker, Select } from '../../components/select';
import { FileUpload } from '../../components/upload';
import { DataTable } from '../../components/table';
import { PlainTable } from '../../components/plain-table';
import { Card, DescriptionList, PageHeader } from '../../components/shell';
import { Dialog } from '../../components/overlay';
import { PageBanner } from '../../components/notify';
import { Segment } from '../../components/segment';
import { Stepper, useNarrow } from '../../components/stepper';
import { formatDate } from '../../lib/format';
import { useAct } from '../growth/perf-live';
import { Actions, Facts, OpsDesk } from './ops-kit';
import { amount, day, money, monthName, type LoadState } from './expenses-live-data';
import type { CardBank, CardCandidate, CardDateFormat, CardImportProblem, CardLineRow, CardMapping, CardPreview, CardStatements, CardStatementView, MyCardLine, MyCardLines } from '../expenses/live/types';

/* ================================================================== shared parts (design stories and live) */

export const CARD_PAGE = { title: 'Card statements', description: 'Corporate card statement from the bank. Lines match receipts on amount, date and merchant.' };
const DATE_FORMATS: { value: CardDateFormat; label: string }[] = [
  { value: 'DD/MM/YYYY', label: 'Day first: 31/12/2026' },
  { value: 'MM/DD/YYYY', label: 'Month first: 12/31/2026' },
  { value: 'YYYY-MM-DD', label: 'Year first: 2026-12-31' },
  { value: 'DD-MMM-YYYY', label: 'Month as a word: 31-Dec-2026' },
];
const AMOUNT_MODES: { value: CardMapping['amountMode']; label: string }[] = [
  { value: 'signed', label: 'One amount column' },
  { value: 'split', label: 'Debit and credit columns' },
  { value: 'indicator', label: 'Amount and a Dr / Cr column' },
];
const letter = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `A${String.fromCharCode(65 + i - 26)}`);
/** "Column A · Txn Date" for a heading of the file. */
export const columnLabel = (columns: string[], name?: string) => {
  const i = name ? columns.findIndex((c) => c.trim().toLowerCase() === name.trim().toLowerCase()) : -1;
  return name ? (i >= 0 ? `Column ${letter(i)} · ${columns[i]}` : name) : 'Not in this file';
};

/** The saved mapping in words (the "Check columns" design). */
export function mappingItems(m: CardMapping, columns: string[]) {
  const c = (n?: string) => columnLabel(columns, n);
  return [
    { label: 'Transaction date', value: `${c(m.date)} · ${DATE_FORMATS.find((f) => f.value === m.dateFormat)?.label ?? m.dateFormat}` },
    { label: 'Merchant', value: m.merchant ? c(m.merchant) : c(m.description) },
    ...(m.amountMode === 'split'
      ? [
          { label: 'Amount (₹)', value: `${c(m.debit)} (debit) · ${c(m.credit)} (credit)` },
        ]
      : [{ label: 'Amount (₹)', value: m.amountMode === 'indicator' ? `${c(m.amount)} · Dr / Cr in ${c(m.indicator)}` : `${c(m.amount)} · a minus amount is a ${m.negativeIs === 'debit' ? 'payment' : 'refund'}` }]),
    { label: 'Card holder', value: m.card ? `${c(m.card)} · Card last 4 → employee` : 'No card number column' },
    ...(m.currency ? [{ label: 'Currency', value: c(m.currency) }] : []),
  ];
}

const missing = (m: Partial<CardMapping>): { fieldId: string; message: string }[] => [
  ...(!m.date ? [{ fieldId: 'cm-date', message: 'Choose the column with the transaction date.' }] : []),
  ...(!m.description ? [{ fieldId: 'cm-desc', message: 'Choose the column with the description.' }] : []),
  ...(m.amountMode !== 'split' && !m.amount ? [{ fieldId: 'cm-amount', message: 'Choose the amount column.' }] : []),
  ...(m.amountMode === 'split' && !m.debit ? [{ fieldId: 'cm-debit', message: 'Choose the debit column.' }] : []),
  ...(m.amountMode === 'split' && !m.credit ? [{ fieldId: 'cm-credit', message: 'Choose the credit column.' }] : []),
  ...(m.amountMode === 'indicator' && !m.indicator ? [{ fieldId: 'cm-ind', message: 'Choose the Dr / Cr column.' }] : []),
];

/** Which column holds what, for a bank's first statement (or to change the saved one). */
export function MappingForm({ columns, sample, value, onChange, errorOf }: { columns: string[]; sample: string[][]; value: Partial<CardMapping>; onChange: (m: Partial<CardMapping>) => void; errorOf?: (id: string) => string | undefined }) {
  const opts = columns.map((c, i) => ({ value: c, label: `${letter(i)} · ${c}` }));
  const set = (k: keyof CardMapping) => (v: string | null) => onChange({ ...value, [k]: v ?? undefined });
  const pick = (id: string, label: string, k: keyof CardMapping, o: { optional?: boolean; helper?: string } = {}) => (
    <FormField label={label} id={id} optional={o.optional} helper={o.helper} error={errorOf?.(id)}>
      <Select id={id} value={(value[k] as string | undefined) ?? null} onChange={set(k)} options={opts} placeholder="Choose a column" clearable={o.optional} />
    </FormField>
  );
  return (
    <div className="yx-ops-stack">
      <PlainTable label="The first rows of the file" columns={columns.map((c, i) => ({ key: String(i), header: `${letter(i)} · ${c}`, cell: (r: string[]) => r[i] ?? '' }))} rows={sample.slice(0, 3)} getRowId={(r) => r.join('|')} />
      <FieldRow>
        {pick('cm-date', 'Transaction date', 'date')}
        <FormField label="Dates are written" id="cm-fmt">
          <Select id="cm-fmt" value={value.dateFormat ?? 'DD/MM/YYYY'} onChange={(v) => onChange({ ...value, dateFormat: (v ?? 'DD/MM/YYYY') as CardDateFormat })} options={DATE_FORMATS} />
        </FormField>
      </FieldRow>
      <FieldRow>
        {pick('cm-desc', 'Description', 'description')}
        {pick('cm-merchant', 'Merchant', 'merchant', { optional: true, helper: 'Leave empty when the description names the merchant.' })}
      </FieldRow>
      <FieldRow>
        {pick('cm-card', 'Card number', 'card', { optional: true, helper: 'Only the last 4 digits are kept.' })}
        {pick('cm-cur', 'Currency', 'currency', { optional: true, helper: 'Leave empty when every line is in rupees.' })}
      </FieldRow>
      <Segment label="Debits and credits are shown as" value={value.amountMode ?? 'signed'} onChange={(v) => onChange({ ...value, amountMode: v })} options={AMOUNT_MODES} />
      {value.amountMode === 'split' ? (
        <FieldRow>
          {pick('cm-debit', 'Debit (money spent)', 'debit')}
          {pick('cm-credit', 'Credit (refunds)', 'credit')}
        </FieldRow>
      ) : (
        <FieldRow>
          {pick('cm-amount', 'Amount', 'amount')}
          {value.amountMode === 'indicator' ? pick('cm-ind', 'Dr / Cr column', 'indicator') : <Segment label="A minus amount is" value={value.negativeIs ?? 'credit'} onChange={(v) => onChange({ ...value, negativeIs: v })} options={[{ value: 'credit', label: 'A refund' }, { value: 'debit', label: 'A payment' }]} />}
        </FieldRow>
      )}
    </div>
  );
}

/** One bad row and nothing is imported: every row to fix, with what to fix. */
export function RowsToFix({ message, problems }: { message: string; problems: { rowNo: number; problems: string[] }[] }) {
  return (
    <InlineAlert tone="danger" title={message}>
      {problems.some((p) => p.rowNo > 0) && (
        <PlainTable label="Rows to fix" columns={[{ key: 'r', header: 'Row', num: true, cell: (p: { rowNo: number }) => p.rowNo }, { key: 'p', header: 'What to fix', cell: (p: { problems: string[] }) => p.problems.join(' ') }]} rows={problems.filter((p) => p.rowNo > 0)} getRowId={(p) => String(p.rowNo)} />
      )}
    </InlineAlert>
  );
}

/** The same file, or the same bank and period: refused plainly, with the way forward. */
export function ImportRefused({ problem, onOpen, onReplace, busy }: { problem: CardImportProblem; onOpen?: (id: string) => void; onReplace?: () => void; busy?: boolean }) {
  if (problem.kind === 'rows') return <RowsToFix message={problem.message} problems={problem.problems} />;
  const id = problem.kind === 'duplicate' || problem.kind === 'period' ? problem.statementId : null;
  return (
    <InlineAlert
      tone="warning"
      title={problem.kind === 'duplicate' ? 'This statement is already imported.' : problem.kind === 'period' ? 'This period is already imported.' : 'The statement was not imported.'}
      actions={
        <>
          {id && onOpen && <Button size="sm" onClick={() => onOpen(id)}>Open that statement</Button>}
          {problem.kind === 'period' && problem.revision && onReplace && (
            <Button size="sm" loading={busy} onClick={onReplace}>
              Import as version {problem.revision + 1}
            </Button>
          )}
        </>
      }
    >
      {problem.message}
    </InlineAlert>
  );
}

export type CardStatus = 'Matched' | 'Suggested' | 'Unmatched' | 'With employee' | 'Personal spend' | 'Refund' | 'Replaced';
const STATUS_TONE: Record<CardStatus, BadgeTone> = { Matched: 'success', Suggested: 'warning', Unmatched: 'danger', 'With employee': 'info', 'Personal spend': 'neutral', Refund: 'neutral', Replaced: 'neutral' };
export function cardStatus(l: CardLineRow): CardStatus {
  if (l.status === 'matched') return 'Matched';
  if (l.status === 'personal') return 'Personal spend';
  if (l.status === 'refund') return 'Refund';
  if (l.status === 'replaced') return 'Replaced';
  if (l.status === 'to_chase') return 'With employee';
  return l.suggestion ? 'Suggested' : 'Unmatched';
}
const holderText = (l: CardLineRow) => (l.holders.length ? l.holders.map((h) => h.name).join(', ') : l.cardLast4 ? `Card ••${l.cardLast4} · not linked` : 'No card number');
function matchedText(l: CardLineRow) {
  if (l.matchedTo) return l.matchedTo.text;
  if (l.matchGone) return 'The claim line was removed; match it again';
  if (l.status === 'personal') return 'Recovered from salary';
  if (l.status === 'to_chase') return l.suggestion ? `${l.suggestion.text}?` : `Asked ${l.chasedOn ? formatDate(day(l.chasedOn)) : ''}`;
  return l.suggestion ? `${l.suggestion.text}?` : '—';
}

/** Link a card's last 4 digits to an employee (the place finance registers corporate cards). */
export function LinkCardDialog({ line, bankName, people, onSearch, onClose, onLink }: { line: Pick<CardLineRow, 'cardLast4'>; bankName: string; people: { id: string; name: string; code: string | null }[]; onSearch: (q: string) => void; onClose: () => void; onLink: (employeeId: string) => Promise<unknown> }) {
  const [who, setWho] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const early = useTooEarly(who ? [] : [{ fieldId: 'lc-who', message: 'Choose the employee who holds this card.' }]);
  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title={`Link card ending ${line.cardLast4}`}
      description={`${bankName}. Only the last 4 digits are kept. Lines of open statements with this card go to the employee.`}
      preventClose={busy}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              if (early.stop()) return;
              setBusy(true);
              try {
                await onLink(who!);
              } finally {
                setBusy(false);
              }
            }}
          >
            Link card
          </Button>
        </>
      }
    >
      <FormField label="Employee" id="lc-who" error={early.errorOf('lc-who')}>
        <PersonPicker id="lc-who" value={who} onChange={setWho} people={people.map((p) => ({ id: p.id, name: p.name, role: p.code ?? undefined }))} onSearchChange={onSearch} placeholder="Type a name or employee code" />
      </FormField>
    </Dialog>
  );
}

/** Finance confirms another claim line of the card's holder. */
export function ChangeMatchDialog({ line, candidates, onClose, onMatch }: { line: CardLineRow; candidates: CardCandidate[]; onClose: () => void; onMatch: (claimLineId: string) => Promise<unknown> }) {
  const mine = candidates.filter((c) => line.holders.some((h) => h.id === c.employeeId));
  const [pick, setPick] = useState<string | null>(line.suggestion?.lineId ?? line.matchedTo?.lineId ?? null);
  const [busy, setBusy] = useState(false);
  const early = useTooEarly(pick ? [] : [{ fieldId: 'cm-line', message: 'Choose the claim line this card line paid for.' }]);
  return (
    <Dialog
      open
      size="md"
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title="Match card line"
      description={`${formatDate(day(line.txnOn))} · ${line.description} · ${money(line.currency, line.amount)}`}
      preventClose={busy}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              if (early.stop()) return;
              setBusy(true);
              try {
                await onMatch(pick!);
              } finally {
                setBusy(false);
              }
            }}
          >
            Match
          </Button>
        </>
      }
    >
      {mine.length ? (
        <FormField label="Claim line" id="cm-line" error={early.errorOf('cm-line')} helper="A line claimed as personal on a claim not yet approved becomes a company card line, so it is not paid twice.">
          <Select id="cm-line" value={pick} onChange={setPick} options={mine.map((c) => ({ value: c.lineId, label: `${c.text} · ${money(c.currency, c.amount)} · ${formatDate(day(c.spentOn))}${c.payMode === 'personal' ? ' · claimed as personal' : ''}` }))} placeholder="Choose a claim line" />
        </FormField>
      ) : (
        <EmptyState compact title="No claim line to match." description={line.holders.length ? `${line.holders[0]!.name} has no company card or undecided personal line near this date. Ask the employee instead.` : 'Link the card to an employee first.'} />
      )}
    </Dialog>
  );
}

/** The employee's card lines with the business / personal choice (the phone design; the same tiles on a computer). */
export function CardLinesToExplain({ lines, recoveryInstalments, onExplain, busy }: { lines: MyCardLine[]; recoveryInstalments: number; onExplain: (l: MyCardLine, choice: 'business' | 'personal') => void; busy: string | null }) {
  const [open, setOpen] = useState<string | null>(lines[0]?.id ?? null);
  const [choice, setChoice] = useState<'business' | 'personal'>('business');
  return (
    <>
      {lines.map((x) => (
        <div key={x.id} className="yx-ops-tile">
          <div className="yx-ops-tile__row">
            <span className="yx-ops-tile__title">{x.merchant ?? x.description}</span>
            <span className="yx-ops-tile__amount">{money(x.currency, x.amount)}</span>
          </div>
          <span className="yx-ops-row">
            <span className="yx-ops-muted">{formatDate(day(x.txnOn))}</span>
            <Badge tone={x.suggestion ? 'warning' : 'danger'}>{x.suggestion ? `Suggested: ${x.suggestion.text}` : 'No receipt found'}</Badge>
          </span>
          {x.id === open ? (
            <div className="yx-ops-stack" data-gap="sm">
              <RadioGroup
                value={choice}
                onChange={(v) => setChoice(v as 'business' | 'personal')}
                aria-label="What was it?"
                options={[
                  { value: 'business', label: 'Business expense', description: x.suggestion ? 'Matched to that claim line' : 'Add the receipt' },
                  { value: 'personal', label: 'Personal spend', description: `Recovered from salary (${recoveryInstalments === 1 ? 'next month' : `${recoveryInstalments} instalments`})` },
                ]}
              />
              {choice === 'business' ? (
                <Button icon={Upload} fullWidth loading={busy === x.id} onClick={() => onExplain(x, 'business')}>
                  Add receipt
                </Button>
              ) : (
                <Button variant="primary" fullWidth loading={busy === x.id} onClick={() => onExplain(x, 'personal')}>
                  Confirm personal spend
                </Button>
              )}
            </div>
          ) : (
            <Button size="sm" onClick={() => (setOpen(x.id), setChoice('business'))}>
              Explain
            </Button>
          )}
        </div>
      ))}
    </>
  );
}

/* ================================================================== finance (live) */

export interface LiveCardImport {
  state: LoadState;
  onRetry: () => void;
  list: CardStatements | null;
  /** The statement open (with its lines); null for a new import. */
  statement: CardStatementView | null;
  /** The open statement's load; 'ready' for a new import. */
  statementState: LoadState;
  onOpen: (id: string | null) => void;
  onPreview: (file: File, bankName: string | null) => Promise<CardPreview>;
  /** Rejects with an Error carrying `code` and `body` (ROWS_TO_FIX, DUPLICATE_STATEMENT, SAME_PERIOD). */
  onImport: (file: File, bankName: string, mapping: CardMapping, replace: boolean) => Promise<{ id: string; fullNumbersDropped: number }>;
  onMatch: (line: CardLineRow, claimLineId: string) => Promise<unknown>;
  onChase: (line: CardLineRow) => Promise<unknown>;
  onClose: (note: string) => Promise<unknown>;
  onLinkCard: (employeeId: string, bankName: string, last4: string) => Promise<{ lines: number }>;
  onSearchPeople: (q: string) => Promise<{ id: string; name: string; code: string | null }[]>;
}

/** An import refusal from the API error (its code and details). */
export function importProblem(e: unknown): CardImportProblem {
  const x = e as { message?: string; code?: string; body?: { problems?: { rowNo: number; problems: string[] }[]; statementId?: string; revision?: number } };
  const message = x?.message || 'The statement was not imported. Try again.';
  if (x?.code === 'ROWS_TO_FIX') return { kind: 'rows', message, problems: x.body?.problems ?? [] };
  if (x?.code === 'DUPLICATE_STATEMENT') return { kind: 'duplicate', message, statementId: x.body?.statementId ?? null };
  if (x?.code === 'SAME_PERIOD') return { kind: 'period', message, statementId: x.body?.statementId ?? null, revision: x.body?.revision ?? null };
  return { kind: 'other', message };
}

const NEW = '__new';

export function LiveCardImportScreen({ live, defaultSheet = null }: { live: LiveCardImport; defaultSheet?: 'link' | 'change' | null }) {
  const { act, busy, toast } = useAct();
  const s = live.statement;
  const banks = live.list?.banks ?? [];
  const [step, setStep] = useState(s ? 'match' : 'upload');
  const [bank, setBank] = useState<string | null>(banks[0]?.bankName ?? NEW);
  const [newBank, setNewBank] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CardPreview | null>(null);
  const [mapping, setMapping] = useState<Partial<CardMapping>>({ dateFormat: 'DD/MM/YYYY', amountMode: 'signed' });
  const [editMap, setEditMap] = useState(false);
  const [problem, setProblem] = useState<CardImportProblem | null>(null);
  const [importing, setImporting] = useState(false);
  const [note, setNote] = useState(s?.statement.note ?? '');
  const [linking, setLinking] = useState<CardLineRow | null>(defaultSheet === 'link' ? (s?.lines.find((l) => !l.holders.length && l.cardLast4) ?? null) : null);
  const [changing, setChanging] = useState<CardLineRow | null>(defaultSheet === 'change' ? (s?.lines.find((l) => l.suggestion) ?? null) : null);
  const [people, setPeople] = useState<{ id: string; name: string; code: string | null }[]>([]);
  const [closeProblem, setCloseProblem] = useState<string | null>(null);
  useEffect(() => setStep(s ? 'match' : 'upload'), [s?.statement.id]);
  const bankName = bank === NEW ? newBank.trim() : (bank ?? '');
  const saved: CardBank | null = preview?.mapping ?? banks.find((b) => b.bankName.toLowerCase() === bankName.toLowerCase()) ?? null;
  const savedFits = Boolean(saved && preview && [saved.mapping.date, saved.mapping.description, saved.mapping.amount, saved.mapping.debit, saved.mapping.credit, saved.mapping.indicator, saved.mapping.card, saved.mapping.merchant, saved.mapping.currency].filter(Boolean).every((c) => preview.columns.some((x) => x.toLowerCase() === c!.toLowerCase())));
  const showForm = !savedFits || editMap;
  const uploadEarly = useTooEarly([...(bank === NEW && newBank.trim().length < 2 ? [{ fieldId: 'ci-bank-name', message: 'Name the card programme, e.g. HDFC corporate cards.' }] : []), ...(!preview ? [{ fieldId: 'ci-file', message: 'Upload the statement file (CSV or Excel).' }] : [])]);
  const mapEarly = useTooEarly(showForm ? missing(mapping) : []);
  const lines = s?.lines ?? [];
  const counts = useMemo(() => {
    const st = lines.map(cardStatus);
    return { m: st.filter((x) => x === 'Matched').length, s: st.filter((x) => x === 'Suggested').length, u: st.filter((x) => x === 'Unmatched').length, c: st.filter((x) => x === 'With employee').length };
  }, [lines]);

  const st = live.state !== 'ready' || !live.list ? live.state : live.statementState !== 'ready' ? live.statementState : null;
  if (st) {
    return (
      <OpsDesk area="expenses" active="Card statements">
        <PageHeader title={CARD_PAGE.title} />
        {st === 'loading' ? (
          <div className="yx-ops-stack" role="status" aria-busy="true" aria-label="Loading card statements">
            <Skeleton height={64} />
            <Skeleton height={240} />
          </div>
        ) : st === 'no-access' ? (
          <NoAccessState what="card statements" grantedBy="your finance admin" note="Card statements need expense.payout.manage for the whole company." />
        ) : (
          <ErrorState title="We couldn't load card statements." description="Nothing has changed. Try again in a moment." onRetry={live.onRetry} />
        )}
      </OpsDesk>
    );
  }

  const runImport = async (replace: boolean) => {
    if (!file) return;
    setImporting(true);
    setProblem(null);
    try {
      const m = (showForm ? mapping : saved!.mapping) as CardMapping;
      const r = await live.onImport(file, bankName, m, replace);
      toast({ tone: 'success', title: r.fullNumbersDropped ? `Statement imported. ${r.fullNumbersDropped} full card ${r.fullNumbersDropped === 1 ? 'number was' : 'numbers were'} cut to the last 4 digits.` : 'Statement imported.' });
      live.onOpen(r.id);
    } catch (e) {
      setProblem(importProblem(e));
    } finally {
      setImporting(false);
    }
  };
  const onContinue = (id: string) => {
    if (id === 'upload') return !uploadEarly.stop();
    if (id === 'map') {
      if (s) return true;
      if (mapEarly.stop()) return false;
      void runImport(false);
      return false;
    }
    return true;
  };

  const list = live.list!;
  const head = s?.statement;
  const title = head ? `Card statement · ${monthName(head.periodTo.slice(0, 7))}` : CARD_PAGE.title;
  const statementOptions = list.statements.map((x) => ({ value: x.id, label: `${x.bankName} · ${monthName(x.periodTo.slice(0, 7))}${x.revision > 1 ? ` · version ${x.revision}` : ''}${x.status === 'replaced' ? ' (replaced)' : ''}` }));
  const usedMapping = head ? banks.find((b) => b.bankName === head.bankName) : null;
  const search = (q: string) => {
    if (q.trim().length < 2) return;
    void live.onSearchPeople(q.trim()).then(setPeople, () => undefined);
  };

  const rowButtons = (l: CardLineRow) => {
    if (l.direction !== 'debit' || l.own || l.status === 'personal' || l.status === 'replaced' || head?.status === 'replaced') return null;
    const st = cardStatus(l);
    if (st === 'Suggested')
      return (
        <>
          <Button size="sm" loading={busy === `m:${l.id}`} onClick={() => act(`m:${l.id}`, () => live.onMatch(l, l.suggestion!.lineId), 'Match accepted')}>
            Accept match
          </Button>
          <Button size="sm" onClick={() => setChanging(l)}>Change</Button>
        </>
      );
    if (st === 'Unmatched')
      return !l.holders.length && l.cardLast4 ? (
        <Button size="sm" icon={Link2} onClick={() => setLinking(l)}>Link card</Button>
      ) : (
        <>
          {l.holders.length === 1 && (
            <Button size="sm" loading={busy === `c:${l.id}`} onClick={() => act(`c:${l.id}`, () => live.onChase(l), `Asked ${l.holders[0]!.name} to explain the line`)}>
              Ask employee
            </Button>
          )}
          <Button size="sm" onClick={() => setChanging(l)}>Choose line</Button>
        </>
      );
    if (st === 'Matched' || st === 'With employee') return <Button size="sm" onClick={() => setChanging(l)}>Change</Button>;
    return null;
  };

  return (
    <OpsDesk area="expenses" active="Card statements">
      <PageHeader
        title={title}
        description={CARD_PAGE.description}
        facts={head ? `${head.bankName} · ${formatDate(day(head.periodFrom))} to ${formatDate(day(head.periodTo))} · version ${head.revision}` : undefined}
        actions={
          list.statements.length > 0 ? (
            <>
              <Select aria-label="Statement" size="sm" value={head?.id ?? null} onChange={(v) => live.onOpen(v)} options={statementOptions} placeholder="Open a statement" />
              {head && <Button icon={Upload} onClick={() => live.onOpen(null)}>Import statement</Button>}
            </>
          ) : undefined
        }
      />
      {head?.status === 'replaced' && <PageBanner tone="warning">This is version {head.revision}. A newer version of this statement replaced it, so nothing here can change.</PageBanner>}
      <Stepper
        key={head?.id ?? 'new'}
        title="Import card statement"
        current={step}
        onCurrentChange={setStep}
        onContinue={onContinue}
        finishLabel="Close statement"
        finishing={busy === 'close'}
        onFinish={() => {
          if (!head) return;
          if (head.status !== 'open') return void toast({ tone: 'error', title: head.status === 'closed' ? 'This statement is already closed.' : 'This statement was replaced by a newer version.' });
          setCloseProblem(null);
          void act('close', async () => {
            try {
              await live.onClose(note);
            } catch (e) {
              const x = e as { code?: string; message?: string };
              if (x.code === 'CARDS_TO_LINK') setCloseProblem(x.message ?? 'Link the cards first.');
              throw e;
            }
          }, 'Statement closed. Lines not matched went to the employees to explain.');
        }}
        steps={[
          {
            id: 'upload',
            title: 'Upload statement',
            content: head ? (
              <div className="yx-ops-stack">
                <DescriptionList items={[{ label: 'Card programme', value: head.bankName }, { label: 'File', value: head.fileName }, { label: 'Imported', value: formatDate(day(head.importedAt)) }, { label: 'Lines', value: String(head.rowCount) }]} />
                <Actions>
                  <Button icon={Upload} onClick={() => live.onOpen(null)}>Import another statement</Button>
                </Actions>
              </div>
            ) : (
              <div className="yx-ops-stack">
                <FormField label="Card programme" id="ci-bank">
                  <Select id="ci-bank" value={bank} onChange={(v) => (setBank(v), setPreview(null), setFile(null), setProblem(null))} options={[...banks.map((b) => ({ value: b.bankName, label: b.bankName })), { value: NEW, label: 'A new card programme' }]} />
                </FormField>
                {bank === NEW && (
                  <FormField label="Name of the card programme" id="ci-bank-name" helper="The bank and card, e.g. HDFC corporate cards. Its column mapping is saved under this name." error={uploadEarly.errorOf('ci-bank-name')}>
                    <TextField id="ci-bank-name" value={newBank} onChange={setNewBank} maxLength={80} />
                  </FormField>
                )}
                <FormField label="Statement file" id="ci-file" helper="CSV or Excel (.xlsx), up to 5 MB." error={uploadEarly.errorOf('ci-file')}>
                  <FileUpload
                    id="ci-file"
                    accept={['.csv', '.xlsx']}
                    maxSize={5 * 1024 * 1024}
                    multiple={false}
                    upload={async (f) => {
                      setProblem(null);
                      const p = await live.onPreview(f, bankName || null);
                      setFile(f);
                      setPreview(p);
                      setEditMap(false);
                      if (p.mapping) setMapping(p.mapping.mapping);
                    }}
                  />
                </FormField>
              </div>
            ),
            summary: head ? `${head.fileName} · ${head.rowCount} lines` : preview ? `${preview.fileName} · ${preview.rows} lines` : undefined,
          },
          {
            id: 'map',
            title: 'Check columns',
            content: head ? (
              usedMapping ? <DescriptionList items={mappingItems(usedMapping.mapping, [])} /> : <p className="yx-ops-muted">The columns of {head.bankName}.</p>
            ) : (
              <div className="yx-ops-stack">
                {problem && <ImportRefused problem={problem} onOpen={(id) => live.onOpen(id)} onReplace={() => void runImport(true)} busy={importing} />}
                {importing && <InlineAlert tone="info">Checking every row…</InlineAlert>}
                {preview && saved && savedFits && !editMap ? (
                  <>
                    <DescriptionList items={mappingItems(saved.mapping, preview.columns)} />
                    <Actions>
                      <Button onClick={() => (setMapping(saved.mapping), setEditMap(true))}>Change columns</Button>
                    </Actions>
                  </>
                ) : preview ? (
                  <>
                    {saved && !savedFits && <InlineAlert tone="warning">This file&apos;s columns differ from the ones saved for {saved.bankName}. Check them; the new choice is saved for next time.</InlineAlert>}
                    {!saved && <InlineAlert tone="info">The first statement from {bankName || 'this card programme'}: say which column holds what. It is saved for next time.</InlineAlert>}
                    <MappingForm columns={preview.columns} sample={preview.sample} value={mapping} onChange={setMapping} errorOf={mapEarly.errorOf} />
                  </>
                ) : (
                  <EmptyState compact title="Upload the statement first." />
                )}
              </div>
            ),
            summary: head || !preview ? undefined : showForm ? `${Object.entries(mapping).filter(([k, v]) => v && k !== 'dateFormat' && k !== 'amountMode' && k !== 'negativeIs').length} columns mapped` : `The columns saved for ${saved?.bankName}`,
          },
          {
            id: 'match',
            title: 'Match lines',
            content: head ? (
              <div className="yx-ops-stack">
                {head.fullNumbersDropped > 0 && <InlineAlert tone="info">This file had {head.fullNumbersDropped} full card {head.fullNumbersDropped === 1 ? 'number' : 'numbers'}. YukthiX kept only the last 4 digits, and the copy of the file it keeps has the last 4 digits only.</InlineAlert>}
                {counts.s + counts.u === 0 && <InlineAlert tone="info">Nothing to match. Every line is matched, with the employee, explained or a refund.</InlineAlert>}
                <Facts
                  items={[
                    { label: 'Matched', value: counts.m, tone: 'success' },
                    { label: 'Suggested', value: counts.s, tone: 'warning' },
                    { label: 'Unmatched', value: counts.u, tone: 'danger' },
                    { label: 'With employee', value: counts.c },
                  ]}
                />
                <DataTable
                  label="Card lines"
                  columns={[
                    { key: 'd', header: 'Date', type: 'date', value: (l: CardLineRow) => day(l.txnOn) },
                    { key: 'm', header: 'Merchant', value: (l) => l.merchant ?? l.description, width: 220 },
                    { key: 'a', header: 'Amount', type: 'money', value: (l) => (l.direction === 'credit' ? -amount(l.amount) : amount(l.amount)), render: (l) => `${l.direction === 'credit' ? '− ' : ''}${money(l.currency, l.amount)}` },
                    { key: 'e', header: 'Card holder', value: holderText },
                    { key: 's', header: 'Match', type: 'status', value: cardStatus, statusTone: (v) => STATUS_TONE[v as CardStatus] },
                    { key: 't', header: 'Matched to', value: matchedText, width: 220 },
                  ]}
                  rows={lines}
                  getRowId={(l) => l.id}
                  rowNoun={['line', 'lines']}
                  rowButtons={rowButtons}
                />
              </div>
            ) : (
              <EmptyState compact title="Import the statement first." />
            ),
            summary: `${counts.m} matched, ${counts.s} suggested, ${counts.u} unmatched`,
          },
          {
            id: 'resolve',
            title: 'Resolve',
            content: (
              <div className="yx-ops-stack">
                {closeProblem && <InlineAlert tone="danger">{closeProblem}</InlineAlert>}
                {head?.status === 'closed' ? (
                  <InlineAlert tone="info">This statement is closed. Employees are reminded until they explain their lines.</InlineAlert>
                ) : (
                  <InlineAlert tone="info">
                    Employees explain unmatched lines from their phone. Personal spend is recovered from salary (up to {list.rules.recoveryInstalments ?? 3} instalments). Closing sends every line not matched to its card holder.
                  </InlineAlert>
                )}
                <FormField label="Note for the statement" optional id="ci-note">
                  <TextArea id="ci-note" rows={2} value={note} onChange={setNote} maxLength={500} />
                </FormField>
              </div>
            ),
          },
        ]}
      />
      {linking && head && (
        <LinkCardDialog
          line={linking}
          bankName={head.bankName}
          people={people}
          onSearch={search}
          onClose={() => setLinking(null)}
          onLink={async (employeeId) => {
            const ok = await act('link', async () => {
              const r = await live.onLinkCard(employeeId, head.bankName, linking.cardLast4!);
              toast({ tone: 'success', title: `Card ending ${linking.cardLast4} linked. ${r.lines} ${r.lines === 1 ? 'line' : 'lines'} now show the card holder.` });
            });
            if (ok) setLinking(null);
          }}
        />
      )}
      {changing && s && (
        <ChangeMatchDialog
          line={changing}
          candidates={s.candidates}
          onClose={() => setChanging(null)}
          onMatch={async (claimLineId) => {
            const ok = await act('change', () => live.onMatch(changing, claimLineId), 'Match saved');
            if (ok) setChanging(null);
          }}
        />
      )}
    </OpsDesk>
  );
}

/* ================================================================== the employee (live) */

export interface LiveCardLines {
  state: LoadState;
  onRetry: () => void;
  data: MyCardLines | null;
  onExplain: (line: MyCardLine, choice: 'business' | 'personal') => Promise<{ claimId?: string; existing?: boolean; instalments?: number; firstMonth?: string }>;
  onOpenClaim: (claimId: string) => void;
  onBack: () => void;
}

export function LiveCardLinesScreen({ live, device }: { live: LiveCardLines; device?: 'phone' | 'desk' }) {
  const narrow = useNarrow();
  const phone = device ? device === 'phone' : narrow;
  const { act, busy } = useAct();
  const d = live.data;
  const lines = d?.lines ?? [];
  const first = lines[0];
  const lead = first ? `Your company card, ${monthName(first.periodTo.slice(0, 7)).split(' ')[0]} statement. ${lines.length} ${lines.length === 1 ? 'line needs' : 'lines need'} you.` : '';
  const explain = (l: MyCardLine, choice: 'business' | 'personal') =>
    void act(`${l.id}`, async () => {
      const r = await live.onExplain(l, choice);
      if (choice === 'business' && r.claimId) live.onOpenClaim(r.claimId);
    }, choice === 'business' ? 'Added to your claim. Add the receipt there.' : `Personal spend confirmed. It is recovered from your salary in ${d?.recoveryInstalments ?? 1} ${d?.recoveryInstalments === 1 ? 'instalment' : 'instalments'}.`);
  const body =
    live.state === 'loading' ? (
      <div className="yx-ops-stack" role="status" aria-busy="true" aria-label="Loading card lines">
        <Skeleton height={64} />
        <Skeleton height={64} />
      </div>
    ) : live.state !== 'ready' || !d ? (
      <ErrorState title="We couldn't load your card lines." description="Nothing has changed. Try again in a moment." onRetry={live.onRetry} />
    ) : lines.length === 0 ? (
      <EmptyState compact title="Nothing to explain." description="Every line on your company card is matched to a claim." />
    ) : (
      <CardLinesToExplain lines={lines} recoveryInstalments={d.recoveryInstalments} onExplain={explain} busy={busy} />
    );
  if (phone)
    return (
      <PhoneFrame tab="pay" title="Card lines to explain" back={<IconButton icon={ArrowLeft} label="Back" onClick={live.onBack} />}>
        {lead && <p className="yx-ops-muted">{lead}</p>}
        {body}
      </PhoneFrame>
    );
  return (
    <OpsDesk area="expenses" active="Expenses home">
      <PageHeader title="Card lines to explain" description={lead || 'Lines on your company card statement that finance could not match to a claim.'} />
      <Card title="Your company card">
        <div className="yx-ops-stack">{body}</div>
      </Card>
    </OpsDesk>
  );
}
