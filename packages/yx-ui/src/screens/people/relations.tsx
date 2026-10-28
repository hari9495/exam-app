// PPL-36 Possible same person · PPL-37 Merge / unmerge (P01 YX-ORG-26 / 27)
// PPL-39 Union register · PPL-40 VRS scheme · PPL-42 Re-verification cycles (M01 §3.11).
import { useState } from 'react';
import { ErrorState } from '../../components/feedback';
import { ListSkeleton } from './people-kit';
import { ApplyDialog, ClosureDialog, DecideDialog, SchemeDialog, type RetrenchmentScreenProps } from './live/special';
import type { IrPermission } from './live/types';
import { FileText, GitMerge, Mail, Plus, Split } from 'lucide-react';
import { Button } from '../../components/button';
import { Card, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { Drawer } from '../../components/drawer';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert, NoAccessState } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { TextArea, TextField } from '../../components/inputs';
import { RadioGroup, Switch } from '../../components/choice';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { MenuItem } from '../../components/menu';
import { Text } from '../../components/foundations';
import { formatDate, formatINR } from '../../lib/format';
import { matchPersons, type Persona } from './people-logic';
import { MATCHES, UNIONS, VRS } from './people-data';
import { CompareTable, MeFrame, PeopleFrame, Segment } from './people-kit';
import { errorText, useRun } from '../org/org-kit';

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

/** One record of a live proposal: its own fields, and the employee's the viewer may see (masked). */
export interface PersonSide {
  personId: string;
  name: string;
  email: string | null;
  phone: string | null;
  dob: string | null;
  pan: string | null;
  uan: string | null;
  role: string;
  roles: { id: string; role: string; from: string }[];
}
export interface SamePersonRow {
  id: string;
  a: PersonSide;
  b: PersonSide;
  basis: string[];
}
/** PPL-36 live: the proposals, and HR's two decisions (the page shows the toast). */
export interface LiveSamePerson {
  state: 'loading' | 'error' | 'ready';
  onRetry: () => void;
  rows: SamePersonRow[];
  onNotSame: (row: SamePersonRow) => Promise<void>;
  onReviewMerge: (row: SamePersonRow) => void;
}

const sideKeys = (s: PersonSide): Match['left'] => ({ name: s.name, dob: s.dob ? formatDate(new Date(`${s.dob}T00:00:00`)) : '', email: s.email ?? '', phone: s.phone ?? '', pan: s.pan ?? '', uan: s.uan ?? '', role: s.role });

