// TIM-40 · Licence requirements, live: the designed LicenceRequirementsScreen (roster.tsx) with the API's licence types.
// Same header, table (Required for, Licence, Type, Holders, Needs action), "Only needing action" filter, holders drawer
// (Ask to renew, Override… for company licences, Record licence), override, record and edit dialogs. One row = one licence
// type; its requirements (roles or shifts, at all or one location) are listed and changed in the Edit dialog. "Skill" has no
// data model, so the Segment offers Role and Shift. Every rule is checked again by the API (and by the roster on placement).
import { useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Badge, PersonLabel } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert, NoAccessState } from '../../components/feedback';
import { useToast } from '../../components/notify';
import { Icon } from '../../components/foundations';
import { Dialog } from '../../components/overlay';
import { PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { NumberField, TextField } from '../../components/inputs';
import { FieldRow, FormField } from '../../components/field';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { formatDate } from '../../lib/format';
import { errorText } from '../org/org-kit';
import { Segment } from '../people/people-kit';
import { DueBadge, TimePage } from './time-kit';
import { daysUntil } from './time-logic';
import { NeedsAction, REMIND_DEFAULT, daysList, expiredOf, expiringOf, windowOf, type LicRow, type Overrides } from './roster';
import type { LoadState } from './live/types';

export interface LicenceRequirement { id: string; kind: 'shift' | 'role'; targetId: string; target: string; locationId: string | null; location: string | null }
export interface LicenceWatch { employeeId: string; name: string; expiresOn: string; number: string | null; override: { until: string; reason: string } | null }
export interface LicenceType {
  id: string;
  code: string;
  name: string;
  note: string | null;
  legal: boolean;
  /** Days before expiry, longest first. */
  remindDays: number[];
  active: boolean;
  version: number;
  holders: number;
  requirements: LicenceRequirement[];
  /** Holders whose latest licence is expired or expires within the longest reminder. */
  watch: LicenceWatch[];
}
export interface LicencesData {
  today: string;
  types: LicenceType[];
  shifts: { id: string; code: string; name: string }[];
  designations: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  people: { id: string; name: string; code: string | null }[];
}
export interface LicenceTypeInput { code: string; name: string; note: string; legal: boolean; remindDays: number[] }
export interface LiveLicences {
  state: LoadState;
  data: LicencesData | null;
  onRetry?: () => void;
  onCreateType: (body: LicenceTypeInput) => Promise<{ id: string }>;
  onUpdateType: (id: string, body: Omit<LicenceTypeInput, 'code'> & { active: boolean; version: number }) => Promise<unknown>;
  onAddRequirement: (body: { licenceTypeId: string; kind: 'shift' | 'role'; targetId: string; locationId?: string }) => Promise<unknown>;
  onRemoveRequirement: (id: string) => Promise<unknown>;
  onRecord: (body: { employeeId: string; licenceTypeId: string; number?: string; validFrom: string; expiresOn?: string }) => Promise<unknown>;
  onOverride: (body: { employeeId: string; licenceTypeId: string; reason: string; until: string }) => Promise<unknown>;
  onAskRenew: (body: { employeeIds: string[]; licenceTypeId: string }) => Promise<{ asked: number; alreadyAskedToday: number }>;
}

const localDate = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plusDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** "Forklift licence" → "FORKLIFT-LICENCE": the API's code rule (capital letters, digits, dashes, a letter first, ≤ 20). */
export const codeOf = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^[^A-Z]+/, '').slice(0, 20).replace(/-+$/, '');
const CODE_RULE = /^[A-Z][A-Z0-9-]{0,19}$/;
const OVERRIDE_MAX_DAYS = 90;
const KIND = { role: 'Role', shift: 'Shift' } as const;
const reqText = (r: LicenceRequirement) => (r.location ? `${r.target} at ${r.location}` : r.target);
const kindsText = (t: LicenceType) => {
  const k = [...new Set(t.requirements.map((r) => r.kind))];
  return k.length === 2 ? 'Role and shift' : k.length ? KIND[k[0]] : '';
};
const focus = (id: string) => window.setTimeout(() => document.getElementById(id)?.focus(), 0);
const remindLabel = (i: number, n: number) => (i === 0 ? 'First reminder (days before)' : i === n - 1 ? 'Last reminder' : i === 1 ? 'Second reminder' : `Reminder ${i + 1}`);

