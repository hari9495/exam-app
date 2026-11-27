// Batch G2 item 12 (M09, ENG-03; answers 2601-2602): the announcement list, composer and acknowledgement tracking with
// real records, drawn in the ENG-03 layout. AnnouncementScreen (engage-feed.tsx) renders this when given `live`.
import { useState } from 'react';
import { Bell, Download, Megaphone, Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, Meter, NoAccessState, Skeleton } from '../../components/feedback';
import { Card, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { ConfirmDialog } from '../../components/overlay';
import { FormField, useTooEarly } from '../../components/field';
import { TextField } from '../../components/inputs';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { MultiSelect } from '../../components/select';
import { DatePicker } from '../../components/date';
import { RichTextEditor } from '../../components/editor';
import { useToast } from '../../components/notify';
import { formatDate } from '../../lib/format';
import { errorText } from '../org/org-kit';
import { GrowthFrame } from './growth-kit';
import { carriesAmount } from './growth-logic';

export interface AnnouncementRow {
  id: string;
  title: string;
  publishAt: string;
  scheduled: boolean;
  people: number;
  read: number;
  acknowledged: number;
  ackRequired: boolean;
  ackDueOn: string | null;
  pinned: boolean;
}
export interface AnnouncementDetail {
  id: string;
  title: string;
  body: string;
  publishAt: string;
  scheduled: boolean;
  ackRequired: boolean;
  ackDueOn: string | null;
  email: boolean;
  pinned: boolean;
  canRemind: boolean;
  rows: { id: string; name: string; department: string | null; location: string | null; read: string | null; acked: string | null }[];
}
export interface AnnouncementInput {
  title: string;
  body: string;
  locationIds: string[];
  departmentIds: string[];
  /** T2-G 42 (answer 2745): the company's groups in the audience. */
  groupIds?: string[];
  email: boolean;
  ackRequired: boolean;
  ackDueOn?: string;
  pinned: boolean;
  publishAt?: string;
}
export interface AnnouncementOptions {
  locations: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  /** T2-G 42: the company's groups (hand-picked or worked out from rules). */
  groups?: { id: string; name: string }[];
  everyone: number;
}
export interface LiveAnnouncements {
  view: 'list' | 'compose' | 'tracking';
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry?: () => void;
  list?: AnnouncementRow[];
  onNew?: () => void;
  onOpen?: (id: string) => void;
  options?: AnnouncementOptions | null;
  reach?: (locationIds: string[], departmentIds: string[], groupIds?: string[]) => Promise<number>;
  onPublish?: (input: AnnouncementInput) => Promise<{ id: string }>;
  onDone?: (id: string) => void;
  detail?: AnnouncementDetail | null;
  onRemind?: () => Promise<{ reminded: number }>;
  today: Date;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (s: string) => new Date(s.length === 10 ? `${s}T00:00:00` : s);

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <GrowthFrame area="engage" active="Announcements" persona="hr">
      {children}
    </GrowthFrame>
  );
}

