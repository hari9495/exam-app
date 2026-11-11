// YukthiX console: statutory rule sets (YX-01), golden cases and review (YX-02), publish scheduler (YX-03), AI governance (YX-05).
import { useState, type ReactNode } from 'react';
import { FileText, Play, Plus, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { EmptyState, InlineAlert, Skeleton } from '../../components/feedback';
import { useToast } from '../../components/notify';
import { FieldRow, FormField } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { Checkbox, Switch } from '../../components/choice';
import { FileUpload } from '../../components/upload';
import { Drawer } from '../../components/drawer';
import { ConfirmDialog } from '../../components/overlay';
import { Stepper } from '../../components/stepper';
import { MenuItem } from '../../components/menu';
import { BarChart, LineChart } from '../../components/charts';
import { ActivityFeed, type ActivityEntry } from '../../components/timeline';
import { formatDate, formatINR } from '../../lib/format';
import { timeOf } from '../../lib/dates';
import { checkerError, PT_ANNUAL_CAP, ptAnnualMax, slabErrors, type SlabRow } from './portals-logic';
import { BlockNote, Fact, FactRow } from './portals-kit';
import { FilteredTable, opts } from './list-kit';
import { Console } from './console-kit';
import type { GoldenCase, RuleSet } from './console-data';
import { parseValues, plain, shapeOf, slabLines, slabsFrom, slabsTo, type LiveGoldenRun, type LiveImpact, type LiveLoad, type LiveRuleDetail, type LiveRuleRow, type RuleState, type RuleUpdateInput } from './console-rules-live';

const RS_TONE: Record<RuleState, BadgeTone> = { draft: 'neutral', 'in review': 'warning', 'changes requested': 'danger', published: 'success', withdrawn: 'danger' };
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** The drawn rows and the live rows in one shape for the list. */
const fromLive = (r: LiveRuleRow): RuleSet => ({
  id: r.id,
  statute: r.statute,
  jurisdiction: r.jurisdiction,
  shape: shapeOf(r.kind),
  version: r.version,
  validFrom: day(r.validFrom),
  validTo: r.validTo ? day(r.validTo) : null,
  status: r.state,
  lawVersion: r.lawVersion ?? '',
  transitional: r.transitional,
  draftedBy: r.draftedByName,
  reviewedBy: r.reviewedByName,
  changeNote: r.changeNote ?? '',
});
/** The live console already draws the console frame (ConsoleShell); the drawn stories draw their own. */
const Frame = ({ live, page, children }: { live: boolean; page: Parameters<typeof Console>[0]['page']; children: ReactNode }) => (live ? <>{children}</> : <Console page={page}>{children}</Console>);
const NoAccess = () => <EmptyState title="You can't open the rule sets." description="Rule sets are for YukthiX staff with the Rules editor key. Ask the security lead for it." />;
const LoadFailed = ({ onRetry }: { onRetry?: () => void }) => (
  <InlineAlert tone="danger" title="The rule sets did not load" actions={onRetry && <Button onClick={onRetry}>Try again</Button>}>
    Check your connection and try again.
  </InlineAlert>
);

/* ================================================================== */
/* YX-01 Rule-set editor                                               */
/* ================================================================== */

/** Console C-1 (answers 1041, 1042): the live rule store behind YX-01. */
export interface LiveRuleEditor {
  state: LiveLoad;
  onRetry?: () => void;
  /** The signed-in staff member (the drafter sees their own draft's buttons). */
  me: string;
  sets: LiveRuleRow[];
  onOpen: (id: string) => void;
  /** Copy a version as a new draft named `version`. */
  onCopy: (id: string, version: string) => Promise<void>;
  /** The open version (null while it loads). */
  detail?: LiveRuleDetail | null;
  onSave?: (input: RuleUpdateInput) => Promise<void>;
  onSendForReview?: () => Promise<void>;
  /** Golden cases (YX-02 runner) and the review of a version someone else drafted. */
  onGolden?: () => void;
  onReview?: () => void;
}

// YX-01
/** Rule-set list and editor: slab grid with contiguity checks, PT ₹2,500 cap, mandatory source; published versions are never edited. */
export function RuleSetEditorScreen({
  sets = [],
  openId,
  slabs: initialSlabs = [],
  withSource = true,
  state = 'ready',
  today = new Date(),
  live,
}: {
  sets?: RuleSet[];
  openId?: string;
  slabs?: SlabRow[];
  withSource?: boolean;
  state?: 'ready' | 'loading' | 'error';
  today?: Date;
  live?: LiveRuleEditor;
}) {
  const detail = live?.detail ?? null;
  const allSets = live ? live.sets.map(fromLive) : sets;
  const rs = live ? (detail ? { ...fromLive({ ...detail, kind: detail.values.kind, golden: detail.golden.length }) } : undefined) : sets.find((s) => s.id === openId);
  const [rows, setRows] = useState(detail ? slabsFrom(detail.values) : initialSlabs);
  const [febExtra, setFebExtra] = useState(true);
  const [source, setSource] = useState(detail?.source ?? '');
  const [note, setNote] = useState(detail?.changeNote ?? rs?.changeNote ?? '');
  const [valuesText, setValuesText] = useState(detail ? JSON.stringify(detail.values, null, 2) : '');
  const [validFrom, setValidFrom] = useState<Date | null>(detail ? day(detail.validFrom) : null);
  const [validTo, setValidTo] = useState<Date | null>(detail?.validTo ? day(detail.validTo) : null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<'save' | 'send' | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [copyOpen, setCopyOpen] = useState<string | null>(null);
  const [copyName, setCopyName] = useState('');
  const { toast } = useToast();
  const doing = async (what: 'save' | 'send', fn: () => Promise<void>, done: string) => {
    setBusy(what);
    setFailed(null);
    try {
      await fn();
      toast({ tone: 'success', title: done });
      return true;
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'That did not work. Try again.');
      return false;
    } finally {
      setBusy(null);
    }
  };
  const copyDialog = live && (
    <ConfirmDialog
      open={copyOpen !== null}
      onOpenChange={(o) => !o && setCopyOpen(null)}
      title="Copy as a new version"
      consequence="The copy is a draft with its own version name. Change it, then send it for review."
      confirmLabel="Copy"
      onConfirm={async () => {
        if (!/^[A-Za-z0-9.-]{2,20}$/.test(copyName.trim())) {
          setFailed('Name the version: 2 to 20 letters, digits, dots or dashes, such as v2027-04.');
          return false;
        }
        await live.onCopy(copyOpen!, copyName.trim());
        toast({ tone: 'success', title: `Draft ${copyName.trim()} made` });
        setCopyOpen(null);
      }}
    >
      <FormField label="New version" required error={failed && copyOpen ? failed : undefined}>
        <TextField value={copyName} onChange={setCopyName} placeholder="v2027-04" />
      </FormField>
    </ConfirmDialog>
  );
  if (live && (live.state === 'no-access' || live.state === 'error') && !openId)
    return <Frame live page="Rule sets">{live.state === 'no-access' ? <NoAccess /> : <LoadFailed onRetry={live.onRetry} />}</Frame>;
  if (!rs && !openId)
    return (
      <Frame live={!!live} page="Rule sets">
        <PageHeader
          title="Rule sets"
          description="Statutory rules as data. A published version is never edited; a fix is a new version."
          actions={!live && <Button variant="primary" icon={Plus}>New version</Button>}
        />
        {live && <p className="yx-ps-muted">To start a new version, open the version it replaces and choose Copy as new version.</p>}
        <FilteredTable
          label="Rule sets"
          rows={allSets}
          state={live ? (live.state === 'loading' ? 'loading' : 'ready') : state}
          getRowId={(r) => r.id}
          searchText={(r) => `${r.statute} ${r.jurisdiction} ${r.version}`}
          fields={[
            { key: 'statute', label: 'Statute', type: 'multi', options: opts(Array.from(new Set(allSets.map((s) => s.statute)))) },
            { key: 'status', label: 'Status', type: 'multi', options: opts(['draft', 'in review', 'changes requested', 'published', 'withdrawn']) },
          ]}
          views={[{ id: 'all', name: 'All rule sets' }, { id: 'review', name: 'Waiting for review', shared: true }]}
          viewFilters={{ review: [{ key: 'status', type: 'multi', values: ['in review'] }] }}
          empty={<EmptyState title="No rule sets yet." action={!live && <Button variant="primary">New version</Button>} />}
          columns={[
            { key: 'statute', header: 'Statute', type: 'id', value: (r) => r.statute, width: 110 },
            { key: 'jurisdiction', header: 'Jurisdiction', value: (r) => r.jurisdiction, width: 130 },
            { key: 'shape', header: 'Shape', value: (r) => r.shape, width: 90 },
            { key: 'version', header: 'Version', type: 'id', value: (r) => r.version, width: 110 },
            { key: 'validFrom', header: 'Valid from', type: 'date', value: (r) => r.validFrom, width: 120 },
            { key: 'law', header: 'Law version', value: (r) => r.lawVersion + (r.transitional ? ' · transitional' : ''), width: 220 },
            { key: 'status', header: 'Status', type: 'status', value: (r) => cap(r.status), statusTone: (v) => RS_TONE[String(v).toLowerCase() as RuleState], width: 150 },
            { key: 'draftedBy', header: 'Drafted by', value: (r) => r.draftedBy, width: 140 },
          ]}
          rowActions={(r) => (
            <>
              <MenuItem onSelect={() => live?.onOpen(r.id)}>Open</MenuItem>
              <MenuItem
                onSelect={() => {
                  setCopyName('');
                  setFailed(null);
                  setCopyOpen(r.id);
                }}
              >
                Copy as new version
              </MenuItem>
            </>
          )}
        />
        {copyDialog}
      </Frame>
    );
  if (!rs)
    return (
      <Frame live page="Rule sets">
        {live?.state === 'no-access' ? <NoAccess /> : live?.state === 'error' ? <LoadFailed onRetry={live.onRetry} /> : <Skeleton height={240} />}
      </Frame>
    );
  const mine = !live || (detail?.draftedBy === live.me);
  const editable = rs.status === 'draft' || rs.status === 'changes requested';
  const locked = !editable || (!!live && !mine);
  const slabKind = !live || detail?.values.kind === 'pt';
  const errs = slabKind ? slabErrors(rows) : [];
  const annual = ptAnnualMax(rows, febExtra ? 100 : 0);
  const overCap = slabKind && annual > PT_ANNUAL_CAP;
  const parsed = slabKind ? null : parseValues(valuesText);
  const sourceOk = live ? source.trim().length >= 20 : withSource;
  const set = (i: number, k: keyof SlabRow, v: string) =>
    setRows((xs) => xs.map((r, j) => (j === i ? { ...r, [k]: k === 'to' && v.trim() === '' ? null : Number(v.replace(/[^\d.]/g, '')) } : r)));
  const problems = [...errs.map((e) => e.message), ...(overCap ? [`The yearly total is over ${formatINR(PT_ANNUAL_CAP)}.`] : []), ...(!slabKind && !parsed ? ['The values are not valid: an object with a "kind".'] : []), ...(!sourceOk ? ['Give the source (at least 20 characters).'] : []), ...(live && !validFrom ? ['Choose the valid-from date.'] : [])];
  const input = (): RuleUpdateInput => ({
    validFrom: isoOf(validFrom!),
    ...(validTo ? { validTo: isoOf(validTo) } : {}),
    values: slabKind ? { ...detail!.values, slabs: slabsTo(rows) } : parsed!,
    source: source.trim(),
    lawVersion: detail!.lawVersion ?? 'OLD-ACT',
    verify: detail!.verify,
    golden: detail!.golden,
    ...(note.trim() ? { changeNote: note.trim() } : {}),
  });
  const press = async (what: 'save' | 'send') => {
    setTried(true);
    if (problems.length) {
      document.getElementById('rs-problems')?.focus();
      return;
    }
    if (!live) return;
    if (what === 'save') await doing('save', () => live.onSave!(input()), 'Draft saved');
    else if (await doing('save', () => live.onSave!(input()), 'Draft saved')) await doing('send', () => live.onSendForReview!(), 'Sent for review');
  };
  return (
    <Frame live={!!live} page="Rule sets">
      <ObjectHeader
        name={`${rs.statute} · ${rs.jurisdiction} ${rs.version}`}
        icon={FileText}
        secondary={`${rs.shape} table · ${rs.lawVersion}`}
        status={
          <>
            <Badge tone={RS_TONE[rs.status]}>{cap(rs.status)}</Badge>
            {rs.transitional && <Badge tone="warning">Transitional: state rules pending notification</Badge>}
          </>
        }
        facts={[
          { label: 'Valid from', value: formatDate(rs.validFrom) },
          { label: 'Valid to', value: rs.validTo ? formatDate(rs.validTo) : 'Open' },
          { label: 'Drafted by', value: rs.draftedBy },
          { label: 'Reviewed by', value: rs.reviewedBy ?? 'Not yet' },
        ]}
        actions={
          live ? (
            rs.status === 'published' || rs.status === 'withdrawn' ? (
              <Button
                variant="primary"
                onClick={() => {
                  setCopyName('');
                  setCopyOpen(rs.id);
                }}
              >
                Copy as new version
              </Button>
            ) : rs.status === 'in review' ? (
              <>
                <Button icon={Play} onClick={live.onGolden}>Golden cases</Button>
                {!mine && <Button variant="review" onClick={live.onReview}>Review</Button>}
              </>
            ) : mine ? (
              <>
                <Button icon={Play} onClick={live.onGolden}>Run golden cases</Button>
                <Button loading={busy === 'save'} onClick={() => void press('save')}>Save draft</Button>
                <Button variant="primary" loading={busy === 'send'} onClick={() => void press('send')}>
                  Send for review
                </Button>
              </>
            ) : (
              <Button icon={Play} onClick={live.onGolden}>Golden cases</Button>
            )
          ) : locked ? (
            <Button variant="primary">Copy as new version</Button>
          ) : (
            <>
              <Button>Save draft</Button>
              <Button variant="primary" onClick={() => setTried(true)}>
                Send for review
              </Button>
            </>
          )
        }
      />
      {detail?.review && rs.status === 'changes requested' && (
        <InlineAlert tone="warning" title={`${detail.review.by ?? 'The reviewer'} asked for changes`}>
          {detail.review.note} Change the draft, then send it for review again.
        </InlineAlert>
      )}
      {rs.status === 'in review' && live && (
        <InlineAlert tone="info" title={mine ? 'Waiting for review' : 'Waiting for your review'}>
          {mine ? 'A second member of staff publishes it or asks for changes. You can no longer change it.' : 'Run the golden cases, then publish it or ask for changes.'}
        </InlineAlert>
      )}
      {live && editable && !mine && (
        <InlineAlert tone="info" title={`${rs.draftedBy} is drafting this version`}>
          Only the person who drafted it changes it. You review it once it is sent for review.
        </InlineAlert>
      )}
      {(rs.status === 'published' || rs.status === 'withdrawn') && (
        <InlineAlert tone="info" title="Published versions can't be edited">
          This version is used by payroll runs from {formatDate(rs.validFrom)}. To change it, copy it as a new version with its own effective date.
        </InlineAlert>
      )}
      {(failed && !copyOpen) || (tried && problems.length > 0) ? (
        <div id="rs-problems" tabIndex={-1}>
          <InlineAlert tone="danger" title={failed ? 'Not saved' : 'Fix these before saving'}>
            {failed ?? (
              <ul className="yx-ps-list">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </InlineAlert>
        </div>
      ) : null}
      <div className="yx-split">
        <div className="yx-split__main">
          {slabKind ? (
            <Card
              title="Monthly slabs"
              actions={!locked && <Button size="sm" icon={Plus} onClick={() => setRows((xs) => [...xs, { from: (xs[xs.length - 1]?.to ?? 0) + 1, to: null, amount: 0 }])}>Add row</Button>}
            >
              {errs.length > 0 && !live && (
                <InlineAlert tone="danger" title="Fix the slabs before sending for review">
                  <ul className="yx-ps-list">
                    {errs.map((e) => (
                      <li key={e.message}>{e.message}</li>
                    ))}
                  </ul>
                </InlineAlert>
              )}
              <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Slabs, scrolls sideways on small screens">
                <table className="yx-ps-slabgrid">
                  <caption className="yx-visually-hidden">Slabs</caption>
                  <thead>
                    <tr>
                      <th scope="col">Gross from (₹ a month)</th>
                      <th scope="col">Gross to</th>
                      <th scope="col">PT a month (₹)</th>
                      <th scope="col">
                        <span className="yx-visually-hidden">Remove</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const bad = errs.some((e) => e.row === i);
                      return (
                        <tr key={i} data-invalid={bad || undefined}>
                          {(['from', 'to', 'amount'] as const).map((k) => (
                            <td key={k} data-num>
                              {locked ? (
                                k === 'to' && r.to == null ? 'No limit' : formatINR(r[k] as number)
                              ) : (
                                <input
                                  aria-label={`Row ${i + 1} ${k}`}
                                  value={r[k] == null ? '' : String(r[k])}
                                  placeholder={k === 'to' ? 'No limit' : undefined}
                                  aria-invalid={bad}
                                  inputMode="decimal"
                                  onChange={(e) => set(i, k, e.target.value)}
                                />
                              )}
                            </td>
                          ))}
                          <td>{!locked && <IconButton icon={Trash2} label={`Remove row ${i + 1}`} onClick={() => setRows((xs) => xs.filter((_, j) => j !== i))} />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!live && (
                <div className="yx-ps-stack">
                  <Switch checked={febExtra} onChange={setFebExtra} disabled={locked} label="February carries ₹100 extra at the top slab" description="Karnataka collects ₹300 in February so the year totals ₹2,500." />
                  <p className={overCap ? 'yx-blocknote' : 'yx-ps-muted'} role={overCap ? 'alert' : undefined}>
                    Highest yearly total: {formatINR(annual)} · the law caps professional tax at {formatINR(PT_ANNUAL_CAP)} a year.
                  </p>
                </div>
              )}
            </Card>
          ) : (
            <Card title="Values">
              <FormField label="The rule as data (JSON)" helper="Every kind of rule has its own fields; the shape checks run when you save." error={tried && !parsed ? 'Not valid: an object with a "kind".' : undefined}>
                <TextArea value={valuesText} onChange={setValuesText} rows={14} disabled={locked} spellCheck={false} />
              </FormField>
            </Card>
          )}
          {live ? (
            <Card title="Dates">
              <FieldRow>
                <FormField label="Valid from" required error={tried && !validFrom ? 'Choose the valid-from date.' : undefined}>
                  <DatePicker value={validFrom} onChange={setValidFrom} disabled={locked} />
                </FormField>
                <FormField label="Valid to" optional>
                  <DatePicker value={validTo} onChange={setValidTo} disabled={locked} />
                </FormField>
              </FieldRow>
            </Card>
          ) : (
            <Card title="Conditions">
              <FieldRow>
                <FormField label="Exempt">
                  <Select value="disability" onChange={() => undefined} disabled={locked} options={[{ value: 'disability', label: 'Persons with 40%+ disability' }, { value: 'none', label: 'No exemption' }]} />
                </FormField>
                <FormField label="Applies to">
                  <Select value="all" onChange={() => undefined} disabled={locked} options={[{ value: 'all', label: 'All genders and ages' }]} />
                </FormField>
              </FieldRow>
            </Card>
          )}
        </div>
        <div className="yx-split__aside">
          <Card title="Source (required)">
            {live ? (
              locked ? (
                <p className="yx-ps-p">{source}</p>
              ) : (
                <FormField label="The notification or circular, and where it is" hideLabel error={tried && !sourceOk ? 'Give the source (at least 20 characters).' : undefined}>
                  <TextArea value={source} onChange={setSource} rows={4} />
                </FormField>
              )
            ) : withSource ? (
              <DescriptionList
                items={[
                  { label: 'Document', value: 'Karnataka Gazette notification FD 12 PTX 2026, 12 Sep 2026 (PDF, 412 KB)' },
                  { label: 'URL', value: 'gazette.karnataka.example/2026/fd12' },
                ]}
              />
            ) : (
              <>
                <BlockNote>Attach the gazette notification or circular. A rule set can't go for review without a stored source.</BlockNote>
                <FileUpload upload={() => Promise.resolve()} accept={['.pdf']} multiple={false} />
              </>
            )}
          </Card>
          <Card title="Change note">
            <FormField label="What changed and why" hideLabel>
              <TextArea value={note} onChange={setNote} rows={4} disabled={locked} />
            </FormField>
          </Card>
          {slabKind && (
            <Card title="Payslip label preview">
              <p className="yx-ps-mono yx-ps-p">
                PT {rs.jurisdiction} {rs.version} slab ₹{rows[rows.length - 1]?.from.toLocaleString('en-IN')}+
              </p>
            </Card>
          )}
          <p className="yx-ps-muted">Today {formatDate(today)}. Maker and checker must be different people.</p>
        </div>
      </div>
      {copyDialog}
    </Frame>
  );
}

/* ================================================================== */
/* YX-02 Golden-case runner + review queue                             */
/* ================================================================== */

/** Console C-1 (answers 1042, 1043): golden cases on one version, and the versions waiting for review. */
export interface LiveGolden {
  state: LiveLoad;
  onRetry?: () => void;
  /** The version the runner shows (null: none chosen). */
  detail: LiveRuleDetail | null;
  /** The last dry run of it (null: not run yet in this visit). */
  run: LiveGoldenRun | null;
  onRun: () => Promise<void>;
  /** In review and changes requested, newest first. */
  queue: LiveRuleRow[];
  /** Opens a version (the review drawer reads it). */
  onOpen: (id: string) => void;
  onRequestChanges: (id: string, note: string) => Promise<void>;
  /** Approve: go on to publishing it (YX-03). */
  onApprove: (id: string) => void;
  me: string;
}

// YX-02
/** Golden cases run against a draft; a second person reviews; maker ≠ checker (YX-STAT-04). */
export function GoldenCasesScreen({
  cases: drawnCases = [],
  queue: drawnQueue = [],
  tab = 'runner',
  running: drawnRunning,
  me = '',
  maker = '',
  defaultReviewOpen,
  live,
}: {
  cases?: GoldenCase[];
  queue?: { id: string; title: string; maker: string; submitted: Date; golden: string; status: string }[];
  tab?: 'runner' | 'queue';
  running?: boolean;
  me?: string;
  maker?: string;
  defaultReviewOpen?: boolean;
  live?: LiveGolden;
}) {
  const [open, setOpen] = useState(!!defaultReviewOpen);
  const [decision, setDecision] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [tried, setTried] = useState(false);
  const [runningLive, setRunningLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const { toast } = useToast();
  const d = live?.detail ?? null;
  const cases: GoldenCase[] = live
    ? live.run
      ? live.run.cases.map((c) => ({ id: c.id, statute: '', name: c.name, input: plain(c.input), expected: plain(c.expected), actual: plain(c.actual), pass: c.pass }))
      : (d?.golden ?? []).map((g, i) => ({ id: `g${i}`, statute: '', name: g.name, input: plain(g.input), expected: plain(g.expected), actual: 'Not run yet', pass: true }))
    : drawnCases;
  const ran = !live || !!live.run;
  const running = live ? runningLive : drawnRunning;
  const queue = live
    ? live.queue.map((q) => ({ id: q.id, title: `${q.statute} · ${q.jurisdiction} ${q.version}`, maker: q.draftedByName, submitted: q.sentForReviewAt ? new Date(q.sentForReviewAt) : day(q.validFrom), golden: String(q.golden), status: q.state === 'in review' ? 'Waiting for review' : 'Changes requested' }))
    : drawnQueue;
  const passed = cases.filter((c) => c.pass).length;
  const allPass = ran && passed === cases.length;
  const selfReview = live ? (d && d.draftedBy === live.me ? 'You drafted this version, so a second member of staff reviews it.' : null) : checkerError(maker, me);
  const title = d ? `${d.statute} · ${d.jurisdiction} ${d.version}` : 'IN.PT · Karnataka v2027-04';
  const runNow = async () => {
    if (!live) return;
    setRunningLive(true);
    setFailed(null);
    try {
      await live.onRun();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'The golden cases did not run. Try again.');
    } finally {
      setRunningLive(false);
    }
  };
  const record = async () => {
    setTried(true);
    if (selfReview || !decision) return;
    if (decision === 'changes' && comment.trim().length < 10) {
      document.getElementById('review-comment')?.focus();
      return;
    }
    if (decision === 'approve' && !allPass) return;
    if (!live || !d) return;
    if (decision === 'approve') {
      setOpen(false);
      live.onApprove(d.id);
      return;
    }
    setBusy(true);
    setFailed(null);
    try {
      await live.onRequestChanges(d.id, comment.trim());
      toast({ tone: 'success', title: 'Sent back with your note' });
      setOpen(false);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Not sent. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const before = d?.previous ? (d.values.kind === 'pt' ? slabLines(d.previous.values, formatINR) : [plain(d.previous.values)]) : null;
  const after = d ? (d.values.kind === 'pt' ? slabLines(d.values, formatINR) : [plain(d.values)]) : null;
  if (live && (live.state === 'no-access' || live.state === 'error')) return <Frame live page="Golden cases">{live.state === 'no-access' ? <NoAccess /> : <LoadFailed onRetry={live.onRetry} />}</Frame>;
  return (
    <Frame live={!!live} page="Golden cases">
      <PageHeader
        title="Golden cases and review"
        description="Every statute's golden cases must pass, and a second person must review, before a rule set can be published."
        actions={
          <Button variant="primary" icon={Play} loading={running} onClick={() => void runNow()}>
            Run all cases
          </Button>
        }
      />
      {failed && !open && (
        <InlineAlert tone="danger" title="That did not work">
          {failed}
        </InlineAlert>
      )}
      <Tabs defaultValue={tab}>
        <TabsList aria-label="Golden cases">
          <TabsTrigger value="runner">Runner</TabsTrigger>
          <TabsTrigger value="queue" count={queue.filter((q) => q.status === 'Waiting for review').length}>
            Review queue
          </TabsTrigger>
        </TabsList>
        <TabsContent value="runner">
          <div className="yx-ps-stack">
            {live && !d ? (
              <EmptyState title="Choose a version to run its golden cases." description="Open a version from Rule sets or the review queue." />
            ) : (
              <>
                <FactRow label="Results">
                  <Fact label="Rule set" value={title} />
                  <Fact label="Passed" value={ran ? `${passed} of ${cases.length}` : 'Not run yet'} tone={!ran ? undefined : passed === cases.length ? 'success' : 'danger'} />
                  <Fact label="Last run" value={running ? 'Running…' : live ? (live.run ? `${formatDate(new Date(live.run.ranAt))}, ${timeOf(new Date(live.run.ranAt))}` : 'Not run yet') : '29 Sep 2026, 9:31 am'} />
                </FactRow>
                {live?.run && live.run.problems.length > 0 && (
                  <InlineAlert tone="danger" title="The shape checks fail">
                    <ul className="yx-ps-list">
                      {live.run.problems.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </InlineAlert>
                )}
                {ran && passed < cases.length && !running && (
                  <InlineAlert tone="danger" title={`${cases.length - passed} cases fail, so this version can't be published`}>
                    {live ? 'Change the draft so every case gives the expected result. This run saved nothing.' : 'February is missing the ₹100 extra; the yearly total comes to ₹2,400 instead of ₹2,500.'}
                  </InlineAlert>
                )}
                {live && <p className="yx-ps-muted">A run only checks the version; it saves nothing and changes no company's pay.</p>}
                <FilteredTable
                  label="Golden cases"
                  rows={cases}
                  state={running ? 'loading' : 'ready'}
                  getRowId={(r) => r.id}
                  searchText={(r) => r.name}
                  fields={[{ key: 'pass', label: 'Result', type: 'multi', options: [{ value: 'true', label: 'Passed' }, { value: 'false', label: 'Failed' }] }]}
                  columns={[
                    { key: 'name', header: 'Case', value: (r) => r.name, width: 260 },
                    { key: 'input', header: 'Input', type: 'id', value: (r) => r.input, width: 220 },
                    { key: 'expected', header: 'Expected', value: (r) => r.expected, width: 140 },
                    { key: 'actual', header: 'Actual', value: (r) => r.actual, width: 140 },
                    { key: 'result', header: 'Result', type: 'status', value: (r) => (!ran ? 'Not run' : r.pass ? 'Passed' : 'Failed'), statusTone: (v) => (v === 'Passed' ? 'success' : v === 'Not run' ? 'neutral' : 'danger'), width: 110 },
                  ]}
                  empty={<EmptyState title="No golden cases for this statute yet." action={!live && <Button variant="primary">Add case</Button>} />}
                />
              </>
            )}
          </div>
        </TabsContent>
        <TabsContent value="queue">
          <Card>
            {queue.length === 0 ? (
              <EmptyState compact title="Nothing waits for review." />
            ) : (
              <ul className="yx-ps-list">
                {queue.map((q) => (
                  <li key={q.id}>
                    <div className="yx-ps-list__main">
                      <span className="yx-ps-list__title">{q.title}</span>
                      <span className="yx-ps-list__meta">
                        Drafted by {q.maker} · sent {formatDate(q.submitted)}, {timeOf(q.submitted)} · golden cases {q.golden}
                      </span>
                    </div>
                    <Badge tone={q.status === 'Changes requested' ? 'danger' : 'warning'}>{q.status}</Badge>
                    {q.status === 'Waiting for review' && (
                      <Button
                        variant="review"
                        size="sm"
                        onClick={() => {
                          live?.onOpen(q.id);
                          setDecision(null);
                          setComment('');
                          setTried(false);
                          setFailed(null);
                          setOpen(true);
                        }}
                      >
                        Review
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>
      </Tabs>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title={`Review ${title}`}
        subtitle={`Drafted by ${d ? d.draftedByName : maker}`}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={() => void record()}>
              Record decision
            </Button>
          </>
        }
      >
        <div className="yx-ps-stack">
          {selfReview && (
            <InlineAlert tone="danger" title="You drafted this change">
              {selfReview} {live ? 'Ask another member of staff with the Rules editor key.' : 'Ask Farah Siddiqui or another compliance publisher to review it.'}
            </InlineAlert>
          )}
          {failed && (
            <InlineAlert tone="danger" title="Not recorded">
              {failed}
            </InlineAlert>
          )}
          {live && !d ? (
            <Skeleton height={160} />
          ) : (
            <div className="yx-ps-diff">
              <div>
                <p className="yx-ps-muted">{live ? (d?.previous ? `${d.previous.version} (published)` : 'No earlier version') : 'v2026-04 (published)'}</p>
                {(live ? (before ?? []) : ['₹0 – ₹24,999 → ₹0', '₹25,000+ → ₹200']).map((l) => (
                  <p key={l} className="yx-ps-diff__del">
                    {l}
                  </p>
                ))}
              </div>
              <div>
                <p className="yx-ps-muted">{live ? `${d?.version} (in review)` : 'v2027-04 (draft)'}</p>
                {(live ? (after ?? []) : ['₹0 – ₹29,999 → ₹0', '₹30,000+ → ₹200']).map((l) => (
                  <p key={l} className="yx-ps-diff__add">
                    {l}
                  </p>
                ))}
              </div>
            </div>
          )}
          <DescriptionList
            items={[
              { label: 'Golden cases', value: ran ? `${passed} of ${cases.length} passed` : 'Run them on the Runner tab first' },
              { label: 'Source', value: d ? d.source : 'Karnataka Gazette FD 12 PTX 2026 (stored copy)' },
              ...(d?.changeNote ? [{ label: 'Change note', value: d.changeNote }] : []),
            ]}
          />
          <FormField label="Decision" required error={tried && !decision ? 'Choose a decision.' : undefined}>
            <Select value={decision} onChange={setDecision} options={[{ value: 'approve', label: 'Approve for publishing' }, { value: 'changes', label: 'Request changes' }]} placeholder="Choose" />
          </FormField>
          {decision === 'approve' && !allPass && <BlockNote>{ran ? 'Every golden case must pass before you can approve.' : 'Run the golden cases first: every case must pass before you can approve.'}</BlockNote>}
          <FormField
            id="review-comment"
            label={decision === 'changes' ? 'What to change' : 'Comment'}
            optional={decision !== 'changes'}
            required={decision === 'changes'}
            helper={decision === 'changes' ? 'The drafter reads this. At least 10 characters.' : undefined}
            error={tried && decision === 'changes' && comment.trim().length < 10 ? 'Say what to change (at least 10 characters).' : undefined}
          >
            <TextArea rows={3} value={comment} onChange={setComment} />
          </FormField>
        </div>
      </Drawer>
    </Frame>
  );
}

/* ================================================================== */
/* YX-03 Publish scheduler + tenant impact report                      */
/* ================================================================== */

/** Console C-1 (answers 1041, 1044): publishing a version in review, with its impact as numbers only. */
export interface LivePublish {
  state: LiveLoad;
  onRetry?: () => void;
  /** Versions in review that someone else drafted (only those can be published by me). */
  choices: LiveRuleRow[];
  chosen: string | null;
  onChoose: (id: string) => void;
  detail: LiveRuleDetail | null;
  impact: LiveImpact | null;
  /** Publishes the chosen version; the security key is asked again. */
  onPublish: (id: string) => Promise<void>;
  /** After publishing: what was published (shown as done). */
  published: LiveRuleRow | null;
}

// YX-03
/** Wizard: pick approved version → effective date (future applies on the day; past-dated makes arrears proposals, never silent recalculation) → impact → notices → publish. */
export function PublishSchedulerScreen({ current = 'version', pastDated: drawnPast, done, live }: { current?: string; pastDated?: boolean; done?: boolean; live?: LivePublish }) {
  const [date, setDate] = useState<Date | null>(drawnPast ? new Date(2026, 3, 1) : new Date(2027, 3, 1));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const { toast } = useToast();
  if (live && (live.state === 'no-access' || live.state === 'error')) return <Frame live page="Publish scheduler">{live.state === 'no-access' ? <NoAccess /> : <LoadFailed onRetry={live.onRetry} />}</Frame>;
  if (live?.published)
    return (
      <Frame live page="Publish scheduler">
        <PageHeader title="Publish a rule set" />
        <InlineAlert tone="success" title={`${live.published.statute} · ${live.published.jurisdiction} ${live.published.version} is published`}>
          {day(live.published.validFrom) > new Date()
            ? `It applies automatically on ${formatDate(day(live.published.validFrom))}.`
            : `It applies from ${formatDate(day(live.published.validFrom))}. Companies whose payroll already ran for months since then get arrears proposals to decide; nothing is recalculated silently.`}
        </InlineAlert>
      </Frame>
    );
  if (done && !live)
    return (
      <Console page="Publish scheduler">
        <PageHeader title="Publish a rule set" />
        <InlineAlert tone="success" title="IN.PT · Karnataka v2027-04 is scheduled">
          It applies automatically on 1 Apr 2027. 1,184 tenants were notified in-app and by email; a reminder goes 7 days before. Banners show until 8 Apr 2027.
        </InlineAlert>
      </Console>
    );
  const d = live?.detail ?? null;
  const im = live?.impact ?? null;
  const pastDated = live ? !!im?.pastDated || (!!d && day(d.validFrom) < new Date()) : drawnPast;
  const name = d ? `${d.statute} · ${d.jurisdiction} ${d.version}` : 'IN.PT · Karnataka v2027-04';
  const num = (n: number | null | undefined) => (n == null ? 'Cannot be counted' : n.toLocaleString('en-IN'));
  const publish = async () => {
    if (!live) return;
    if (!live.chosen) {
      setFailed('Choose a version in review first.');
      return;
    }
    setBusy(true);
    setFailed(null);
    try {
      await live.onPublish(live.chosen);
      toast({ tone: 'success', title: 'Published' });
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Not published. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const steps = [
    {
      id: 'version',
      title: 'Version',
      description: 'Approved and ready',
      content: live ? (
        live.choices.length ? (
          <FormField label="Rule set" required helper="Versions in review that someone else drafted.">
            <Select value={live.chosen} onChange={(v) => v && live.onChoose(v)} placeholder="Choose" options={live.choices.map((c) => ({ value: c.id, label: `${c.statute} · ${c.jurisdiction} ${c.version} · drafted by ${c.draftedByName}` }))} />
          </FormField>
        ) : (
          <EmptyState compact title="Nothing to publish." description="A version is published once its drafter sends it for review; you publish only what someone else drafted." />
        )
      ) : (
        <FormField label="Rule set" required>
          <Select value="rs1" onChange={() => undefined} options={[{ value: 'rs1', label: 'IN.PT · Karnataka v2027-04 · approved by Farah Siddiqui' }]} />
        </FormField>
      ),
      summary: live ? (d ? name : 'Not chosen') : 'IN.PT · Karnataka v2027-04',
    },
    {
      id: 'date',
      title: 'Effective date',
      content: (
        <div className="yx-ps-stack">
          {live ? (
            <DescriptionList items={[{ label: 'Effective from', value: d ? formatDate(day(d.validFrom)) : 'Choose a version' }, { label: 'Until', value: d?.validTo ? formatDate(day(d.validTo)) : 'Open' }]} />
          ) : (
            <FormField label="Effective from" required>
              <DatePicker value={date} onChange={setDate} />
            </FormField>
          )}
          {pastDated ? (
            <InlineAlert tone="warning" title="This date is in the past">
              {live
                ? 'Companies whose payroll already ran for months since then get an arrears proposal for each. Nothing is recalculated silently; their payroll admins decide.'
                : 'Processed payroll for 312 tenants (Apr–Sep 2026) is flagged and an arrears proposal is created for each. Nothing is recalculated silently; payroll admins decide.'}
            </InlineAlert>
          ) : (
            <p className="yx-ps-muted">{live ? 'The date is set in the draft. ' : ''}Future-dated versions apply automatically on the day.</p>
          )}
        </div>
      ),
      summary: live ? (d ? formatDate(day(d.validFrom)) : 'Not set') : date ? formatDate(date) : 'Not set',
    },
    {
      id: 'impact',
      title: 'Tenant impact',
      content: live ? (
        !d ? (
          <EmptyState compact title="Choose a version to see its impact." />
        ) : !im ? (
          <Skeleton height={120} />
        ) : (
          <div className="yx-ps-stack">
            <FactRow label="Impact">
              <Fact label="Companies affected" value={num(im.companies)} />
              <Fact label="Employees affected" value={num(im.employees)} />
            </FactRow>
            <p className="yx-ps-muted">
              {im.countable ? `People working in ${d.jurisdiction} today, counted across companies. Numbers only: no company or person is named.` : `${d.jurisdiction} is not a place with locations, so it cannot be counted.`}
            </p>
            {im.countable && (
              <BarChart
                title="Employees affected, by company size"
                xLabel="Company size"
                categories={im.bySize.map((b) => b.size)}
                groupSizes={im.bySize.map((b) => b.companies)}
                series={[{ name: 'Employees', values: im.bySize.map((b) => b.employees) }]}
              />
            )}
          </div>
        )
      ) : (
        <div className="yx-ps-stack">
          <FactRow label="Impact">
            <Fact label="Tenants affected" value="1,184" />
            <Fact label="Employees affected" value="2,14,630" />
            <Fact label="Employees whose PT changes" value="38,412" tone="warning" />
            {drawnPast && <Fact label="Arrears proposals" value="312" tone="danger" />}
          </FactRow>
          <BarChart
            title="Employees whose PT drops to ₹0, by tenant size"
            xLabel="Tenant size"
            categories={['Under 50', '50–200', '200–1,000', '1,000+']}
            series={[{ name: 'Employees', values: [2_140, 9_870, 14_300, 12_102] }]}
          />
        </div>
      ),
      summary: live ? (im ? `${num(im.companies)} companies · ${num(im.employees)} employees` : 'Not counted yet') : '1,184 tenants · 2,14,630 employees',
    },
    ...(live
      ? []
      : [
          {
            id: 'notices',
            title: 'Notices',
            content: (
              <div className="yx-ps-stack">
                <Checkbox defaultChecked label="Email and in-app notice to Payroll Admins and HR Admins at publication" />
                <Checkbox defaultChecked label="Reminder 7 days before the effective date" />
                <Checkbox defaultChecked label="Banner from publication until 7 days after the effective date" />
                <FormField label="Employee summary (shown on payslip help)">
                  <TextArea rows={3} defaultValue="From April 2027, professional tax in Karnataka starts at ₹30,000 a month instead of ₹25,000." />
                </FormField>
              </div>
            ),
            summary: 'Admins notified, reminder, banner',
          },
        ]),
  ];
  return (
    <Frame live={!!live} page="Publish scheduler">
      <PageHeader title="Publish a rule set" description="Only approved versions with all golden cases passing can be published." />
      {failed && (
        <InlineAlert tone="danger" title="Not published">
          {failed}
        </InlineAlert>
      )}
      <Stepper
        title="Publish rule set"
        defaultCurrent={current}
        finishLabel="Publish rule set"
        review={{ description: live ? 'Check the version, date and impact. You confirm with your security key.' : 'Check the version, date, impact and notices.' }}
        onFinish={live ? () => void publish() : undefined}
        finishing={busy}
        steps={steps}
      />
    </Frame>
  );
}

/* ================================================================== */
/* YX-05 AI governance console                                         */
/* ================================================================== */

type AiRow = { feature: string; version: string; provider: string; model: string; region: string; euClass: string; status: 'draft' | 'approved' | 'live' | 'retired'; evalResult: string };
const AI_TONE: Record<AiRow['status'], BadgeTone> = { draft: 'neutral', approved: 'info', live: 'success', retired: 'neutral' };

// YX-05
/** Model / prompt registry, eval runs, drift, bias (4/5ths), red-team log, promotion gate with second review, kill switch. */
export function AiGovernanceScreen({
  registry,
  drift,
  bias,
  redTeam,
  tab = 'registry',
  gateOpen,
  history,
}: {
  registry: AiRow[];
  drift: { weeks: string[]; helpdesk: number[]; scoring: number[] };
  bias: { group: string; ratio: number }[];
  redTeam: { date: Date; test: string; result: string; feature: string }[];
  tab?: 'registry' | 'drift' | 'bias' | 'redteam';
  gateOpen?: boolean;
  history: ActivityEntry[];
}) {
  const [gate, setGate] = useState(!!gateOpen);
  const [kill, setKill] = useState(false);
  const failing = bias.filter((b) => b.ratio < 0.8);
  return (
    <Console page="AI governance">
      <PageHeader title="AI governance" description="Aggregate figures only; no tenant content. High-risk features stay off for EU tenants until 2 Dec 2027." />
      <Tabs defaultValue={tab}>
        <TabsList aria-label="AI governance">
          <TabsTrigger value="registry">Registry</TabsTrigger>
          <TabsTrigger value="drift">Drift</TabsTrigger>
          <TabsTrigger value="bias" count={failing.length}>
            Bias
          </TabsTrigger>
          <TabsTrigger value="redteam">Red-team log</TabsTrigger>
        </TabsList>
        <TabsContent value="registry">
          <FilteredTable
            label="Model and prompt registry"
            rows={registry}
            getRowId={(r) => r.feature + r.version}
            searchText={(r) => r.feature}
            fields={[{ key: 'status', label: 'Status', type: 'multi', options: opts(['draft', 'approved', 'live', 'retired']) }]}
            columns={[
              { key: 'feature', header: 'Feature', type: 'id', value: (r) => r.feature, width: 220 },
              { key: 'version', header: 'Version', value: (r) => r.version, width: 80 },
              { key: 'provider', header: 'Provider · model', value: (r) => `${r.provider} · ${r.model}`, width: 240 },
              { key: 'region', header: 'Region', value: (r) => r.region, width: 80 },
              { key: 'eu', header: 'EU AI Act', value: (r) => r.euClass, width: 200 },
              { key: 'eval', header: 'Latest eval', value: (r) => r.evalResult, width: 280 },
              { key: 'status', header: 'Status', type: 'status', value: (r) => cap(r.status), statusTone: (v) => AI_TONE[String(v).toLowerCase() as AiRow['status']], width: 100 },
            ]}
            rowButtons={(r) => (r.status === 'draft' || r.status === 'approved' ? <Button size="sm" onClick={() => setGate(true)}>Promote</Button> : null)}
            rowActions={() => (
              <>
                <MenuItem>View eval runs</MenuItem>
                <MenuItem destructive onSelect={() => setKill(true)}>
                  Kill switch
                </MenuItem>
              </>
            )}
          />
        </TabsContent>
        <TabsContent value="drift">
          <Card>
            <LineChart title="Drift index by week" description="Alert above 0.2 (control band)" xLabel="Week" categories={drift.weeks} series={[{ name: 'helpdesk.answer', values: drift.helpdesk }, { name: 'assess.interview_scoring', values: drift.scoring }]} target={{ value: 0.2, label: 'Alert 0.2' }} />
          </Card>
          <InlineAlert tone="warning" title="helpdesk.answer drifted above the band on 22 Sep">
            Answers cite older policy versions more often. An eval rerun is scheduled; consider the kill switch if the rate of confidently wrong answers passes 2%.
          </InlineAlert>
        </TabsContent>
        <TabsContent value="bias">
          <Card>
            <BarChart title="Adverse-impact ratio, assess.interview_scoring 1.7" description="4/5ths rule: below 0.80 blocks release" xLabel="Group" categories={bias.map((b) => b.group)} series={[{ name: 'Impact ratio', values: bias.map((b) => b.ratio) }]} />
          </Card>
          {failing.length > 0 && (
            <InlineAlert tone="danger" title={`Release blocked: ${failing.map((f) => f.group).join(', ')} below 0.80`}>
              Version 1.7 can't be promoted until the gap is fixed and the quarterly check is rerun.
            </InlineAlert>
          )}
        </TabsContent>
        <TabsContent value="redteam">
          <Card title="Red-team log" actions={<Button size="sm" icon={Plus}>Log test</Button>}>
            <ul className="yx-ps-list">
              {redTeam.map((r) => (
                <li key={r.test}>
                  <div className="yx-ps-list__main">
                    <span className="yx-ps-list__title">{r.test}</span>
                    <span className="yx-ps-list__meta">
                      {r.feature} · {formatDate(r.date)}
                    </span>
                  </div>
                  <Badge tone={r.result === 'Blocked' ? 'success' : 'warning'}>{r.result}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>
      </Tabs>
      <Card title="Change history">
        <ActivityFeed entries={history} today={new Date(2026, 8, 29, 9, 42)} />
      </Card>
      <Drawer
        open={gate}
        onOpenChange={setGate}
        size="lg"
        title="Promotion gate · assess.interview_scoring 1.7"
        subtitle="Goes live only if every threshold passes and a second person reviews."
        footer={
          <>
            <Button onClick={() => setGate(false)}>Cancel</Button>
            <Button variant="primary" disabled>
              Promote to live
            </Button>
          </>
        }
      >
        <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Gate checks, scrolls sideways on small screens">
        <table className="yx-ps-slabgrid">
          <caption className="yx-visually-hidden">Gate checks</caption>
          <thead>
            <tr>
              <th scope="col">Check</th>
              <th scope="col">Threshold</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Agreement with trained raters (kappa)', '≥ 0.70', '0.72', true],
              ['Lowest criterion kappa', '≥ 0.60', '0.54 (problem solving)', false],
              ['Adverse-impact ratio, all groups', '≥ 0.80', '0.77 (tier-2/3 college)', false],
              ['No significant regression vs 1.6', 'None', 'None', true],
              ['Second reviewer', 'Not the author', 'Not assigned', false],
            ].map(([c, t, r, ok]) => (
              <tr key={String(c)} data-invalid={!ok || undefined}>
                <th scope="row">{c}</th>
                <td>{t}</td>
                <td>
                  {r} <Badge tone={ok ? 'success' : 'danger'}>{ok ? 'Pass' : 'Fail'}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Drawer>
      <ConfirmDialog
        open={kill}
        onOpenChange={setKill}
        destructive
        title="Switch off helpdesk.answer for every tenant?"
        consequence="Employees get the non-AI help search instead. Tenants see a notice. You can switch it back on."
        confirmLabel="Switch off"
        onConfirm={() => undefined}
      >
        <FormField label="Reason" required>
          <TextField defaultValue="Drift above band; confidently wrong rate 2.6%" />
        </FormField>
      </ConfirmDialog>
    </Console>
  );
}
