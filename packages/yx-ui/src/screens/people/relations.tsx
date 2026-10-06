// PPL-36 Possible same person · PPL-37 Merge / unmerge (P01 YX-ORG-26 / 27)
// PPL-39 Union register · PPL-40 VRS scheme · PPL-42 Re-verification cycles (M01 §3.11).
import { useState } from 'react';
import { FileText, GitMerge, Mail, Plus, Split } from 'lucide-react';
import { Button } from '../../components/button';
import { Card, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { Drawer } from '../../components/drawer';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Select } from '../../components/select';
import { TextArea } from '../../components/inputs';
import { RadioGroup, Switch } from '../../components/choice';
import { ConfirmDialog } from '../../components/overlay';
import { MenuItem } from '../../components/menu';
import { Text } from '../../components/foundations';
import { formatDate, formatINR } from '../../lib/format';
import { matchPersons, reverificationDue, type Persona } from './people-logic';
import { MATCHES, REVERIFY, UNIONS, VRS } from './people-data';
import { CompareTable, MeFrame, PeopleFrame } from './people-kit';

/* ================================================================== PPL-36 same-person queue */

type Match = (typeof MATCHES)[number];
const KEYS: { label: string; k: keyof Match['left'] }[] = [
  { label: 'Name', k: 'name' },
  { label: 'Date of birth', k: 'dob' },
  { label: 'Email', k: 'email' },
  { label: 'Phone', k: 'phone' },
  { label: 'PAN', k: 'pan' },
  { label: 'UAN', k: 'uan' },
  { label: 'Role', k: 'role' },
];

// PPL-36
export function SamePersonQueue({ rows, defaultOpenId }: { rows: Match[]; defaultOpenId?: string }) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId ?? null);
  const proposals = rows.map((r) => ({ ...r, result: matchPersons(r.left, r.right, r.face) })).filter((r) => r.result.kind === 'propose');
  const open = proposals.find((r) => r.id === openId);
  const cols: TableColumn<(typeof proposals)[number]>[] = [
    { key: 'left', header: 'Record A', value: (r) => r.left.name, render: (r) => <span>{r.left.name}<Text size="sm" tone="secondary" as="div">{r.left.role}</Text></span>, width: 260 },
    { key: 'right', header: 'Record B', value: (r) => r.right.name, render: (r) => <span>{r.right.name}<Text size="sm" tone="secondary" as="div">{r.right.role}</Text></span>, width: 260 },
    { key: 'basis', header: 'Why proposed', value: (r) => r.result.basis.join(', '), width: 280 },
  ];
  return (
    <PeopleFrame active="Possible same person">
      <PageHeader title="Possible same person" description="Verified email, phone, PAN or UAN link records automatically. Name and date of birth, or a consented face match, only propose a link for you to check. A name alone never links." />
      <DataTable
        label="Proposed matches"
        columns={cols}
        rows={proposals}
        getRowId={(r) => r.id}
        onRowClick={(r) => setOpenId(r.id)}
        activeRowId={openId}
        rowButtons={(r) => <Button size="sm" onClick={() => setOpenId(r.id)}>Compare</Button>}
        empty={<EmptyState title="No possible matches" description="New proposals appear when a new record looks like an existing person." />}
      />
      <Drawer
        open={!!open}
        onOpenChange={(o) => !o && setOpenId(null)}
        size="lg"
        title="Are these the same person?"
        subtitle={open ? `Proposed on ${open.result.basis.join(' and ')}` : undefined}
        footer={
          <>
            <Button onClick={() => setOpenId(null)}>Not the same person</Button>
            <Button variant="primary" icon={GitMerge}>
              Same person: review merge
            </Button>
          </>
        }
      >
        {open && (
          <div className="yx-ppl__stack">
            <CompareTable caption="Evidence side by side" left="Record A" right="Record B" rows={KEYS.map((k) => ({ label: k.label, a: open.left[k.k], b: open.right[k.k] }))} highlight={(l) => KEYS.some((k) => k.label === l && open.left[k.k] && open.left[k.k] === open.right[k.k])} />
            {open.face && <InlineAlert tone="info">Face match ran because both records have recorded consent. No images are shown here.</InlineAlert>}
            <Text size="sm" tone="secondary" as="p">Rows in green match exactly. Your decision is logged with its basis; a merge can be undone.</Text>
          </div>
        )}
      </Drawer>
    </PeopleFrame>
  );
}

/* ================================================================== PPL-37 merge / unmerge */

