// YukthiX console: statutory rule sets (YX-01), golden cases and review (YX-02), publish scheduler (YX-03), AI governance (YX-05).
import { useState } from 'react';
import { FileText, Play, Plus, Trash2, Upload } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { EmptyState, InlineAlert } from '../../components/feedback';
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

const RS_TONE: Record<RuleSet['status'], BadgeTone> = { draft: 'neutral', 'in review': 'warning', published: 'success', withdrawn: 'danger' };
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/* ================================================================== */
/* YX-01 Rule-set editor                                               */
/* ================================================================== */

// YX-01
/** Rule-set list and editor: slab grid with contiguity checks, PT ₹2,500 cap, mandatory source upload; published versions are never edited. */
export function RuleSetEditorScreen({
  sets,
  openId,
  slabs: initialSlabs,
  withSource = true,
  state = 'ready',
  today,
}: {
  sets: RuleSet[];
  openId?: string;
  slabs: SlabRow[];
  withSource?: boolean;
  state?: 'ready' | 'loading' | 'error';
  today: Date;
}) {
  const rs = sets.find((s) => s.id === openId);
  const [rows, setRows] = useState(initialSlabs);
  const [febExtra, setFebExtra] = useState(true);
  if (!rs)
    return (
      <Console page="Rule sets">
        <PageHeader title="Rule sets" description="Statutory rules as data. A published version is never edited; a fix is a new version." actions={<Button variant="primary" icon={Plus}>New version</Button>} />
        <FilteredTable
          label="Rule sets"
          rows={sets}
          state={state}
          getRowId={(r) => r.id}
          searchText={(r) => `${r.statute} ${r.jurisdiction} ${r.version}`}
          fields={[
            { key: 'statute', label: 'Statute', type: 'multi', options: opts(Array.from(new Set(sets.map((s) => s.statute)))) },
            { key: 'status', label: 'Status', type: 'multi', options: opts(['draft', 'in review', 'published', 'withdrawn']) },
          ]}
          views={[{ id: 'all', name: 'All rule sets' }, { id: 'review', name: 'Waiting for review', shared: true }]}
          viewFilters={{ review: [{ key: 'status', type: 'multi', values: ['in review'] }] }}
          empty={<EmptyState title="No rule sets yet." action={<Button variant="primary">New version</Button>} />}
          columns={[
            { key: 'statute', header: 'Statute', type: 'id', value: (r) => r.statute, width: 110 },
            { key: 'jurisdiction', header: 'Jurisdiction', value: (r) => r.jurisdiction, width: 130 },
            { key: 'shape', header: 'Shape', value: (r) => r.shape, width: 90 },
            { key: 'version', header: 'Version', type: 'id', value: (r) => r.version, width: 110 },
            { key: 'validFrom', header: 'Valid from', type: 'date', value: (r) => r.validFrom, width: 120 },
            { key: 'law', header: 'Law version', value: (r) => r.lawVersion + (r.transitional ? ' · transitional' : ''), width: 220 },
            { key: 'status', header: 'Status', type: 'status', value: (r) => cap(r.status), statusTone: (v) => RS_TONE[String(v).toLowerCase() as RuleSet['status']], width: 120 },
            { key: 'draftedBy', header: 'Drafted by', value: (r) => r.draftedBy, width: 140 },
          ]}
          rowActions={() => (
            <>
              <MenuItem>Open</MenuItem>
              <MenuItem>Copy as new version</MenuItem>
            </>
          )}
        />
      </Console>
    );
  const locked = rs.status === 'published';
  const errs = slabErrors(rows);
  const annual = ptAnnualMax(rows, febExtra ? 100 : 0);
  const overCap = annual > PT_ANNUAL_CAP;
  const set = (i: number, k: keyof SlabRow, v: string) =>
    setRows((xs) => xs.map((r, j) => (j === i ? { ...r, [k]: k === 'to' && v.trim() === '' ? null : Number(v.replace(/\D/g, '')) } : r)));
  return (
    <Console page="Rule sets">
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
          locked ? (
            <Button variant="primary">Copy as new version</Button>
          ) : (
            <>
              <Button>Save draft</Button>
              <Button variant="primary" disabled={errs.length > 0 || overCap || !withSource}>
                Send for review
              </Button>
            </>
          )
        }
      />
      {locked && (
        <InlineAlert tone="info" title="Published versions can't be edited">
          This version is used by payroll runs from {formatDate(rs.validFrom)}. To change it, copy it as a new version with its own effective date.
        </InlineAlert>
      )}
      <div className="yx-split">
        <div className="yx-split__main">
          <Card
            title="Monthly slabs"
            actions={!locked && <Button size="sm" icon={Plus} onClick={() => setRows((xs) => [...xs, { from: (xs[xs.length - 1]?.to ?? 0) + 1, to: null, amount: 0 }])}>Add row</Button>}
          >
            {errs.length > 0 && (
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
                              inputMode="numeric"
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
            <div className="yx-ps-stack">
              <Switch checked={febExtra} onChange={setFebExtra} disabled={locked} label="February carries ₹100 extra at the top slab" description="Karnataka collects ₹300 in February so the year totals ₹2,500." />
              <p className={overCap ? 'yx-blocknote' : 'yx-ps-muted'} role={overCap ? 'alert' : undefined}>
                Highest yearly total: {formatINR(annual)} · the law caps professional tax at {formatINR(PT_ANNUAL_CAP)} a year.
              </p>
            </div>
          </Card>
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
        </div>
        <div className="yx-split__aside">
          <Card title="Source (required)">
            {withSource ? (
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
              <TextArea defaultValue={rs.changeNote} rows={4} disabled={locked} />
            </FormField>
          </Card>
          <Card title="Payslip label preview">
            <p className="yx-ps-mono yx-ps-p">
              PT {rs.jurisdiction} {rs.version} slab ₹{rows[rows.length - 1]?.from.toLocaleString('en-IN')}+
            </p>
          </Card>
          <p className="yx-ps-muted">Today {formatDate(today)}. Maker and checker must be different people.</p>
        </div>
      </div>
    </Console>
  );
}

/* ================================================================== */
/* YX-02 Golden-case runner + review queue                             */
/* ================================================================== */

// YX-02
/** Golden cases run against a draft; a second person reviews; maker ≠ checker (YX-STAT-04). */
export function GoldenCasesScreen({
  cases,
  queue,
  tab = 'runner',
  running,
  me,
  maker,
  defaultReviewOpen,
}: {
  cases: GoldenCase[];
  queue: { id: string; title: string; maker: string; submitted: Date; golden: string; status: string }[];
  tab?: 'runner' | 'queue';
  running?: boolean;
  me: string;
  maker: string;
  defaultReviewOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultReviewOpen);
  const [decision, setDecision] = useState<string | null>(null);
  const passed = cases.filter((c) => c.pass).length;
  const selfReview = checkerError(maker, me);
  return (
    <Console page="Golden cases">
      <PageHeader
        title="Golden cases and review"
        description="Every statute's golden cases must pass, and a second person must review, before a rule set can be published."
        actions={
          <Button variant="primary" icon={Play} loading={running}>
            Run all cases
          </Button>
        }
      />
      <Tabs defaultValue={tab}>
        <TabsList aria-label="Golden cases">
          <TabsTrigger value="runner">Runner</TabsTrigger>
          <TabsTrigger value="queue" count={queue.filter((q) => q.status === 'Waiting for review').length}>
            Review queue
          </TabsTrigger>
        </TabsList>
        <TabsContent value="runner">
          <div className="yx-ps-stack">
            <FactRow label="Results">
              <Fact label="Rule set" value="IN.PT · Karnataka v2027-04" />
              <Fact label="Passed" value={`${passed} of ${cases.length}`} tone={passed === cases.length ? 'success' : 'danger'} />
              <Fact label="Last run" value={running ? 'Running…' : '29 Sep 2026, 9:31 am'} />
            </FactRow>
            {passed < cases.length && !running && (
              <InlineAlert tone="danger" title={`${cases.length - passed} cases fail, so this version can't be published`}>
                February is missing the ₹100 extra; the yearly total comes to ₹2,400 instead of ₹2,500.
              </InlineAlert>
            )}
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
                { key: 'expected', header: 'Expected', value: (r) => r.expected, width: 100 },
                { key: 'actual', header: 'Actual', value: (r) => r.actual, width: 100 },
                { key: 'result', header: 'Result', type: 'status', value: (r) => (r.pass ? 'Passed' : 'Failed'), statusTone: (v) => (v === 'Passed' ? 'success' : 'danger'), width: 110 },
              ]}
              empty={<EmptyState title="No golden cases for this statute yet." action={<Button variant="primary">Add case</Button>} />}
            />
          </div>
        </TabsContent>
        <TabsContent value="queue">
          <Card>
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
                  <Button variant="review" size="sm" onClick={() => setOpen(true)}>
                    Review
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>
      </Tabs>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title="Review IN.PT · Karnataka v2027-04"
        subtitle={`Drafted by ${maker}`}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={!!selfReview || !decision || (decision === 'approve' && passed < cases.length)}>
              Record decision
            </Button>
          </>
        }
      >
        <div className="yx-ps-stack">
          {selfReview && (
            <InlineAlert tone="danger" title="You drafted this change">
              {selfReview} Ask Farah Siddiqui or another compliance publisher to review it.
            </InlineAlert>
          )}
          <div className="yx-ps-diff">
            <div>
              <p className="yx-ps-muted">v2026-04 (published)</p>
              <p className="yx-ps-diff__del">₹0 – ₹24,999 → ₹0</p>
              <p className="yx-ps-diff__del">₹25,000+ → ₹200</p>
            </div>
            <div>
              <p className="yx-ps-muted">v2027-04 (draft)</p>
              <p className="yx-ps-diff__add">₹0 – ₹29,999 → ₹0</p>
              <p className="yx-ps-diff__add">₹30,000+ → ₹200</p>
            </div>
          </div>
          <DescriptionList items={[{ label: 'Golden cases', value: `${passed} of ${cases.length} passed` }, { label: 'Source', value: 'Karnataka Gazette FD 12 PTX 2026 (stored copy)' }]} />
          <FormField label="Decision" required>
            <Select value={decision} onChange={setDecision} options={[{ value: 'approve', label: 'Approve for publishing' }, { value: 'changes', label: 'Request changes' }]} placeholder="Choose" />
          </FormField>
          {decision === 'approve' && passed < cases.length && <BlockNote>Every golden case must pass before you can approve.</BlockNote>}
          <FormField label="Comment" optional>
            <TextArea rows={3} />
          </FormField>
        </div>
      </Drawer>
    </Console>
  );
}