// PPL-36
export function SamePersonQueue({ rows, defaultOpenId, live }: { rows: Match[]; defaultOpenId?: string; live?: LiveSamePerson }) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId ?? null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const proposals = live
    ? live.rows.map((r) => ({ id: r.id, left: sideKeys(r.a), right: sideKeys(r.b), face: false, result: { kind: 'propose' as const, basis: r.basis } }))
    : rows.map((r) => ({ ...r, result: matchPersons(r.left, r.right, r.face) })).filter((r) => r.result.kind === 'propose');
  const open = proposals.find((r) => r.id === openId);
  const same = (l: string) => KEYS.some((k) => k.label === l && open && open.left[k.k] && open.left[k.k].toLowerCase() === open.right[k.k].toLowerCase());
  const cols: TableColumn<(typeof proposals)[number]>[] = [
    { key: 'left', header: 'Record A', value: (r) => r.left.name, render: (r) => <span>{r.left.name}<Text size="sm" tone="secondary" as="div">{r.left.role}</Text></span>, width: 260 },
    { key: 'right', header: 'Record B', value: (r) => r.right.name, render: (r) => <span>{r.right.name}<Text size="sm" tone="secondary" as="div">{r.right.role}</Text></span>, width: 260 },
    { key: 'basis', header: 'Why proposed', value: (r) => r.result.basis.join(', '), width: 280 },
  ];
  const close = () => (setOpenId(null), setFailed(null));
  const notSame = async () => {
    const row = live?.rows.find((r) => r.id === openId);
    if (!row) return close();
    setBusy(true);
    try {
      await live!.onNotSame(row);
      close();
    } catch (e) {
      setFailed(errorText(e));
    }
    setBusy(false);
  };
  return (
    <PeopleFrame active="Possible same person">
      <PageHeader
        title="Possible same person"
        description={live ? 'A record with only a login or a help desk contact is listed when its email is another person’s email or work email. Check the evidence before you merge. A name alone never links.' : 'Verified email, phone, PAN or UAN link records automatically. Name and date of birth, or a consented face match, only propose a link for you to check. A name alone never links.'}
      />
      {live?.state === 'error' ? (
        <ErrorState title="We couldn't load the proposals" description="Check your connection and try again." onRetry={live.onRetry} />
      ) : live?.state === 'loading' ? (
        <ListSkeleton label="Loading the proposals" />
      ) : (
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
      )}
      <Drawer
        open={!!open}
        onOpenChange={(o) => !o && close()}
        size="lg"
        title="Are these the same person?"
        subtitle={open ? `Proposed on ${open.result.basis.join(' and ')}` : undefined}
        notice={failed && <InlineAlert tone="danger" title="That didn't work">{failed}</InlineAlert>}
        footer={
          <>
            <Button onClick={live ? () => void notSame() : close} loading={busy}>Not the same person</Button>
            <Button variant="primary" icon={GitMerge} onClick={live && open ? () => live.onReviewMerge(live.rows.find((r) => r.id === open.id)!) : undefined}>
              Same person: review merge
            </Button>
          </>
        }
      >
        {open && (
          <div className="yx-ppl__stack">
            <CompareTable caption="Evidence side by side" left="Record A" right="Record B" rows={KEYS.map((k) => ({ label: k.label, a: open.left[k.k], b: open.right[k.k] }))} highlight={same} />
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

export type MergeKeep = { name: 'a' | 'b'; email: 'a' | 'b'; phone: 'a' | 'b' };
/** PPL-37 live: merging the proposal's record A into record B (the page shows the toast and moves on). */
export interface LiveMerge {
  row: SamePersonRow;
  onMerge: (keep: MergeKeep, note: string) => Promise<void>;
  onCancel: () => void;
}
/** PPL-37 live: a merged record and what unmerge puts back. */
export interface LiveUnmerge {
  name: string;
  intoName: string;
  mergedAt: Date;
  mergedBy: string | null;
  note: string | null;
  moved: string[];
  employeeLinked: boolean;
  onUnmerge: (note: string) => Promise<void>;
}

/** The fields a live merge shows; only the person's own (name, email, phone) can come from record A. */
function liveFields(r: SamePersonRow) {
  const v = (x: string | null) => x || '—';
  const dob = (x: string | null) => (x ? formatDate(new Date(`${x}T00:00:00`)) : '—');
  return [
    { key: 'name', label: 'Name', a: r.a.name, b: r.b.name, pick: 'b' },
    { key: 'email', label: 'Primary email', a: v(r.a.email), b: v(r.b.email), pick: r.b.email ? 'b' : 'a' },
    { key: 'phone', label: 'Primary phone', a: v(r.a.phone), b: v(r.b.phone), pick: r.b.phone || !r.a.phone ? 'b' : 'a' },
    { key: 'dob', label: 'Date of birth', a: dob(r.a.dob), b: dob(r.b.dob), pick: 'b' },
    { key: 'pan', label: 'PAN', a: v(r.a.pan), b: v(r.b.pan), pick: 'b' },
    { key: 'uan', label: 'UAN', a: v(r.a.uan), b: v(r.b.uan), pick: 'b' },
  ];
}

// The header names the kind of record only, as designed ("Record B · employee"); the code stays in the rows.
const kindOf = (role: string) => role.split(' · ')[0].toLowerCase();

// PPL-37
export function MergeReview({ mode = 'merge', noteError = false, live, liveUnmerge }: { mode?: 'merge' | 'unmerge'; noteError?: boolean; live?: LiveMerge; liveUnmerge?: LiveUnmerge }) {
  const fields = live ? liveFields(live.row) : MERGE_FIELDS;
  const [picks, setPicks] = useState(Object.fromEntries(fields.map((f) => [f.label, f.pick])));
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const { run, busy, error } = useRun();
  if (mode === 'unmerge' || liveUnmerge) {
    const u = liveUnmerge;
    return (
      <PeopleFrame active="Possible same person">
        <ObjectHeader
          name={u ? u.name : 'Suresh K Nair'}
          person
          secondary={u ? `Merged into ${u.intoName} on ${formatDate(u.mergedAt)}${u.mergedBy ? ` by ${u.mergedBy}` : ''} · basis: same email, confirmed by HR` : 'Merged on 26 Sep 2026 by Lakshmi Venkatesan · basis: name + date of birth, confirmed by HR'}
          status={<Badge tone="info">Merged record</Badge>}
          actions={<Button icon={Split} variant="danger" onClick={() => (setNote(''), setTried(false), setConfirm(true))}>Unmerge</Button>}
        />
        <Card title="What unmerge restores">
          <div className="yx-ppl__stack">
          {u ? (
            <ul className="yx-ppl__successors">
              {u.moved.map((r, i) => (
                <li key={`${r}-${i}`}><span>{r} role</span><Badge tone="neutral">Back to record A</Badge></li>
              ))}
              {u.employeeLinked && <li><span>The login linked to {u.intoName}’s employee record</span><Badge tone="neutral">Comes off it</Badge></li>}
              <li><span>Field choices made at merge (name, email, phone)</span><Badge tone="neutral">Original values return</Badge></li>
              <li><span>{u.intoName}’s own roles and records</span><Badge tone="neutral">Stay on record B</Badge></li>
            </ul>
          ) : (
            <ul className="yx-ppl__successors">
              <li><span>Candidate role APP-2026-1188 with its application, tests and documents</span><Badge tone="neutral">Back to record A</Badge></li>
              <li><span>Alumnus role and employment KF-0077 history</span><Badge tone="neutral">Stays on record B</Badge></li>
              <li><span>Field choices made at merge (name, email, phone)</span><Badge tone="neutral">Original values return</Badge></li>
            </ul>
          )}
          {(u ? u.note : true) && <Text size="sm" tone="secondary" as="p">Merge note: {u ? u.note : 'Same DOB, near-identical phone; confirmed by call with the candidate on 26 Sep.'}</Text>}
          </div>
        </Card>
        <ConfirmDialog
          open={confirm || (!u && noteError)}
          onOpenChange={setConfirm}
          title={`Unmerge ${u ? u.name : 'Suresh K Nair'}?`}
          consequence="Each role, document and history row goes back to the person it came from. The link log keeps both actions."
          confirmLabel="Unmerge"
          destructive
          onConfirm={async () => {
            if (!u) return setConfirm(false);
            setTried(true);
            if (!note.trim()) return false;
            await u.onUnmerge(note.trim());
          }}
        >
          <FormField label="Audit note" required error={(u ? tried && !note.trim() : noteError) ? 'Enter a reason for the audit log.' : null}>
            <TextArea rows={2} value={note} onChange={setNote} maxLength={1000} />
          </FormField>
        </ConfirmDialog>
      </PeopleFrame>
    );
  }
  const r = live?.row;
  const merge = () => {
    setTried(true);
    if (!note.trim()) return;
    void run('merge', () => live!.onMerge({ name: picks.Name as 'a' | 'b', email: picks['Primary email'] as 'a' | 'b', phone: picks['Primary phone'] as 'a' | 'b' }, note.trim()));
  };
  const noteMissing = live ? tried && !note.trim() : noteError;
  return (
    <PeopleFrame active="Possible same person">
      <PageHeader title="Merge two records" description="Pick the value to keep for each field. Every role moves to the merged person; nothing is deleted and you can unmerge later." />
      <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
      <table className="yx-ppl__impact">
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">{r ? `Record A · ${kindOf(r.a.role)}` : 'Record A · candidate'}</th>
            <th scope="col">{r ? `Record B · ${kindOf(r.b.role)}` : 'Record B · alumnus'}</th>
            <th scope="col">Keep</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
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
        {r ? (
          <ul className="yx-ppl__successors">
            {r.a.roles.map((x) => (
              <li key={x.id}><span>{x.role} · from {formatDate(new Date(`${x.from}T00:00:00`))}</span><Badge tone="info">Moves</Badge></li>
            ))}
            {r.b.roles.map((x) => (
              <li key={x.id}><span>{x.role} · from {formatDate(new Date(`${x.from}T00:00:00`))}</span><Badge tone="neutral">Stays</Badge></li>
            ))}
          </ul>
        ) : (
          <>
            <ul className="yx-ppl__successors">
              <li><span>Candidate · APP-2026-1188 (Maintenance Technician)</span><Badge tone="info">Moves</Badge></li>
              <li><span>Alumnus · employment KF-0077, 2019 to 14 Feb 2025, rehire eligible</span><Badge tone="neutral">Stays</Badge></li>
            </ul>
            <Text size="sm" tone="secondary" as="p">The application now shows "Ex-employee" to the recruiter and the rehire path applies.</Text>
          </>
        )}
      </Card>
      <div className="yx-ppl__form">
        <FormField label="Audit note" required error={noteMissing ? 'Enter why you are merging. It goes to the link log.' : null}>
          {live ? <TextArea rows={2} value={note} onChange={setNote} maxLength={1000} /> : <TextArea rows={2} defaultValue={noteError ? '' : 'Same DOB, near-identical phone; confirmed by call with the candidate on 26 Sep.'} />}
        </FormField>
        {error && <InlineAlert tone="danger" title="Not merged">{error}</InlineAlert>}
        <div className="yx-ppl__row">
          <Button onClick={live?.onCancel}>Cancel</Button>
          <Button variant="primary" icon={GitMerge} loading={busy === 'merge'} onClick={live ? merge : undefined}>
            Merge records
          </Button>
        </div>
      </div>
    </PeopleFrame>
  );
}

/* ================================================================== PPL-39 union register */

type Union = (typeof UNIONS)[number];

/** One union on the live register (PPL-39). Dates are ISO days. */
export interface LiveUnion {
  id: string;
  name: string;
  registrationNo: string | null;
  legalEntityId: string;
  locationId: string | null;
  establishment: string;
  recognition: 'recognised' | 'not_recognised';
  basis: string | null;
  validFrom: string | null;
  validTo: string | null;
  bearers: string | null;
  /** Workers who signed a check-off authorisation for this union today. */
  checkOff: number;
}
export type UnionInput = Omit<LiveUnion, 'id' | 'establishment' | 'checkOff'>;
/** The live app's union register: the legal entities whose register the person keeps (industrial relations). */
export interface LiveUnionRegister {
  state: 'loading' | 'ready' | 'error' | 'no-access' | 'forbidden';
  onRetry: () => void;
  data: { entities: { id: string; name: string }[]; unions: LiveUnion[] } | null;
  locations: { value: string; label: string; entityId: string }[];
  onSave: (id: string | null, input: UnionInput) => Promise<void>;
}

const RECOGNITION = [
  { value: 'recognised' as const, label: 'Recognised' },
  { value: 'not_recognised' as const, label: 'Not recognised' },
];
const isoOf = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null);
const dayOrNull = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00`) : null);

/** Add or edit a union: the establishment, recognition and its basis, the period and the office bearers. */
export function UnionDialog({ union, entities, locations, onClose, onSave }: { union: LiveUnion | null; entities: { value: string; label: string }[]; locations: { value: string; label: string; entityId: string }[]; onClose: () => void; onSave: (id: string | null, input: UnionInput) => Promise<void> }) {
  const [entity, setEntity] = useState<string | null>(union?.legalEntityId ?? (entities.length === 1 ? entities[0].value : null));
  const [name, setName] = useState(union?.name ?? '');
  const [reg, setReg] = useState(union?.registrationNo ?? '');
  const [location, setLocation] = useState<string | null>(union?.locationId ?? null);
  const [recognition, setRecognition] = useState<'recognised' | 'not_recognised'>(union?.recognition ?? 'not_recognised');
  const [basis, setBasis] = useState(union?.basis ?? '');
  const [from, setFrom] = useState<Date | null>(dayOrNull(union?.validFrom ?? null));
  const [to, setTo] = useState<Date | null>(dayOrNull(union?.validTo ?? null));
  const [bearers, setBearers] = useState(union?.bearers ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const needBasis = recognition === 'recognised' && !basis.trim();
  const badDates = Boolean(from && to && to < from);
  const can = Boolean(entity && name.trim().length >= 2 && !needBasis && !badDates);
  const save = async () => {
    if (!entity) return;
    setSaving(true);
    try {
      await onSave(union?.id ?? null, { legalEntityId: entity, name: name.trim(), registrationNo: reg.trim() || null, locationId: location, recognition, basis: basis.trim() || null, validFrom: isoOf(from), validTo: isoOf(to), bearers: bearers.trim() || null });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={union ? `Edit ${union.name}` : 'Add a union'}
      size="md"
      preventClose={saving}
      notice={error && <InlineAlert tone="danger">{error}</InlineAlert>}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!can} loading={saving} onClick={() => void save()}>
            {union ? 'Save union' : 'Add union'}
          </Button>
        </>
      }
    >
      <div className="yx-ppl__form">
        <FormField label="Legal entity" required>
          <Select options={entities} value={entity} onChange={(v) => (setEntity(v), setLocation(null))} disabled={!!union} placeholder="Choose a legal entity" />
        </FormField>
        <FormField label="Union name" required>
          <TextField value={name} onChange={setName} maxLength={200} />
        </FormField>
        <FormField label="Registration number">
          <TextField value={reg} onChange={setReg} maxLength={60} />
        </FormField>
        <FormField label="Establishment" helper="Leave empty when the union covers the whole legal entity.">
          <Select options={locations.filter((l) => l.entityId === entity)} value={location} onChange={setLocation} placeholder="The whole legal entity" />
        </FormField>
        <FormField label="Recognition" required>
          <Segment label="Recognition" options={RECOGNITION} value={recognition} onChange={setRecognition} />
        </FormField>
        <FormField label="Basis" required={recognition === 'recognised'} error={needBasis ? 'Say on what basis the union is recognised.' : null} helper="For example: sole negotiating union, 58% of workers.">
          <TextField value={basis} onChange={setBasis} maxLength={200} />
        </FormField>
        <div className="yx-ppl__row">
          <FormField label="Valid from">
            <DatePicker value={from} onChange={setFrom} />
          </FormField>
          <FormField label="Valid to" error={badDates ? 'The end date must be on or after the start date.' : null}>
            <DatePicker value={to} onChange={setTo} />
          </FormField>
        </div>
        <FormField label="Office bearers">
          <TextArea rows={2} value={bearers} onChange={setBearers} maxLength={500} placeholder="President Murugesan V · Secretary Selvi R" />
        </FormField>
      </div>
    </Dialog>
  );
}

function LiveUnionRegisterScreen({ live }: { live: LiveUnionRegister }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<LiveUnion | 'new' | null>(null);
  const rows = live.data?.unions ?? [];
  const open = rows.find((r) => r.id === openId);
  const entities = (live.data?.entities ?? []).map((e) => ({ value: e.id, label: e.name }));
  const recognised = (r: LiveUnion) => (r.recognition === 'recognised' ? 'Recognised' : 'Not recognised');
  const cols: TableColumn<LiveUnion>[] = [
    { key: 'name', header: 'Union', value: (r) => r.name, render: (r) => <span>{r.name}{r.registrationNo && <Text size="sm" tone="secondary" as="div" className="yx-mono">{r.registrationNo}</Text>}</span>, width: 210 },
    { key: 'establishment', header: 'Establishment', value: (r) => r.establishment, width: 150 },
    { key: 'recognised', header: 'Recognition', type: 'status', value: recognised, statusTone: (v) => (v === 'Recognised' ? 'success' : 'neutral'), width: 120 },
    { key: 'to', header: 'Valid to', type: 'date', value: (r) => dayOrNull(r.validTo), width: 110 },
    { key: 'checkOff', header: 'With check-off', type: 'number', value: (r) => r.checkOff, total: 'sum', width: 100 },
  ];
  const add = (
    <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
      Add union
    </Button>
  );
  if (live.state === 'forbidden')
    return (
      <PeopleFrame active="Union register">
        <PageHeader title="Union register" />
        <NoAccessState what="the union register" grantedBy="your HR admin" note="Union membership is Confidential: HR industrial relations only." />
      </PeopleFrame>
    );
  return (
    <PeopleFrame active="Union register">
      <PageHeader title="Union register" description="Unions per establishment with recognition basis and office bearers. Membership is Confidential: HR industrial relations and payroll (for check-off only)." actions={entities.length ? add : undefined} />
      {live.state === 'no-access' ? (
        <NoAccessState what="the union register" grantedBy="your HR admin" />
      ) : live.state === 'error' ? (
        <ErrorState title="We couldn't load the union register" description="Check your connection and try again." onRetry={live.onRetry} />
      ) : !live.data ? (
        <ListSkeleton label="Loading the union register" />
      ) : (
        <DataTable label="Unions" columns={cols} rows={rows} getRowId={(r) => r.id} onRowClick={(r) => setOpenId(r.id)} activeRowId={openId} empty={<EmptyState title="No unions recorded" description="Add unions registered at your establishments." action={entities.length ? add : undefined} />} />
      )}
      <Drawer
        open={!!open}
        onOpenChange={(o) => !o && setOpenId(null)}
        title={open?.name ?? ''}
        subtitle={open?.registrationNo ?? undefined}
        meta={open && <Badge tone={open.recognition === 'recognised' ? 'success' : 'neutral'}>{recognised(open)}</Badge>}
        footer={
          <>
            <Button onClick={() => setOpenId(null)}>Close</Button>
            <Button variant="primary" onClick={() => open && setEditing(open)}>
              Edit union
            </Button>
          </>
        }
      >
        {open && (
          <div className="yx-ppl__stack">
            <dl className="yx-ppl__rail-facts">
              <div><dt>Establishment</dt><dd>{open.establishment}</dd></div>
              <div><dt>Recognition</dt><dd>{recognised(open)}{open.basis ? ` · ${open.basis}` : ''}</dd></div>
              <div><dt>Valid</dt><dd>{open.validFrom ? `${formatDate(dayOrNull(open.validFrom)!)}${open.validTo ? ` to ${formatDate(dayOrNull(open.validTo)!)}` : ' onwards'}` : '—'}</dd></div>
              <div><dt>Office bearers</dt><dd>{open.bearers ?? '—'}</dd></div>
              <div><dt>Check-off</dt><dd>{open.checkOff} {open.checkOff === 1 ? 'worker has' : 'workers have'} signed a check-off authorisation</dd></div>
            </dl>
            <InlineAlert tone="info">Lay-off, strike and lockout days from Time appear on each member&apos;s timeline, not here.</InlineAlert>
          </div>
        )}
      </Drawer>
      {editing && <UnionDialog union={editing === 'new' ? null : editing} entities={entities} locations={live.locations} onClose={() => setEditing(null)} onSave={live.onSave} />}
    </PeopleFrame>
  );
}

// PPL-39
export function UnionRegister(props: { rows: Union[]; defaultOpenId?: string; live?: LiveUnionRegister }) {
  return props.live ? <LiveUnionRegisterScreen live={props.live} /> : <SampleUnionRegister {...props} />;
}

function SampleUnionRegister({ rows, defaultOpenId }: { rows: Union[]; defaultOpenId?: string }) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId ?? null);
  const open = rows.find((r) => r.id === openId);
  const cols: TableColumn<Union>[] = [
    { key: 'name', header: 'Union', value: (r) => r.name, render: (r) => <span>{r.name}<Text size="sm" tone="secondary" as="div" className="yx-mono">{r.reg}</Text></span>, width: 210 },
    { key: 'establishment', header: 'Establishment', value: (r) => r.establishment, width: 150 },
    { key: 'recognised', header: 'Recognition', type: 'status', value: (r) => r.recognised, statusTone: (v) => (v === 'Recognised' ? 'success' : 'neutral'), width: 120 },
    { key: 'to', header: 'Valid to', type: 'date', value: (r) => r.to, width: 110 },
    { key: 'checkOff', header: 'With check-off', type: 'number', value: (r) => Math.round(r.members * 0.9), total: 'sum', width: 100 },
  ];
  const [editing, setEditing] = useState(false);
  return (
    <PeopleFrame active="Union register">
      <PageHeader title="Union register" description="Unions per establishment with recognition basis and office bearers. Membership is Confidential: HR industrial relations and payroll (for check-off only)." actions={<Button variant="primary" icon={Plus} onClick={() => setEditing(true)}>Add union</Button>} />
      <DataTable label="Unions" columns={cols} rows={rows} getRowId={(r) => r.id} onRowClick={(r) => setOpenId(r.id)} activeRowId={openId} empty={<EmptyState title="No unions recorded" description="Add unions registered at your establishments." action={<Button variant="primary" onClick={() => setEditing(true)}>Add union</Button>} />} />
      {editing && <UnionDialog union={null} entities={[{ value: 'kf', label: 'Kaveri Foods Pvt Ltd' }]} locations={[{ value: 'hsr', label: 'Hosur plant', entityId: 'kf' }]} onClose={() => setEditing(false)} onSave={async () => {}} />}
      <Drawer open={!!open} onOpenChange={(o) => !o && setOpenId(null)} title={open?.name ?? ''} subtitle={open?.reg} meta={open && <Badge tone={open.recognised === 'Recognised' ? 'success' : 'neutral'}>{open.recognised}</Badge>} footer={<><Button onClick={() => setOpenId(null)}>Close</Button><Button variant="primary" onClick={() => setEditing(true)}>Edit union</Button></>}>
        {open && (
          <div className="yx-ppl__stack">
            <dl className="yx-ppl__rail-facts">
              <div><dt>Establishment</dt><dd>{open.establishment}</dd></div>
              <div><dt>Recognition</dt><dd>{open.recognised} · {open.basis}</dd></div>
              <div><dt>Valid</dt><dd>{open.from ? `${formatDate(open.from)} to ${formatDate(open.to)}` : '—'}</dd></div>
              <div><dt>Office bearers</dt><dd>{open.bearers}</dd></div>
              <div><dt>Check-off</dt><dd>{Math.round(open.members * 0.9)} workers have signed a check-off authorisation</dd></div>
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

/** The live app's VRS schemes and government permissions (design audit step 3). */
export type LiveVrs = RetrenchmentScreenProps & {
  /** VRS applications are exit cases of type VRS. */
  applications: { id: string; name: string; status: string; lastDay: string }[];
  onOpenCase: (id: string) => void;
};

const IR_LABEL: Record<IrPermission['status'], { label: string; tone: 'warning' | 'success' | 'danger' }> = { applied: { label: 'Applied', tone: 'warning' }, granted: { label: 'Granted', tone: 'success' }, deemed: { label: 'Deemed granted', tone: 'success' }, refused: { label: 'Refused', tone: 'danger' } };
const KIND_LABEL: Record<IrPermission['kind'], string> = { retrenchment: 'Retrenchment', layoff: 'Lay-off', closure: 'Closure' };
const dayOf = (iso: string) => new Date(`${iso}T00:00:00`);

function LiveVrsScheme({ live: p }: { live: LiveVrs }) {
  const [t, setT] = useState<'applications' | 'setup' | 'permissions'>('applications');
  const [pick, setPick] = useState<string | null>(null);
  const [ask, setAsk] = useState<'apply' | 'scheme' | { decide: IrPermission } | { close: IrPermission } | null>(null);
  const d = p.data;
  const scheme = d?.schemes.find((s) => s.id === pick) ?? d?.schemes[0] ?? null;
  const entity = (id: string | null) => p.entities.find((e) => e.value === id)?.label ?? 'All legal entities';
  const open = scheme ? dayOf(scheme.opensOn) <= dayOf(p.today) && dayOf(scheme.closesOn) >= dayOf(p.today) : false;
  type App = LiveVrs['applications'][number];
  const cols: TableColumn<App>[] = [
    { key: 'name', header: 'Applicant', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: `Last day ${formatDate(dayOf(r.lastDay))}` }), width: 240 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (/accepted|cleared|exited|closed/i.test(String(v)) ? 'success' : /withdrawn|not accepted/i.test(String(v)) ? 'neutral' : 'warning'), width: 240 },
  ];
  const permCols: TableColumn<IrPermission>[] = [
    { key: 'kind', header: 'For', value: (r) => KIND_LABEL[r.kind], render: (r) => <span className="yx-ppl__type"><span>{KIND_LABEL[r.kind]}</span><span className="yx-ppl__sub">{entity(r.legalEntityId)}</span></span>, width: 220 },
    { key: 'workers', header: 'Workers', type: 'number', value: (r) => r.workersAffected, width: 100 },
    { key: 'applied', header: 'Applied', type: 'date', value: (r) => dayOf(r.appliedOn), width: 130 },
    { key: 'authority', header: 'Authority', value: (r) => r.authority, width: 200 },
    { key: 'status', header: 'Status', value: (r) => r.status, render: (r) => <Badge tone={IR_LABEL[r.status].tone}>{IR_LABEL[r.status].label}</Badge>, width: 140 },
  ];
  return (
    <PeopleFrame active="VRS schemes">
      {p.state === 'no-access' ? (
        <NoAccessState what="the schemes" grantedBy="your HR admin" />
      ) : p.state === 'error' ? (
        <ErrorState title="We couldn't load the schemes" description="Check your connection and try again." onRetry={p.onRetry} />
      ) : !d ? (
        <ListSkeleton label="Loading VRS schemes" />
      ) : (
        <>
          {d.schemes.length > 1 && (
            <div className="yx-ppl__row">
              <span className="yx-ppl__head-select">
                <Select aria-label="Scheme" size="sm" value={scheme?.id ?? null} onChange={setPick} options={d.schemes.map((s) => ({ value: s.id, label: s.name }))} />
              </span>
            </div>
          )}
          <ObjectHeader
            name={scheme?.name ?? 'VRS schemes'}
            icon={FileText}
            secondary={scheme ? `Window ${formatDate(dayOf(scheme.opensOn))} to ${formatDate(dayOf(scheme.closesOn))} · ${entity(scheme.legalEntityId)}` : 'No voluntary retirement scheme yet.'}
            status={scheme ? <Badge tone={open ? 'success' : 'neutral'}>{open ? 'Open' : dayOf(scheme.opensOn) > dayOf(p.today) ? 'Not open yet' : 'Closed'}</Badge> : undefined}
            // Issue scheme letters: no bulk scheme letter in the live app yet (left out).
            actions={
              <>
                <Button onClick={() => setAsk('apply')}>Record a permission request</Button>
                <Button variant="primary" icon={Plus} onClick={() => setAsk('scheme')}>
                  New VRS scheme
                </Button>
              </>
            }
          />
          <Tabs value={t} onValueChange={(v) => setT(v as typeof t)}>
            <TabsList aria-label="VRS scheme">
              <TabsTrigger value="applications" count={p.applications.length || undefined}>Applications</TabsTrigger>
              <TabsTrigger value="setup">Set-up</TabsTrigger>
              <TabsTrigger value="permissions" count={d.requests.length || undefined}>Government permission</TabsTrigger>
            </TabsList>
            <TabsContent value="applications">
              <DataTable
                label="VRS applications"
                columns={cols}
                rows={p.applications}
                getRowId={(r) => r.id}
                onRowClick={(r) => p.onOpenCase(r.id)}
                rowButtons={(r) => <Button size="sm" onClick={() => p.onOpenCase(r.id)}>Open exit case</Button>}
                empty={<EmptyState title="No applications yet" description="Eligible employees apply from Resign while a scheme is open. Each application is an exit case of type VRS, approved like any exit." />}
              />
            </TabsContent>
            <TabsContent value="setup">
              {scheme ? (
                <div className="yx-ppl__form">
                  <FormField label="Eligibility rule">
                    <Text as="p">{`Age ${scheme.minAge}+ and ${scheme.minServiceYears}+ years of service${scheme.legalEntityId ? ` at ${entity(scheme.legalEntityId)}` : ''}`}</Text>
                  </FormField>
                  <FormField label="Window">
                    <Text as="p">{`${formatDate(dayOf(scheme.opensOn))} to ${formatDate(dayOf(scheme.closesOn))}`}</Text>
                  </FormField>
                  <InlineAlert tone="info">Approved applications open exit cases of type VRS. Gratuity, leave encashment and notice rules apply on top of the scheme benefit.</InlineAlert>
                </div>
              ) : (
                <EmptyState title="No VRS scheme yet" description="Open a scheme with its window and who may apply." action={<Button onClick={() => setAsk('scheme')}>New VRS scheme</Button>} />
              )}
            </TabsContent>
            <TabsContent value="permissions">
              <div className="yx-ppl__stack">
                <Text size="sm" tone="secondary" as="p">
                  Retrenchment, lay-off and closure need the government&apos;s permission at 300 or more workers (IR Code). Workers on the rolls: {p.entities.map((e) => `${e.label} ${d.workers[e.value] ?? 0}`).join(' · ')}.
                </Text>
                <DataTable
                  label="Government permission requests"
                  columns={permCols}
                  rows={d.requests}
                  getRowId={(r) => r.id}
                  rowButtons={(r) =>
                    r.status === 'applied' ? (
                      <Button size="sm" onClick={() => setAsk({ decide: r })}>Record the decision</Button>
                    ) : r.kind === 'closure' && (r.status === 'granted' || r.status === 'deemed') ? (
                      <Button size="sm" onClick={() => setAsk({ close: r })}>Start the closure exits</Button>
                    ) : null
                  }
                  empty={<EmptyState title="No permission requests" description="Record a request when you apply to the government for a retrenchment, lay-off or closure." />}
                />
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
      {ask === 'apply' && <ApplyDialog entities={p.entities} today={p.today} onClose={() => setAsk(null)} onApply={p.onApply} />}
      {ask === 'scheme' && <SchemeDialog entities={p.entities} today={p.today} onClose={() => setAsk(null)} onScheme={p.onScheme} />}
      {ask && typeof ask === 'object' && 'decide' in ask && <DecideDialog r={ask.decide} today={p.today} onClose={() => setAsk(null)} onDecide={p.onDecide} />}
      {ask && typeof ask === 'object' && 'close' in ask && <ClosureDialog r={ask.close} today={p.today} onClose={() => setAsk(null)} onClosure={p.onClosure} />}
    </PeopleFrame>
  );
}

// PPL-40
export function VrsScheme(props: { tab?: 'setup' | 'applications' | 'permissions'; persona?: Persona; eligible?: boolean; live?: LiveVrs }) {
  return props.live ? <LiveVrsScheme live={props.live} /> : <SampleVrsScheme {...props} />;
}

function SampleVrsScheme({ tab = 'applications', persona = 'hr', eligible = true }: { tab?: 'setup' | 'applications' | 'permissions'; persona?: Persona; eligible?: boolean }) {
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
      <Tabs value={t} onValueChange={(v) => setT(v as 'setup' | 'applications' | 'permissions')}>
        <TabsList aria-label="VRS scheme">
          <TabsTrigger value="applications" count={VRS.applications.length}>Applications</TabsTrigger>
          <TabsTrigger value="setup">Set-up</TabsTrigger>
          <TabsTrigger value="permissions" count={1}>Government permission</TabsTrigger>
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
        <TabsContent value="permissions">
          <div className="yx-ppl__stack">
            <Text size="sm" tone="secondary" as="p">
              Retrenchment, lay-off and closure need the government&apos;s permission at 300 or more workers (IR Code). Workers on the rolls: Kaveri Foods Pvt Ltd 186 · Kaveri Foods Pvt Ltd (Tamil Nadu) 342.
            </Text>
            <ul className="yx-ppl__successors">
              <li>
                <span>Lay-off at Kaveri Foods Pvt Ltd (Tamil Nadu): 40 workers, applied 14 Sep 2026 to the Labour Commissioner, Chennai</span>
                <Badge tone="warning">Applied</Badge>
              </li>
            </ul>
          </div>
        </TabsContent>
      </Tabs>
    </PeopleFrame>
  );
}

/* PPL-42 re-verification lives in ./reverification.tsx. */