/** The designed row: holders keyed by employee id (not name), so two people with one name never share an override. */
const rowOf = (t: LicenceType): LicRow => ({ id: t.id, req: t.requirements.map(reqText).join(', '), kind: 'Role', licence: t.name, note: t.note ?? undefined, legal: t.legal, holders: t.holders, remind: t.remindDays, watch: t.watch.map((w) => ({ name: w.employeeId, expires: localDate(w.expiresOn) })) });
const overridesOf = (t: LicenceType): Overrides => Object.fromEntries(t.watch.filter((w) => w.override).map((w) => [w.employeeId, w.override!.reason]));

interface TypeForm { name: string; code: string; note: string; legal: 'legal' | 'company'; remind: (number | null)[]; kind: 'role' | 'shift'; targetId: string | null; locationId: string | null }
// A function: roster.tsx imports this file, so REMIND_DEFAULT is only defined once both modules have loaded.
const newForm = (): TypeForm => ({ name: '', code: '', note: '', legal: 'legal', remind: REMIND_DEFAULT, kind: 'role', targetId: null, locationId: null });

export function LiveLicencesScreen({ live: p }: { live: LiveLicences }) {
  const d = p.data;
  const { toast } = useToast();
  const done = (title: string, description?: string) => toast({ title, description, tone: 'success' });
  const why = (msg: string | false, go: () => void) => () => (msg ? toast({ title: msg, tone: 'warning' }) : go());
  const today = d ? localDate(d.today) : new Date();
  const [onlyAction, setOnlyAction] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ title: string; text: string } | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  // Holders drawer (by id, so a reload refreshes it).
  const [openId, setOpenId] = useState<string | null>(null);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  /** `typeId:employeeId` asked to renew today from this page (the API allows once a day per person). */
  const [asked, setAsked] = useState<string[]>([]);
  // Override dialog.
  const [ovFor, setOvFor] = useState<LicenceWatch | null>(null);
  const [ovReason, setOvReason] = useState('');
  const [ovUntil, setOvUntil] = useState<Date | null>(null);
  const [ovTried, setOvTried] = useState(false);
  const [ovError, setOvError] = useState<string | null>(null);
  // Record dialog.
  const [recording, setRecording] = useState(false);
  const [rec, setRec] = useState<{ person: string | null; number: string; from: Date | null; to: Date | null }>({ person: null, number: '', from: null, to: null });
  const [recTried, setRecTried] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  // Add / edit dialog.
  const [edit, setEdit] = useState<{ id: string | null; version: number; active: boolean } | null>(null);
  const [form, setForm] = useState<TypeForm>(newForm);
  const [tried, setTried] = useState(false);
  const [addTried, setAddTried] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const types = d?.types ?? [];
  const open = types.find((t) => t.id === openId) ?? null;
  const editing = edit?.id ? types.find((t) => t.id === edit.id) ?? null : null;
  const act = (t: LicenceType) => expiredOf(rowOf(t), overridesOf(t), today) + expiringOf(rowOf(t), overridesOf(t), today) > 0;
  const rows = onlyAction ? types.filter(act) : types;

  if (p.state === 'no-access') return <TimePage active="Roster"><PageHeader title="Licence requirements" /><NoAccessState what="licence requirements" grantedBy="HR (Time settings)" /></TimePage>;

  const run = async (key: string, fn: () => Promise<unknown>, onError: (msg: string, e: unknown) => void) => {
    setBusy(key);
    try {
      await fn();
      return true;
    } catch (e) {
      onError(errorText(e), e);
      return false;
    } finally {
      setBusy(null);
    }
  };

  /* ---------- add / edit ---------- */
  const openEdit = (t: LicenceType | 'new') => {
    setEdit(t === 'new' ? { id: null, version: 0, active: true } : { id: t.id, version: t.version, active: t.active });
    setForm(t === 'new' ? newForm() : { ...newForm(), name: t.name, note: t.note ?? '', legal: t.legal ? 'legal' : 'company', remind: t.remindDays.length ? t.remindDays : REMIND_DEFAULT });
    setTried(false);
    setAddTried(false);
    setCodeError(null);
    setEditError(null);
  };
  const isNew = !!edit && !edit.id;
  const code = form.code.trim() || codeOf(form.name);
  const remindNums = form.remind.filter((n): n is number => n != null);
  const fieldErrors = {
    name: form.name.trim().length < 2 ? 'Enter the licence name (at least 2 letters).' : '',
    code: isNew && !CODE_RULE.test(code) ? 'A code is 1 to 20 capital letters, digits or dashes, starting with a letter.' : '',
    target: isNew && !form.targetId ? `Choose the ${form.kind}.` : '',
    remind: remindNums.length < form.remind.length || remindNums.some((n) => n < 1 || n > 365) ? 'Fill in every reminder: 1 to 365 days before expiry.' : new Set(remindNums).size !== remindNums.length ? 'Each reminder is on a different day.' : '',
  };
  /** The reminder field that shows the reminder error (the first empty one). */
  const remindAt = Math.max(0, form.remind.findIndex((n) => n == null));
  const targets = form.kind === 'role' ? (d?.designations ?? []).map((x) => ({ value: x.id, label: x.name })) : (d?.shifts ?? []).map((x) => ({ value: x.id, label: `${x.name} (${x.code})` }));
  const targetName = (id: string | null) => targets.find((x) => x.value === id)?.label ?? '';
  const locName = (id: string | null) => d?.locations.find((l) => l.id === id)?.name ?? '';

  const saveType = async () => {
    setTried(true);
    setEditError(null);
    const bad = (['name', 'code', 'target', 'remind'] as const).find((k) => fieldErrors[k]);
    if (bad) return focus(bad === 'remind' ? `yx-lic-remind-${remindAt}` : `yx-lic-${bad}`);
    const body = { name: form.name.trim(), note: form.note.trim(), legal: form.legal === 'legal', remindDays: [...remindNums].sort((a, b) => b - a) };
    if (!edit) return;
    if (edit.id) {
      const ok = await run('save', () => p.onUpdateType(edit.id!, { ...body, active: edit.active, version: edit.version }), setEditError);
      if (ok) {
        done(`Saved ${body.name}`, `Reminders go out ${daysList(body.remindDays)} days before expiry.`);
        setEdit(null);
      }
      return;
    }
    let id = '';
    const created = await run('save', async () => { id = (await p.onCreateType({ ...body, code })).id; }, (msg, e) => {
      if ((e as { status?: number }).status === 409) {
        setCodeError(msg);
        focus('yx-lic-code');
      } else setEditError(msg);
    });
    if (!created) return;
    const target = targetName(form.targetId);
    const loc = locName(form.locationId);
    const placed = await run('save', () => p.onAddRequirement({ licenceTypeId: id, kind: form.kind, targetId: form.targetId!, ...(form.locationId ? { locationId: form.locationId } : {}) }), (msg) =>
      setPageError(`${body.name} was added, but "${target}" was not linked to it: ${msg} Open Edit to add the requirement again.`),
    );
    setEdit(null);
    if (!placed) return;
    done(`Added ${body.name}`);
    setSaved({ title: `${body.name}: no one holds this licence yet`, text: `From today the roster blocks ${form.kind === 'role' ? `everyone in the ${target} role` : `everyone on the ${target} shift`}${loc ? ` at ${loc}` : ''} until licences are recorded${body.legal ? '' : ' or HR overrides with a reason'}.` });
  };
  const addRequirement = async () => {
    setEditError(null);
    if (!editing) return;
    if (!form.targetId) {
      setAddTried(true);
      return focus('yx-lic-target');
    }
    const target = targetName(form.targetId);
    const ok = await run('add-req', () => p.onAddRequirement({ licenceTypeId: editing.id, kind: form.kind, targetId: form.targetId!, ...(form.locationId ? { locationId: form.locationId } : {}) }), setEditError);
    if (ok) {
      done(`${target}${form.locationId ? ` at ${locName(form.locationId)}` : ''} now needs ${editing.name}`, 'The roster checks it from today.');
      setForm({ ...form, targetId: null, locationId: null });
      setAddTried(false);
    }
  };
  const removeRequirement = async (r: LicenceRequirement) => {
    if (!editing) return;
    setEditError(null);
    if (await run(`rm-${r.id}`, () => p.onRemoveRequirement(r.id), setEditError)) done(`${reqText(r)} no longer needs ${editing.name}`);
  };

  /* ---------- drawer actions ---------- */
  const ask = async (t: LicenceType, people: LicenceWatch[]) => {
    setDrawerError(null);
    let res = { asked: 0, alreadyAskedToday: 0 };
    const ok = await run(people.length === 1 ? `ask-${people[0].employeeId}` : 'ask-all', async () => { res = await p.onAskRenew({ employeeIds: people.map((w) => w.employeeId), licenceTypeId: t.id }); }, setDrawerError);
    if (!ok) return;
    setAsked([...asked, ...people.map((w) => `${t.id}:${w.employeeId}`)]);
    const already = res.alreadyAskedToday ? `${res.alreadyAskedToday} ${res.alreadyAskedToday === 1 ? 'was' : 'were'} already asked today or can't sign in.` : undefined;
    if (!res.asked) toast({ title: people.length === 1 ? `${people[0].name} was already asked today` : 'Everyone was already asked today', description: people.length === 1 ? undefined : already, tone: 'warning' });
    else done(people.length === 1 ? `${people[0].name} asked to renew` : `${res.asked} ${res.asked === 1 ? 'person' : 'people'} asked to renew`, already);
  };
  const ovErrors = {
    reason: ovReason.trim().length < 5 ? 'Enter a reason of at least 5 letters.' : ovReason.trim().length > 300 ? 'Keep the reason to 300 letters.' : '',
    until: !ovUntil ? 'Choose the last day the override lasts.' : daysUntil(ovUntil, today) < 0 || daysUntil(ovUntil, today) > OVERRIDE_MAX_DAYS ? `Choose a day from today up to ${OVERRIDE_MAX_DAYS} days ahead.` : '',
  };
  const saveOverride = async () => {
    setOvTried(true);
    setOvError(null);
    const bad = (['reason', 'until'] as const).find((k) => ovErrors[k]);
    if (bad) return focus(`yx-lic-ov-${bad}`);
    if (!open || !ovFor) return;
    const ok = await run('override', () => p.onOverride({ employeeId: ovFor.employeeId, licenceTypeId: open.id, reason: ovReason.trim(), until: isoOf(ovUntil!) }), setOvError);
    if (ok) {
      done(`${ovFor.name} can be rostered until ${formatDate(ovUntil!)}`, 'The override and its reason are logged.');
      setOvFor(null);
    }
  };
  const recErrors = {
    person: !rec.person ? 'Choose the person.' : '',
    from: !rec.from ? 'Enter the date the licence is valid from.' : daysUntil(rec.from, today) > 365 ? 'A licence starts within a year from today.' : '',
    to: rec.from && rec.to && rec.to < rec.from ? 'The expiry is after the valid-from date.' : '',
  };
  const saveRecord = async () => {
    setRecTried(true);
    setRecError(null);
    const bad = (['person', 'from', 'to'] as const).find((k) => recErrors[k]);
    if (bad) return focus(`yx-lic-rec-${bad}`);
    if (!open) return;
    const who = d?.people.find((x) => x.id === rec.person)?.name ?? '';
    const ok = await run('record', () => p.onRecord({ employeeId: rec.person!, licenceTypeId: open.id, validFrom: isoOf(rec.from!), ...(rec.number.trim() ? { number: rec.number.trim() } : {}), ...(rec.to ? { expiresOn: isoOf(rec.to) } : {}) }), setRecError);
    if (ok) {
      done(`Licence recorded for ${who}`, rec.to ? `Valid until ${formatDate(rec.to)}.` : 'It has no expiry date.');
      setRecording(false);
    }
  };
  const startRecord = (w?: LicenceWatch) => {
    setRec({ person: w?.employeeId ?? null, number: '', from: null, to: null });
    setRecTried(false);
    setRecError(null);
    setRecording(true);
  };

  /* ---------- table ---------- */
  const cols: TableColumn<LicenceType>[] = [
    {
      key: 'req',
      header: 'Required for',
      value: (t) => t.requirements.map(reqText).join(', '),
      render: (t) => <span className="yx-tim-list__main"><strong>{t.requirements.length ? t.requirements.map(reqText).join(', ') : 'Not required yet'}</strong><span className="yx-tim-muted">{kindsText(t) || 'Add a role or shift in Edit'}</span></span>,
    },
    { key: 'licence', header: 'Licence', value: (t) => t.name, render: (t) => <span className="yx-tim-list__main" style={{ flex: 'none' }}><span>{t.name}</span>{t.note && <span className="yx-tim-muted">{t.note}</span>}</span> },
    { key: 'legal', header: 'Type', width: 116, value: (t) => (t.legal ? 'Legal' : 'Company'), render: (t) => <Badge tone="neutral">{t.legal ? 'Legal' : 'Company'}</Badge> },
    { key: 'holders', header: 'Holders', type: 'number', value: (t) => t.holders, optional: true },
    { key: 'needs', header: 'Needs action', width: 190, value: (t) => expiredOf(rowOf(t), overridesOf(t), today) * 100 + expiringOf(rowOf(t), overridesOf(t), today), render: (t) => <NeedsAction r={rowOf(t)} ov={overridesOf(t)} today={today} /> },
  ];
  const openRow = open ? rowOf(open) : null;
  const openOv = open ? overridesOf(open) : {};
  const openAction = open && openRow ? expiredOf(openRow, openOv, today) + expiringOf(openRow, openOv, today) : 0;
  const notAsked = open ? open.watch.filter((w) => !asked.includes(`${open.id}:${w.employeeId}`)) : [];

  return (
    <TimePage active="Roster">
      <PageHeader
        title="Licence requirements"
        description={`People without a valid licence can't be rostered. Reminders go out before expiry (${daysList(REMIND_DEFAULT)} days by default). Legal licences have no override; HR can override company ones with a reason.`}
        actions={<span className="yx-tim-row">{p.state === 'loading' && <span className="yx-tim-muted">Requirements are loading</span>}<Button variant="primary" icon={Plus} onClick={why(p.state !== 'ready' && 'Wait for the requirements to load', () => openEdit('new'))}>Add requirement</Button></span>}
      />
      {pageError && <InlineAlert tone="danger" title="Not finished" actions={<Button size="sm" onClick={() => setPageError(null)}>Close</Button>}>{pageError}</InlineAlert>}
      {saved && <InlineAlert tone="warning" title={saved.title} actions={<Button size="sm" onClick={() => setSaved(null)}>Close</Button>}>{saved.text}</InlineAlert>}
      <DataTable
        label="Licence requirements"
        columns={cols}
        rows={rows}
        getRowId={(t) => t.id}
        state={p.state === 'loading' ? 'loading' : p.state === 'error' ? 'error' : 'ready'}
        onRetry={p.onRetry ?? (() => {})}
        toolbar={
          p.state === 'ready' && (
            <button type="button" className="yx-ppl__chip yx-ppl__chip--toggle" aria-pressed={onlyAction} onClick={() => setOnlyAction(!onlyAction)}>
              {onlyAction && <Icon icon={Check} size="sm" />}
              Only needing action ({types.filter(act).length})
            </button>
          )
        }
        rowButtons={(t) => <><Button size="sm" onClick={() => { setDrawerError(null); setOpenId(t.id); }}>Who needs action</Button><Button size="sm" onClick={() => openEdit(t)}>Edit</Button></>}
        empty={
          onlyAction ? (
            <EmptyState title="No licences need action" description="Every holder's licence is valid past its first reminder." action={<Button onClick={() => setOnlyAction(false)}>Show all</Button>} />
          ) : (
            <EmptyState title="No licence requirements yet" description="Add one for a role or shift that needs a licence to work." action={<Button variant="primary" onClick={() => openEdit('new')}>Add requirement</Button>} />
          )
        }
      />
      <Drawer open={!!open} onOpenChange={(o) => !o && setOpenId(null)} title={open ? `${open.requirements.length ? open.requirements.map(reqText).join(', ') : 'Not required yet'} · ${open.name}` : ''} subtitle={open && openRow ? `${openAction} of ${open.holders} need action · reminders ${daysList(open.remindDays)} days before expiry` : undefined}>
        {open && openRow && (
          <div className="yx-tim-stack">
            {drawerError && <InlineAlert tone="danger" title="That didn't work">{drawerError}</InlineAlert>}
            <span className="yx-tim-row">
              {open.watch.length > 0 && <Button size="sm" loading={busy === 'ask-all'} onClick={why(!notAsked.length && 'Everyone was already asked today', () => void ask(open, notAsked))}>{notAsked.length ? 'Ask all to renew' : 'All asked to renew'}</Button>}
              <Button size="sm" icon={Plus} onClick={() => startRecord()}>Record licence</Button>
            </span>
            {open.watch.length ? (
              <ul className="yx-tim-list">
                {open.watch.map((w) => {
                  const exp = localDate(w.expiresOn);
                  const gone = daysUntil(exp, today) < 0;
                  const sent = asked.includes(`${open.id}:${w.employeeId}`);
                  return (
                    <li key={w.employeeId}>
                      <PersonLabel name={w.name} secondary={w.override ? `Overridden until ${formatDate(localDate(w.override.until))}: ${w.override.reason}` : `${gone ? 'Expired' : 'Expires'} ${formatDate(exp)}${w.number ? ` · ${w.number}` : ''}`} />
                      <span className="yx-tim-row">
                        <DueBadge date={exp} today={today} />
                        <Button size="sm" loading={busy === `ask-${w.employeeId}`} onClick={why(sent && 'Reminder already sent today', () => void ask(open, [w]))}>{sent ? 'Reminder sent' : 'Ask to renew'}</Button>
                        {/* Company licences only: HR can let an expired holder be rostered, with a reason. */}
                        {!open.legal && gone && !w.override && <Button size="sm" onClick={() => { setOvFor(w); setOvReason(''); setOvUntil(null); setOvTried(false); setOvError(null); }}>Override…</Button>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="yx-tim-muted">{open.holders ? `All ${open.holders} holders have a licence valid for more than ${windowOf(openRow)} days.` : 'No holders yet.'}</p>}
          </div>
        )}
      </Drawer>
      <Dialog
        open={!!ovFor}
        onOpenChange={(o) => !o && setOvFor(null)}
        title={ovFor ? `Override for ${ovFor.name}` : ''}
        footer={<>{!ovReason.trim() && <span className="yx-tim-muted">Enter a reason</span>}<Button onClick={() => setOvFor(null)}>Cancel</Button><Button variant="primary" loading={busy === 'override'} onClick={() => void saveOverride()}>Override</Button></>}
      >
        <div className="yx-tim-stack">
          <p className="yx-tim-muted">{ovFor?.name} can be rostered while the company licence is renewed. The override and its reason are logged.</p>
          {ovError && <InlineAlert tone="danger" title="Not overridden">{ovError}</InlineAlert>}
          <FormField id="yx-lic-ov-reason" label="Reason" required rule="5 to 300 letters." error={ovTried ? ovErrors.reason : undefined}><TextField value={ovReason} placeholder="For example Renewal course booked for 6 Nov" onChange={setOvReason} /></FormField>
          <FormField id="yx-lic-ov-until" label="Until" required helper={`At most ${OVERRIDE_MAX_DAYS} days. Renewing the licence is the fix.`} error={ovTried ? ovErrors.until : undefined}><DatePicker value={ovUntil} min={today} max={plusDays(today, OVERRIDE_MAX_DAYS)} onChange={setOvUntil} /></FormField>
        </div>
      </Dialog>
      <Dialog
        open={recording}
        onOpenChange={(o) => !o && setRecording(false)}
        title={open ? `Record a ${open.name.toLowerCase()}` : 'Record a licence'}
        description="A renewal is recorded the same way: the latest licence counts."
        footer={<><Button onClick={() => setRecording(false)}>Cancel</Button><Button variant="primary" loading={busy === 'record'} onClick={() => void saveRecord()}>Record licence</Button></>}
      >
        <div className="yx-tim-form">
          {recError && <InlineAlert tone="danger" title="Not recorded">{recError}</InlineAlert>}
          <FormField id="yx-lic-rec-person" label="Person" required error={recTried ? recErrors.person : undefined}>
            <Select searchable value={rec.person} placeholder="Choose a person" onChange={(person) => setRec({ ...rec, person })} options={(d?.people ?? []).map((x) => ({ value: x.id, label: x.code ? `${x.name} · ${x.code}` : x.name }))} />
          </FormField>
          <FormField label="Licence number" optional><TextField value={rec.number} placeholder="For example TN-FL-2026-0412" onChange={(number) => setRec({ ...rec, number })} /></FormField>
          <FieldRow>
            <FormField id="yx-lic-rec-from" label="Valid from" required error={recTried ? recErrors.from : undefined}><DatePicker value={rec.from} max={plusDays(today, 365)} onChange={(from) => setRec({ ...rec, from })} /></FormField>
            <FormField id="yx-lic-rec-to" label="Expires on" optional helper="Leave empty if it never expires." error={recTried ? recErrors.to : undefined}><DatePicker value={rec.to} min={rec.from ?? undefined} onChange={(to) => setRec({ ...rec, to })} /></FormField>
          </FieldRow>
        </div>
      </Dialog>
      <Dialog
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        title={isNew ? 'Add requirement' : 'Edit requirement'}
        footer={<><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" loading={busy === 'save'} onClick={() => void saveType()}>Save requirement</Button></>}
      >
        <div className="yx-tim-stack">
          {editError && <InlineAlert tone="danger" title="Not saved">{editError}</InlineAlert>}
          {editing && (
            <FormField label="Required for">
              {editing.requirements.length ? (
                <ul className="yx-tim-list">
                  {editing.requirements.map((r) => (
                    <li key={r.id}>
                      <span className="yx-tim-list__main"><strong>{reqText(r)}</strong><span className="yx-tim-muted">{KIND[r.kind]}</span></span>
                      <IconButton icon={Trash2} label={`Remove ${reqText(r)}`} size="sm" onClick={why(busy === `rm-${r.id}` && 'Removing…', () => void removeRequirement(r))} />
                    </li>
                  ))}
                </ul>
              ) : <p className="yx-tim-muted">Not required for any role or shift yet.</p>}
            </FormField>
          )}
          <FormField label={editing ? 'Add a role or shift' : 'Required for'}><Segment label="Required for" value={form.kind} onChange={(kind) => setForm({ ...form, kind, targetId: null })} options={(['role', 'shift'] as const).map((k) => ({ value: k, label: KIND[k] }))} /></FormField>
          <FieldRow>
            <FormField id="yx-lic-target" label={KIND[form.kind]} required={isNew} error={(isNew ? tried : addTried) && !form.targetId ? `Choose the ${form.kind}.` : undefined}>
              <Select searchable value={form.targetId} placeholder={`Choose a ${form.kind}`} onChange={(targetId) => setForm({ ...form, targetId })} options={targets} emptyText={form.kind === 'role' ? 'No roles yet' : 'No shifts yet'} />
            </FormField>
            <FormField label="Location" optional><Select clearable value={form.locationId} placeholder="All locations" onChange={(locationId) => setForm({ ...form, locationId })} options={(d?.locations ?? []).map((l) => ({ value: l.id, label: l.name }))} /></FormField>
          </FieldRow>
          {editing && <span className="yx-tim-row"><Button size="sm" icon={Plus} loading={busy === 'add-req'} onClick={() => void addRequirement()}>Add {form.kind}</Button></span>}
          <FormField id="yx-lic-name" label="Licence" required error={tried ? fieldErrors.name : undefined}><TextField value={form.name} onChange={(name) => setForm({ ...form, name })} /></FormField>
          <FieldRow>
            {isNew && (
              <FormField id="yx-lic-code" label="Code" optional helper="Made from the licence name if left empty. It can't change later." error={codeError ?? (tried ? fieldErrors.code : undefined)}>
                <TextField value={form.code} placeholder={codeOf(form.name) || 'FORKLIFT'} onChange={(v) => { setCodeError(null); setForm({ ...form, code: v.toUpperCase() }); }} />
              </FormField>
            )}
            <FormField label="Note" optional><TextField value={form.note} placeholder="For example LMV endorsement" onChange={(note) => setForm({ ...form, note })} /></FormField>
          </FieldRow>
          <FormField label="Type" helper={form.legal === 'legal' ? 'Required by law: no one can override it.' : 'Company rule: HR can override it with a reason.'}>
            <Segment label="Type" value={form.legal} onChange={(legal) => setForm({ ...form, legal })} options={[{ value: 'legal', label: 'Legal' }, { value: 'company', label: 'Company' }]} />
          </FormField>
          <FieldRow>
            {form.remind.map((n, i) => (
              <FormField key={i} id={`yx-lic-remind-${i}`} label={remindLabel(i, form.remind.length)} required error={tried && i === remindAt ? fieldErrors.remind : undefined}>
                <NumberField value={n} min={1} max={365} onChange={(v) => setForm({ ...form, remind: form.remind.map((x, j) => (j === i ? v : x)) })} />
              </FormField>
            ))}
          </FieldRow>
        </div>
      </Dialog>
    </TimePage>
  );
}