/* ================================================================== */
/* YX-03 Publish scheduler + tenant impact report                      */
/* ================================================================== */

// YX-03
/** Wizard: pick approved version → effective date (future applies on the day; past-dated makes arrears proposals, never silent recalculation) → impact → notices → publish. */
export function PublishSchedulerScreen({ current = 'version', pastDated, done }: { current?: string; pastDated?: boolean; done?: boolean }) {
  const [date, setDate] = useState<Date | null>(pastDated ? new Date(2026, 3, 1) : new Date(2027, 3, 1));
  if (done)
    return (
      <Console page="Publish scheduler">
        <PageHeader title="Publish a rule set" />
        <InlineAlert tone="success" title="IN.PT · Karnataka v2027-04 is scheduled">
          It applies automatically on 1 Apr 2027. 1,184 tenants were notified in-app and by email; a reminder goes 7 days before. Banners show until 8 Apr 2027.
        </InlineAlert>
      </Console>
    );
  return (
    <Console page="Publish scheduler">
      <PageHeader title="Publish a rule set" description="Only approved versions with all golden cases passing can be published." />
      <Stepper
        title="Publish rule set"
        defaultCurrent={current}
        finishLabel="Publish rule set"
        review={{ description: 'Check the version, date, impact and notices.' }}
        steps={[
          {
            id: 'version',
            title: 'Version',
            description: 'Approved and ready',
            content: (
              <FormField label="Rule set" required>
                <Select value="rs1" onChange={() => undefined} options={[{ value: 'rs1', label: 'IN.PT · Karnataka v2027-04 · approved by Farah Siddiqui' }]} />
              </FormField>
            ),
            summary: 'IN.PT · Karnataka v2027-04',
          },
          {
            id: 'date',
            title: 'Effective date',
            content: (
              <div className="yx-ps-stack">
                <FormField label="Effective from" required>
                  <DatePicker value={date} onChange={setDate} />
                </FormField>
                {pastDated ? (
                  <InlineAlert tone="warning" title="This date is in the past">
                    Processed payroll for 312 tenants (Apr–Sep 2026) is flagged and an arrears proposal is created for each. Nothing is recalculated silently; payroll admins
                    decide.
                  </InlineAlert>
                ) : (
                  <p className="yx-ps-muted">Future-dated versions apply automatically on the day.</p>
                )}
              </div>
            ),
            summary: date ? formatDate(date) : 'Not set',
          },
          {
            id: 'impact',
            title: 'Tenant impact',
            content: (
              <div className="yx-ps-stack">
                <FactRow label="Impact">
                  <Fact label="Tenants affected" value="1,184" />
                  <Fact label="Employees affected" value="2,14,630" />
                  <Fact label="Employees whose PT changes" value="38,412" tone="warning" />
                  {pastDated && <Fact label="Arrears proposals" value="312" tone="danger" />}
                </FactRow>
                <BarChart
                  title="Employees whose PT drops to ₹0, by tenant size"
                  xLabel="Tenant size"
                  categories={['Under 50', '50–200', '200–1,000', '1,000+']}
                  series={[{ name: 'Employees', values: [2_140, 9_870, 14_300, 12_102] }]}
                />
              </div>
            ),
            summary: '1,184 tenants · 2,14,630 employees',
          },
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
        ]}
      />
    </Console>
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