const MERGE_FIELDS = [
  { label: 'Name', a: 'Suresh Nair', b: 'Suresh K Nair', pick: 'b' },
  { label: 'Primary email', a: 'suresh.nair90@mailbox.example', b: 'suresh.n@kaverifoods.in (alumni, inactive)', pick: 'a' },
  { label: 'Primary phone', a: '+91 98860 11223', b: '+91 98860 11224', pick: 'a' },
  { label: 'Date of birth', a: '11 Feb 1990', b: '11 Feb 1990', pick: 'a' },
  { label: 'PAN', a: '—', b: 'XXXXXX712Q', pick: 'b' },
  { label: 'UAN', a: '—', b: 'XXXXXXXX3344', pick: 'b' },
];

// PPL-37
export function MergeReview({ mode = 'merge', noteError = false }: { mode?: 'merge' | 'unmerge'; noteError?: boolean }) {
  const [picks, setPicks] = useState(Object.fromEntries(MERGE_FIELDS.map((f) => [f.label, f.pick])));
  const [confirm, setConfirm] = useState(false);
  if (mode === 'unmerge')
    return (
      <PeopleFrame active="Possible same person">
        <ObjectHeader name="Suresh K Nair" person secondary="Merged on 26 Sep 2026 by Lakshmi Venkatesan · basis: name + date of birth, confirmed by HR" status={<Badge tone="info">Merged record</Badge>} actions={<Button icon={Split} variant="danger" onClick={() => setConfirm(true)}>Unmerge</Button>} />
        <Card title="What unmerge restores">
          <ul className="yx-ppl__successors">
            <li><span>Candidate role APP-2026-1188 with its application, tests and documents</span><Badge tone="neutral">Back to record A</Badge></li>
            <li><span>Alumnus role and employment KF-0077 history</span><Badge tone="neutral">Stays on record B</Badge></li>
            <li><span>Field choices made at merge (name, email, phone)</span><Badge tone="neutral">Original values return</Badge></li>
          </ul>
        </Card>
        <ConfirmDialog open={confirm || noteError} onOpenChange={setConfirm} title="Unmerge Suresh K Nair?" consequence="Each role, document and history row goes back to the person it came from. The link log keeps both actions." confirmLabel="Unmerge" destructive onConfirm={() => setConfirm(false)}>
          <FormField label="Audit note" required error={noteError ? 'Enter a reason for the audit log.' : null}>
            <TextArea rows={2} />
          </FormField>
        </ConfirmDialog>
      </PeopleFrame>
    );
  return (
    <PeopleFrame active="Possible same person">
      <PageHeader title="Merge two records" description="Pick the value to keep for each field. Every role moves to the merged person; nothing is deleted and you can unmerge later." />
      <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
      <table className="yx-ppl__impact">
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Record A · candidate</th>
            <th scope="col">Record B · alumnus</th>
            <th scope="col">Keep</th>
          </tr>
        </thead>
        <tbody>
          {MERGE_FIELDS.map((f) => (
            <tr key={f.label}>
              <th scope="row">{f.label}</th>
              <td className="yx-mono">{f.a}</td>
              <td className="yx-mono">{f.b}</td>
              <td>
                <RadioGroup aria-label={`Keep ${f.label}`} orientation="horizontal" value={picks[f.label]} onChange={(v) => setPicks({ ...picks, [f.label]: v })} options={[{ value: 'a', label: 'A', disabled: f.a === '—' }, { value: 'b', label: 'B', disabled: f.b === '—' }]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <Card title="Roles that move to the merged person">
        <ul className="yx-ppl__successors">
          <li><span>Candidate · APP-2026-1188 (Maintenance Technician)</span><Badge tone="info">Moves</Badge></li>
          <li><span>Alumnus · employment KF-0077, 2019 to 14 Feb 2025, rehire eligible</span><Badge tone="neutral">Stays</Badge></li>
        </ul>
        <Text size="sm" tone="secondary" as="p">The application now shows "Ex-employee" to the recruiter and the rehire path applies.</Text>
      </Card>
      <div className="yx-ppl__form">
        <FormField label="Audit note" required error={noteError ? 'Enter why you are merging. It goes to the link log.' : null}>
          <TextArea rows={2} defaultValue={noteError ? '' : 'Same DOB, near-identical phone; confirmed by call with the candidate on 26 Sep.'} />
        </FormField>
        <div className="yx-ppl__row">
          <Button>Cancel</Button>
          <Button variant="primary" icon={GitMerge}>
            Merge records
          </Button>
        </div>
      </div>
    </PeopleFrame>
  );
}

/* ================================================================== PPL-39 union register */

type Union = (typeof UNIONS)[number];

// PPL-39
export function UnionRegister({ rows, defaultOpenId }: { rows: Union[]; defaultOpenId?: string }) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId ?? null);
  const open = rows.find((r) => r.id === openId);
  const cols: TableColumn<Union>[] = [
    { key: 'name', header: 'Union', value: (r) => r.name, render: (r) => <span>{r.name}<Text size="sm" tone="secondary" as="div" className="yx-mono">{r.reg}</Text></span>, width: 280 },
    { key: 'establishment', header: 'Establishment', value: (r) => r.establishment, width: 200 },
    { key: 'recognised', header: 'Recognition', type: 'status', value: (r) => r.recognised, statusTone: (v) => (v === 'Recognised' ? 'success' : 'neutral'), width: 150 },
    { key: 'to', header: 'Valid to', type: 'date', value: (r) => r.to, width: 130 },
    { key: 'members', header: 'Members', type: 'number', value: (r) => r.members, total: 'sum', width: 110 },
  ];
  return (
    <PeopleFrame active="Union register">
      <PageHeader title="Union register" description="Unions per establishment with recognition basis and office bearers. Membership is Confidential: HR industrial relations and payroll (for check-off only)." actions={<Button variant="primary" icon={Plus}>Add union</Button>} />
      <DataTable label="Unions" columns={cols} rows={rows} getRowId={(r) => r.id} onRowClick={(r) => setOpenId(r.id)} activeRowId={openId} empty={<EmptyState title="No unions recorded" description="Add unions registered at your establishments." action={<Button variant="primary">Add union</Button>} />} />
      <Drawer open={!!open} onOpenChange={(o) => !o && setOpenId(null)} title={open?.name ?? ''} subtitle={open?.reg} meta={open && <Badge tone={open.recognised === 'Recognised' ? 'success' : 'neutral'}>{open.recognised}</Badge>} footer={<><Button onClick={() => setOpenId(null)}>Close</Button><Button variant="primary">Edit union</Button></>}>
        {open && (
          <div className="yx-ppl__stack">
            <dl className="yx-ppl__rail-facts">
              <div><dt>Establishment</dt><dd>{open.establishment}</dd></div>
              <div><dt>Recognition</dt><dd>{open.recognised} · {open.basis}</dd></div>
              <div><dt>Valid</dt><dd>{open.from ? `${formatDate(open.from)} to ${formatDate(open.to)}` : '—'}</dd></div>
              <div><dt>Office bearers</dt><dd>{open.bearers}</dd></div>
              <div><dt>Members</dt><dd>{open.members} · {Math.round(open.members * 0.9)} with check-off consent</dd></div>
            </dl>
            <InlineAlert tone="info">Lay-off, strike and lockout days from Time appear on each member's timeline, not here.</InlineAlert>
          </div>
        )}
      </Drawer>
    </PeopleFrame>
  );
}

/* ================================================================== PPL-40 VRS */

type VrsApp = (typeof VRS.applications)[number];

// PPL-40
export function VrsScheme({ tab = 'applications', persona = 'hr', eligible = true }: { tab?: 'setup' | 'applications'; persona?: Persona; eligible?: boolean }) {
  const [t, setT] = useState(tab);
  if (persona === 'emp')
    return (
      <MeFrame active="My exit">
        <PageHeader title={VRS.name} description={`Open ${formatDate(VRS.window[0])} to ${formatDate(VRS.window[1])}. ${VRS.eligibility}.`} />
        {eligible ? (
          <>
            <Card title="Your estimate">
              <dl className="yx-ppl__rail-facts">
                <div><dt>Scheme benefit</dt><dd className="yx-ppl__num">{formatINR(1296000)} (45 days × 24 years)</dd></div>
                <div><dt>On top: gratuity</dt><dd className="yx-ppl__num">{formatINR(1034000)}</dd></div>
                <div><dt>On top: leave encashment (42 days)</dt><dd className="yx-ppl__num">{formatINR(84000)}</dd></div>
              </dl>
              <Text size="sm" tone="secondary" as="p">Estimate only. Tax treatment follows the income tax rules for VRS. Final amounts come in your F&F.</Text>
            </Card>
            <div className="yx-ppl__form">
              <FormField label="Preferred last working day" required>
                <Select options={[{ value: '30n', label: '30 Nov 2026' }, { value: '31d', label: '31 Dec 2026' }]} value="30n" onChange={() => {}} />
              </FormField>
              <div className="yx-ppl__row"><Button>Cancel</Button><Button variant="primary">Apply for VRS</Button></div>
            </div>
          </>
        ) : (
          <InlineAlert tone="info" title="You're not eligible for this scheme">It needs age 50+ and 10+ years at Hosur plant. You have 7 years. Talk to HR if you think this is wrong.</InlineAlert>
        )}
      </MeFrame>
    );
  const cols: TableColumn<VrsApp>[] = [
    { key: 'name', header: 'Applicant', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: `Age ${r.age} · ${r.service} years` }), width: 200 },
    { key: 'benefit', header: 'Scheme benefit', type: 'money', value: (r) => r.benefit, total: 'sum', width: 140 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (String(v).startsWith('Approved') ? 'success' : v === 'Withdrawn' ? 'neutral' : 'warning'), width: 240 },
  ];
  return (
    <PeopleFrame active="VRS schemes">
      <ObjectHeader name={VRS.name} icon={FileText} secondary={`Window ${formatDate(VRS.window[0])} to ${formatDate(VRS.window[1])} · ${VRS.eligible} eligible`} status={<Badge tone="success">Open</Badge>} actions={<Button variant="primary" icon={Mail}>Issue scheme letters</Button>} />
      <Tabs value={t} onValueChange={(v) => setT(v as 'setup' | 'applications')}>
        <TabsList aria-label="VRS scheme">
          <TabsTrigger value="applications" count={VRS.applications.length}>Applications</TabsTrigger>
          <TabsTrigger value="setup">Set-up</TabsTrigger>
        </TabsList>
        <TabsContent value="applications">
          <DataTable label="VRS applications" columns={cols} rows={VRS.applications} getRowId={(r) => r.id} rowButtons={(r) => (r.status.startsWith('Pending HR') ? (<><Button size="sm">Reject</Button><Button variant="approve" size="sm">Approve</Button></>) : null)} rowActions={() => <MenuItem>Open exit case</MenuItem>} empty={<EmptyState title="No applications yet" description="Eligible employees can apply from Me while the window is open." />} />
        </TabsContent>
        <TabsContent value="setup">
          <div className="yx-ppl__form">
            <FormField label="Eligibility rule" helper="Built in the rule builder. 38 people match today.">
              <Text as="p">{VRS.eligibility}</Text>
            </FormField>
            <FormField label="Benefit formula">
              <Text as="p">{VRS.benefit}</Text>
            </FormField>
            <FormField label="Approval">
              <Select options={[{ value: 'm-hr', label: 'Manager, then HR head' }]} value="m-hr" onChange={() => {}} />
            </FormField>
            <InlineAlert tone="info">Approved applications open exit cases of type VRS. Gratuity, leave encashment and notice rules apply on top of the scheme benefit.</InlineAlert>
          </div>
        </TabsContent>
      </Tabs>
    </PeopleFrame>
  );
}