export function LiveAnnouncementScreen({ live }: { live: LiveAnnouncements }) {
  if (live.state === 'no-access')
    return (
      <Frame>
        <PageHeader title="Announcements" />
        <NoAccessState what="announcements" grantedBy="your System Admin" />
      </Frame>
    );
  if (live.state === 'error')
    return (
      <Frame>
        <PageHeader title="Announcements" />
        <ErrorState title="We couldn't load the announcements." description="Try again in a moment." onRetry={live.onRetry} />
      </Frame>
    );
  if (live.view === 'compose') return <Compose live={live} />;
  if (live.view === 'tracking') return <Tracking live={live} />;
  const rows = live.list ?? [];
  const cols: TableColumn<AnnouncementRow>[] = [
    { key: 'title', header: 'Announcement', value: (r) => r.title, width: 320, render: (r) => <span className="yx-ops-row">{r.title}{r.pinned && <Badge tone="neutral">Pinned</Badge>}</span> },
    { key: 'at', header: 'Published', type: 'date', value: (r) => day(r.publishAt), render: (r) => (r.scheduled ? `Scheduled for ${formatDate(day(r.publishAt))}` : formatDate(day(r.publishAt))), width: 200 },
    { key: 'people', header: 'People', type: 'number', value: (r) => r.people, width: 100 },
    { key: 'read', header: 'Read', type: 'number', value: (r) => r.read, width: 100 },
    { key: 'ack', header: 'Acknowledged', value: (r) => (r.ackRequired ? r.acknowledged : -1), render: (r) => (r.ackRequired ? `${r.acknowledged} of ${r.people}` : 'Not asked'), width: 150 },
  ];
  return (
    <Frame>
      <PageHeader title="Announcements" description="Company news people read and, when you ask, acknowledge." actions={<Button variant="primary" icon={Plus} onClick={live.onNew}>New announcement</Button>} />
      <DataTable
        label="Announcements"
        columns={cols}
        rows={rows}
        getRowId={(r) => r.id}
        state={live.state === 'loading' ? 'loading' : 'ready'}
        onRowClick={(r) => live.onOpen?.(r.id)}
        rowButtons={(r) => <Button size="sm" onClick={() => live.onOpen?.(r.id)}>Open</Button>}
        empty={<EmptyState title="No announcements yet" description="Write the first one; it reaches the people you choose." action={<Button icon={Plus} onClick={live.onNew}>New announcement</Button>} />}
      />
    </Frame>
  );
}

