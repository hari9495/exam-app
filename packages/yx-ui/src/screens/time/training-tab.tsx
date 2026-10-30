import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextField, TimeField } from '../../components/inputs';
import { DatePicker } from '../../components/date';
import { useToast } from '../../components/notify';
import { ConfirmDialog } from '../../components/overlay';
import { MultiSelect, Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { DataTable, type TableColumn } from '../../components/table';
import { formatDate } from '../../lib/format';

// TIM-14 · Training (founder, 30 Oct 2026): HR adds, changes and cancels the training sessions people mark themselves
// present at on the kiosk (TIM-13). One component for the design story and the live app: rows and calls come in.

export type TrainingState = 'upcoming' | 'running' | 'ended' | 'cancelled';
export interface TrainingRow {
  id: string;
  title: string;
  room: string | null;
  location: { id: string; name: string; zone: string };
  /** ISO instants. */
  startsAt: string;
  endsAt: string;
  /** Empty: everyone at the location. */
  invitees: { id: string; name: string }[];
  present: number;
  state: TrainingState;
  version: number;
}
export interface TrainingInput {
  title: string;
  room?: string;
  locationId: string;
  startsAt: string;
  endsAt: string;
  invitees: string[];
}
export interface TrainingPerson {
  id: string;
  label: string;
  detail?: string | null;
}
export interface TrainingTabProps {
  rows: TrainingRow[];
  locations: { id: string; name: string; zone: string }[];
  state?: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  /** People for "Who" (name or employee code). */
  onFindPeople: (q: string) => Promise<TrainingPerson[]>;
  onAdd: (input: TrainingInput) => Promise<unknown>;
  onEdit: (row: TrainingRow, input: TrainingInput) => Promise<unknown>;
  onCancel: (row: TrainingRow) => Promise<unknown>;
  /** Stories: open the form (new, or a row's id) or a row's cancel confirmation. */
  open?: { form?: 'new' | string; cancel?: string };
}

const STATE: Record<TrainingState, { label: string; tone: 'info' | 'success' | 'neutral' }> = {
  upcoming: { label: 'Upcoming', tone: 'info' },
  running: { label: 'On now', tone: 'success' },
  ended: { label: 'Ended', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

/** "YYYY-MM-DD" and "HH:mm" in a time zone, as an ISO instant. */
export function zonedIso(on: string, hm: string, zone: string): string {
  const [y, m, d] = on.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, h!, mi!);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const shown = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  return new Date(guess - (shown - guess)).toISOString();
}
/** An instant as the location's "YYYY-MM-DD" and "HH:mm". */
function zonedParts(iso: string, zone: string): { on: string; hm: string } {
  const d = new Date(iso);
  return { on: d.toLocaleDateString('en-CA', { timeZone: zone }), hm: d.toLocaleTimeString('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) };
}
const clock = (iso: string, zone: string) => new Date(iso).toLocaleTimeString('en-IN', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
const isoDay = (on: string) => new Date(`${on}T00:00:00`);
const dayOf = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '');
const whoText = (r: TrainingRow) => (r.invitees.length === 0 ? `Everyone at ${r.location.name}` : r.invitees.length <= 2 ? r.invitees.map((p) => p.name).join(', ') : `${r.invitees[0]!.name} and ${r.invitees.length - 1} others`);

export function TrainingTab({ rows, locations, state = 'ready', onRetry, onFindPeople, onAdd, onEdit, onCancel, open }: TrainingTabProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<'new' | TrainingRow | null>(open?.form === 'new' ? 'new' : (rows.find((r) => r.id === open?.form) ?? null));
  const [cancelling, setCancelling] = useState<TrainingRow | null>(rows.find((r) => r.id === open?.cancel) ?? null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const cols: TableColumn<TrainingRow>[] = [
    { key: 'title', header: 'Session', value: (r) => r.title, render: (r) => <span className="yx-tim-list__main"><strong>{r.title}</strong>{r.room && <span className="yx-tim-muted">{r.room}</span>}</span> },
    { key: 'when', header: 'When', width: 210, value: (r) => r.startsAt, render: (r) => <span className="yx-tim-list__main"><span>{formatDate(new Date(r.startsAt))}</span><span className="yx-tim-muted">{clock(r.startsAt, r.location.zone)} – {clock(r.endsAt, r.location.zone)}</span></span> },
    { key: 'location', header: 'Location', width: 180, value: (r) => r.location.name, optional: true },
    { key: 'who', header: 'Who', value: (r) => whoText(r) },
    { key: 'present', header: 'Marked present', type: 'number', width: 140, value: (r) => r.present },
    { key: 'state', header: 'Status', type: 'status', width: 120, value: (r) => STATE[r.state].label, statusTone: (v) => Object.values(STATE).find((s) => s.label === v)?.tone ?? 'neutral' },
  ];
  const addBtn = <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>Add training</Button>;
  return (
    <div className="yx-tim-stack">
      <DataTable
        label="Training sessions"
        columns={cols}
        rows={rows}
        getRowId={(r) => r.id}
        state={state}
        onRetry={onRetry}
        toolbar={<div className="yx-tim-row">{addBtn}<span className="yx-tim-muted">People mark themselves present at a kiosk at the session's location.</span></div>}
        empty={<EmptyState title="No training sessions" description="Add a session and people mark themselves present at the kiosk on the day." action={addBtn} />}
        rowButtons={(r) =>
          r.state === 'upcoming' ? (
            <><Button size="sm" onClick={() => setForm(r)}>Edit</Button><Button size="sm" onClick={() => { setCancelError(null); setCancelling(r); }}>Cancel session</Button></>
          ) : r.state === 'running' ? (
            <Button size="sm" onClick={() => { setCancelError(null); setCancelling(r); }}>Cancel session</Button>
          ) : null
        }
      />
      {state === 'ready' && rows.length > 0 && <p className="yx-tim-note">Sessions from the last 7 days and all coming ones. A session that has started can be cancelled, not changed.</p>}
      {form && (
        <TrainingForm
          key={form === 'new' ? 'new' : form.id}
          row={form === 'new' ? null : form}
          locations={locations}
          onFindPeople={onFindPeople}
          onClose={() => setForm(null)}
          onSave={async (input) => {
            if (form === 'new') await onAdd(input);
            else await onEdit(form, input);
            toast({ tone: 'success', title: form === 'new' ? `Training added · ${input.title}` : `Training changed · ${input.title}` });
            setForm(null);
          }}
        />
      )}
      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
        destructive
        title={`Cancel ${cancelling?.title ?? 'this session'}?`}
        consequence={`People can no longer mark themselves present${cancelling?.present ? `; the ${cancelling.present} already marked stay on record` : ''}. The session stays in the list as cancelled.`}
        confirmLabel="Cancel session"
        cancelLabel="Keep session"
        onConfirm={async () => {
          if (!cancelling) return;
          try {
            await onCancel(cancelling);
          } catch (e) {
            setCancelError(e instanceof Error ? e.message : 'That did not work. Try again.');
            return false;
          }
          toast({ tone: 'success', title: `Training cancelled · ${cancelling.title}` });
          setCancelling(null);
        }}
      >
        {cancelError && <InlineAlert tone="danger" title="Not cancelled">{cancelError}</InlineAlert>}
      </ConfirmDialog>
    </div>
  );
}

function TrainingForm({ row, locations, onFindPeople, onClose, onSave }: { row: TrainingRow | null; locations: TrainingTabProps['locations']; onFindPeople: TrainingTabProps['onFindPeople']; onClose: () => void; onSave: (input: TrainingInput) => Promise<void> }) {
  const at = row ? zonedParts(row.startsAt, row.location.zone) : null;
  const [title, setTitle] = useState(row?.title ?? '');
  const [room, setRoom] = useState(row?.room ?? '');
  const [locationId, setLocationId] = useState<string | null>(row?.location.id ?? (locations.length === 1 ? locations[0]!.id : null));
  const [on, setOn] = useState<Date | null>(at ? isoDay(at.on) : null);
  const [start, setStart] = useState<string | null>(at?.hm ?? null);
  const [end, setEnd] = useState<string | null>(row ? zonedParts(row.endsAt, row.location.zone).hm : null);
  const [who, setWho] = useState<'all' | 'chosen'>(row && row.invitees.length ? 'chosen' : 'all');
  const [people, setPeople] = useState<string[]>(row?.invitees.map((p) => p.id) ?? []);
  const [known, setKnown] = useState<Record<string, string>>(Object.fromEntries((row?.invitees ?? []).map((p) => [p.id, p.name])));
  const [found, setFound] = useState<TrainingPerson[]>([]);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const loc = locations.find((l) => l.id === locationId);
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!title.trim()) e['tr-title'] = 'Enter a title.';
    if (!locationId) e['tr-location'] = 'Choose the location.';
    if (!on) e['tr-date'] = 'Choose the date.';
    if (!start) e['tr-start'] = 'Enter the start time.';
    if (!end) e['tr-end'] = 'Enter the end time.';
    else if (start && end <= start) e['tr-end'] = 'The end must be after the start.';
    if (who === 'chosen' && people.length === 0) e['tr-who'] = 'Choose at least one person, or pick Everyone.';
    return e;
  }, [title, locationId, on, start, end, who, people]);
  const err = (id: string) => (tried ? (errors[id] ?? null) : null);
  const options = [...new Map([...people.map((id) => ({ value: id, label: known[id] ?? id })), ...found.map((p) => ({ value: p.id, label: p.label, description: p.detail ?? undefined }))].map((o) => [o.value, o])).values()];
  const save = async () => {
    setTried(true);
    const first = Object.keys(errors)[0];
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    setBusy(true);
    setFailed(null);
    try {
      const zone = loc?.zone ?? 'Asia/Kolkata';
      await onSave({ title: title.trim(), room: room.trim() || undefined, locationId: locationId!, startsAt: zonedIso(dayOf(on), start!, zone), endsAt: zonedIso(dayOf(on), end!, zone), invitees: who === 'chosen' ? people : [] });
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={row ? 'Change training' : 'Add training'}
      dirty={Boolean(title || room || on)}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>{row ? 'Save changes' : 'Add training'}</Button></>}
    >
      <div className="yx-tim-form">
        {failed && <InlineAlert tone="danger" title="Not saved">{failed}</InlineAlert>}
        <FormField id="tr-title" label="Title" required error={err('tr-title')}>
          <TextField value={title} onChange={setTitle} maxLength={120} placeholder="For example: Food safety refresher" />
        </FormField>
        <FormField id="tr-location" label="Location" required error={err('tr-location')} helper="People mark themselves present at a kiosk here.">
          <Select value={locationId} onChange={setLocationId} options={locations.map((l) => ({ value: l.id, label: l.name }))} placeholder="Choose the location" />
        </FormField>
        <FormField id="tr-room" label="Room" optional>
          <TextField value={room} onChange={setRoom} maxLength={80} placeholder="For example: Training room 1" />
        </FormField>
        <FormField id="tr-date" label="Date" required error={err('tr-date')}>
          <DatePicker value={on} onChange={setOn} />
        </FormField>
        <div className="yx-tim-row" style={{ alignItems: 'flex-start' }}>
          <FormField id="tr-start" label="Start" required error={err('tr-start')}>
            <TimeField value={start} onChange={setStart} />
          </FormField>
          <FormField id="tr-end" label="End" required error={err('tr-end')}>
            <TimeField value={end} onChange={setEnd} />
          </FormField>
        </div>
        <FormField label="Who">
          <Segment label="Who" value={who} onChange={setWho} options={[{ value: 'all', label: loc ? `Everyone at ${loc.name}` : 'Everyone at the location' }, { value: 'chosen', label: 'Chosen people' }]} />
        </FormField>
        {who === 'chosen' && (
          <FormField id="tr-who" label="People" required error={err('tr-who')} helper="Only they see it at the kiosk.">
            <MultiSelect
              value={people}
              onChange={(v) => {
                setKnown((k) => ({ ...k, ...Object.fromEntries(found.filter((p) => v.includes(p.id)).map((p) => [p.id, p.label])) }));
                setPeople(v);
              }}
              options={options}
              searchable
              searchPlaceholder="Name or employee code"
              placeholder="Choose people"
              onSearchChange={(q) => void onFindPeople(q).then(setFound, () => setFound([]))}
            />
          </FormField>
        )}
      </div>
    </Drawer>
  );
}