/* ================================================================== PPL-42 re-verification */

type Rv = (typeof REVERIFY)[number];

// PPL-42
export function ReverificationCycles({ rows, today }: { rows: Rv[]; today: Date }) {
  const cols: TableColumn<Rv>[] = [
    { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name }), width: 200 },
    { key: 'trigger', header: 'Why', value: (r) => r.trigger, width: 260 },
    { key: 'due', header: 'Due', type: 'date', value: (r) => r.due, width: 130 },
    { key: 'when', header: 'Due status', type: 'status', value: (r) => reverificationDue(r.last, 3, today), statusTone: (v) => (v === 'overdue' ? 'danger' : v === 'due soon' ? 'warning' : 'neutral'), width: 130 },
    { key: 'consent', header: 'Consent', value: (r) => r.consent, width: 180 },
    { key: 'result', header: 'Outcome', type: 'status', value: (r) => r.result, statusTone: (v) => (String(v).startsWith('Adverse') || v === 'HR review' ? 'danger' : String(v).startsWith('Clear') ? 'success' : 'info'), width: 180 },
  ];
  return (
    <PeopleFrame active="Re-verification">
      <PageHeader title="Re-verification" description="Background re-checks run only by company rule, each with fresh consent. A refusal or adverse finding opens an HR review; nothing changes automatically." />
      <Card title="Rules">
        <div className="yx-ppl__stack">
          <Switch label="Every 3 years for Quality, Finance and Payroll roles" defaultChecked />
          <Switch label="On a role change into a sensitive role" defaultChecked />
          <Switch label="When a client contract requires it (client tag)" defaultChecked />
        </div>
      </Card>
      <DataTable
        label="Re-verification due list"
        columns={cols}
        rows={rows}
        getRowId={(r) => r.id}
        rowButtons={(r) => (r.consent === 'Not yet asked' ? <Button size="sm">Ask for consent</Button> : r.result.includes('review') ? <Button size="sm">Open review</Button> : null)}
        empty={<EmptyState title="No re-verification due" description="People appear here when a rule makes a re-check due." />}
      />
      <Text size="sm" tone="secondary" as="p">Reports are Confidential; adverse findings are Special.</Text>
    </PeopleFrame>
  );
}