function Compose({ live }: { live: LiveAnnouncements }) {
  const { toast } = useToast();
  const o = live.options;
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<string[]>(['everyone']);
  const [email, setEmail] = useState(false);
  const [ack, setAck] = useState(true);
  const [due, setDue] = useState<Date | null>(null);
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [on, setOn] = useState<Date | null>(null);
  const [pinned, setPinned] = useState(false);
  const [reach, setReach] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const tomorrow = new Date(live.today.getFullYear(), live.today.getMonth(), live.today.getDate() + 1);
  const text = body.replace(/<[^>]*>/g, '').trim();
  const lists = (a: string[]) => (a.includes('everyone') ? { locationIds: [], departmentIds: [], groupIds: [] } : { locationIds: a.filter((x) => x.startsWith('loc:')).map((x) => x.slice(4)), departmentIds: a.filter((x) => x.startsWith('dep:')).map((x) => x.slice(4)), groupIds: a.filter((x) => x.startsWith('grp:')).map((x) => x.slice(4)) });
  const amount = email && carriesAmount(title);
  const early = useTooEarly([
    ...(title.trim().length < 3 ? [{ fieldId: 'an-title', message: 'Write a title (at least 3 letters).' }] : []),
    ...(!text ? [{ fieldId: 'an-body', message: 'Write the message.' }] : []),
    ...(!audience.length ? [{ fieldId: 'an-audience', message: 'Choose who it goes to.' }] : []),
    ...(when === 'later' && !on ? [{ fieldId: 'an-on', message: 'Choose the day to publish it.' }] : []),
  ]);
  const chooseAudience = (a: string[]) => {
    // "Everyone" stands alone: picking it clears the rest, picking anything else clears it.
    const next = a.includes('everyone') && !audience.includes('everyone') ? ['everyone'] : a.filter((x) => x !== 'everyone' || a.length === 1);
    setAudience(next);
    setReach(null);
    if (next.length && live.reach) {
      const l = lists(next);
      void live.reach(l.locationIds, l.departmentIds, l.groupIds).then(setReach, () => setReach(null));
    }
  };
  const shown = audience.includes('everyone') ? (o?.everyone ?? 0) : reach;
  const publish = async () => {
    // Later: 9:00 am India time on the chosen day. A refusal shows inside the dialog (ConfirmDialog).
    const out = await live.onPublish!({ title: title.trim(), body, ...lists(audience), email, ackRequired: ack, ...(ack && due ? { ackDueOn: iso(due) } : {}), pinned, ...(when === 'later' && on ? { publishAt: `${iso(on)}T09:00:00+05:30` } : {}) });
    toast({ tone: 'success', title: when === 'later' ? 'Announcement scheduled.' : 'Announcement published.' });
    live.onDone?.(out.id);
  };
  if (live.state === 'loading' || !o)
    return (
      <Frame>
        <PageHeader title="New announcement" />
        <Skeleton height={320} />
      </Frame>
    );
  return (
    <Frame>
      <PageHeader
        title="New announcement"
        actions={
          <Button variant="primary" icon={Megaphone} onClick={() => !early.stop() && setConfirm(true)}>
            {when === 'later' ? 'Schedule' : shown !== null ? `Publish to ${shown} people` : 'Publish'}
          </Button>
        }
      />
      <div className="yx-growth-split">
        <div className="yx-growth-split__main">
          <FormField id="an-title" label="Title" required error={early.errorOf('an-title')}>
            <TextField value={title} onChange={setTitle} maxLength={200} />
          </FormField>
          <FormField id="an-body" label="Message" required error={early.errorOf('an-body')}>
            <RichTextEditor value={body} onChange={setBody} mergeFields={[]} placeholder="Write the announcement" />
          </FormField>
          <FormField id="an-audience" label="Audience" required error={early.errorOf('an-audience')} helper={shown !== null ? `${shown} people right now; people who join the audience later also receive it.` : 'People who join the audience later also receive it.'}>
            <MultiSelect
              value={audience}
              onChange={chooseAudience}
              options={[{ value: 'everyone', label: 'Everyone' }, ...o.locations.map((l) => ({ value: `loc:${l.id}`, label: `Location: ${l.name}` })), ...o.departments.map((d) => ({ value: `dep:${d.id}`, label: `Department: ${d.name}` })), ...(o.groups ?? []).map((g) => ({ value: `grp:${g.id}`, label: `Group: ${g.name}` }))]}
            />
          </FormField>
          <FormField label="Channels">
            <div className="yx-growth-stack" data-gap="sm">
              <Checkbox checked disabled label="In-app and mobile Home" description="Always on" />
              <Checkbox checked={email} onChange={setEmail} label="Email" description="Title and a link only" />
            </div>
          </FormField>
          {amount && (
            <InlineAlert tone="danger" title="Remove the amount before sending outside the app">
              Email never carries pay amounts or other confidential values. Change the title, or send in-app only.
            </InlineAlert>
          )}
        </div>
        <aside className="yx-growth-split__side">
          <Card title="Acknowledgement">
            <div className="yx-growth-stack">
              <Switch checked={ack} onChange={setAck} label="Ask people to acknowledge" description="Tracked per person; reminders after 2 and 5 days." />
              {ack && (
                <FormField label="Acknowledge by" optional>
                  <DatePicker value={due} onChange={setDue} min={live.today} />
                </FormField>
              )}
            </div>
          </Card>
          <Card title="Schedule">
            <div className="yx-growth-stack">
              <RadioGroup aria-label="When" value={when} onChange={(v) => setWhen(v as 'now' | 'later')} options={[{ value: 'now', label: 'Publish now' }, { value: 'later', label: 'Schedule for later', description: 'Published at 9:00 am that day' }]} />
              {when === 'later' && (
                <FormField id="an-on" label="Publish on" required error={early.errorOf('an-on')}>
                  <DatePicker value={on} onChange={setOn} min={tomorrow} />
                </FormField>
              )}
              <Switch checked={pinned} onChange={setPinned} label="Pin to the top of the feed" />
            </div>
          </Card>
        </aside>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={when === 'later' ? `Schedule for ${formatDate(on)}?` : `Publish to ${shown ?? ''} people?`}
        consequence={`${email ? 'In the app and by email.' : 'In the app.'} ${ack ? `Everyone is asked to acknowledge${due ? ` by ${formatDate(due)}` : ''}.` : ''} You can't unsend it.`}
        confirmLabel={when === 'later' ? 'Schedule announcement' : 'Publish announcement'}
        // Kept as in the design: the fix (title or channels) is in the form behind the dialog, which shows the alert.
        confirmDisabled={amount}
        onConfirm={publish}
      />
    </Frame>
  );
}

function Tracking({ live }: { live: LiveAnnouncements }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const d = live.detail;
  if (live.state === 'loading' || !d)
    return (
      <Frame>
        <Skeleton height={64} />
        <Skeleton height={320} />
      </Frame>
    );
  const rows = d.rows.map((r) => ({ ...r, status: r.acked ? 'Acknowledged' : r.read ? 'Read, not acknowledged' : 'Not read' }));
  const acked = rows.filter((r) => r.acked).length;
  const read = rows.filter((r) => r.read).length;
  const remind = async () => {
    setBusy(true);
    setFailed(null);
    try {
      const out = await live.onRemind!();
      toast({ tone: 'success', title: `Reminder sent to ${out.reminded} people.` });
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const exportCsv = () => {
    const q = (s: string | null) => `"${(s ?? '').replace(/"/g, '""')}"`;
    const csv = ['Employee,Department,Location,Read,Acknowledged', ...rows.map((r) => [q(r.name), q(r.department), q(r.location), q(r.read?.slice(0, 10) ?? ''), q(r.acked?.slice(0, 10) ?? '')].join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'acknowledgements.csv';
    a.click();
  };
  type Row = (typeof rows)[number];
  const cols: TableColumn<Row>[] = [
    { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.department ?? undefined }), width: 220 },
    { key: 'location', header: 'Location', value: (r) => r.location ?? '—', width: 160 },
    { key: 'read', header: 'Read', value: (r) => r.read ?? '', render: (r) => (r.read ? formatDate(day(r.read)) : 'Not yet'), width: 120 },
    ...(d.ackRequired ? [{ key: 'acked', header: 'Acknowledged', value: (r: Row) => r.acked ?? '', render: (r: Row) => (r.acked ? formatDate(day(r.acked)) : 'Not yet'), width: 140 }] : []),
    { key: 'status', header: 'Status', type: 'status', value: (r) => (d.ackRequired ? r.status : r.read ? 'Read' : 'Not read'), statusTone: (v) => (v === 'Acknowledged' || v === 'Read' ? 'success' : v === 'Not read' ? 'danger' : 'warning'), width: 200 },
  ];
  const open = rows.length - acked;
  return (
    <Frame>
      <PageHeader
        title={d.title}
        status={d.scheduled ? <Badge tone="info">Scheduled</Badge> : <Badge tone="success">Published</Badge>}
        facts={`${d.scheduled ? 'Scheduled for' : 'Published'} ${formatDate(day(d.publishAt))} · ${rows.length} people${d.ackRequired && d.ackDueOn ? ` · acknowledge by ${formatDate(day(d.ackDueOn))}` : ''}`}
        actions={
          <>
            <Button icon={Download} onClick={exportCsv}>Export</Button>
            {d.ackRequired && live.onRemind && (
              <Button variant="primary" icon={Bell} loading={busy} disabled={!d.canRemind || open === 0} onClick={() => void remind()}>
                {d.canRemind || open === 0 ? `Remind ${open} people` : 'Reminded today'}
              </Button>
            )}
          </>
        }
      />
      {failed && <InlineAlert tone="danger" title="Not sent">{failed}</InlineAlert>}
      <div className="yx-growth-kpis">
        <Meter label="Read" value={read} max={rows.length || 1} valueText={`${read} of ${rows.length}`} />
        {d.ackRequired && <Meter label="Acknowledged" value={acked} max={rows.length || 1} valueText={`${acked} of ${rows.length}`} />}
      </div>
      <DataTable label="Acknowledgement tracking" columns={cols} rows={rows} getRowId={(r) => r.id} empty={<EmptyState compact title="Nobody is in the audience today" />} />
    </Frame>
  );
}
