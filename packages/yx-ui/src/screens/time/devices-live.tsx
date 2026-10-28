// TIM-14 · Devices and kiosks, live: the designed DevicesScreen (ops.tsx) with the API's kiosks, phone requests and
// phones. Same tabs, tables, texts and dialogs; the set-up key HR must type on the tablet stays on screen until closed.
import { useState } from 'react';
import { Check, LogOut, Plus } from 'lucide-react';
import { Segment } from '../people/people-kit';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, NoAccessState } from '../../components/feedback';
import { FormField } from '../../components/field';
import { useToast } from '../../components/notify';
import { Icon } from '../../components/foundations';
import { TextField } from '../../components/inputs';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { useNarrow } from '../../components/stepper';
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar } from '../../components/filters';
import { Select } from '../../components/select';
import { formatDate } from '../../lib/format';
import { TimePage } from './time-kit';
import { relativeDue } from './time-logic';
import { useRun } from '../org/org-kit';
import type { LoadState } from './live/types';

export type KioskHealth = 'not_set_up' | 'online' | 'stale' | 'offline';
export interface DevicesData {
  kiosks: { id: string; code: string; place: string; locationId: string; location: string; entity: string; mode: 'attendance' | 'visitor'; status: KioskHealth; lastSeenAt: string | null; setupExpiresAt: string | null; checkInsToday: number | null }[];
  requests: { id: string; employeeId: string; person: string; site: string; model: string; oldModel: string | null; oldLastSeenAt: string | null; oldPhoneLost: boolean; reason: string; raisedAt: string }[];
  phones: { id: string; employeeId: string; person: string; model: string; appVersion: string | null; lastSeenAt: string | null; status: 'active' | 'inactive' | 'lost' | 'revoked' }[];
  locations: { id: string; name: string; entity: string }[];
  /** Legal entities of the company: more than one shows the Entity column. */
  entities: number;
  company?: string;
}
export interface KioskKey { code: string; setupCode: string; setupExpiresAt: string }
export interface LiveDevices {
  state: LoadState;
  onRetry?: () => void;
  data: DevicesData | null;
  /** "HR · <company>" under the title. */
  company?: string;
  onRegister: (input: { place: string; locationId: string; mode: 'attendance' | 'visitor' }) => Promise<KioskKey>;
  onReset: (kioskId: string) => Promise<KioskKey>;
  onApprove: (requestId: string) => Promise<unknown>;
  onRefuse: (requestId: string, reason: string) => Promise<unknown>;
  onSignOut: (phoneId: string) => Promise<unknown>;
  /** For tests. */
  now?: Date;
}

type Kiosk = DevicesData['kiosks'][number];
type BindReq = DevicesData['requests'][number];
type Phone = DevicesData['phones'][number];
const STATUS: Record<KioskHealth, string> = { online: 'Online', stale: 'Stale', offline: 'Offline', not_set_up: 'Not set up' };
const PHONE_STATUS: Record<Phone['status'], string> = { active: 'Active', inactive: 'Inactive', lost: 'Lost', revoked: 'Signed out' };
const REJECT_REASONS = ['Phone model not allowed', 'Ask them to visit HR with the phone', "Request doesn't match our records"].map((r) => ({ value: r, label: r }));
const KIOSK_W = 320;
const pad = { paddingBlock: 'var(--yx-space-1)', flex: 'none' } as const;
const first = (name?: string) => name?.split(' ')[0] ?? '';
const time12 = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();

/** "1 min ago", "3 h ago", "2 days ago"; never seen: "Not yet". */
export function seenAgo(iso: string | null, now: Date): string {
  if (!iso) return 'Not yet';
  const m = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (m < 60) return `${Math.max(m, 1)} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}
/** A phone's last contact: "Today, 9:38 am", "Yesterday, 6:40 pm" or the date. */
function seenOn(iso: string | null, now: Date): string {
  if (!iso) return 'Not yet';
  const d = new Date(iso);
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5);
  return days === 0 ? `Today, ${time12(d)}` : days === 1 ? `Yesterday, ${time12(d)}` : formatDate(d);
}

export function LiveDevicesScreen({ live }: { live: LiveDevices }) {
  const now = live.now ?? new Date();
  const narrow = useNarrow(599);
  const { toast } = useToast();
  const note = (title: string) => toast({ tone: 'success', title });
  const { busy, error, run } = useRun();
  const d = live.data;
  const [so, setSo] = useState<Phone | null>(null);
  const [approving, setApproving] = useState<BindReq | null>(null);
  const [rejecting, setRejecting] = useState<BindReq | null>(null);
  const [rejectWhy, setRejectWhy] = useState<string | null>(null);
  const [rejectTried, setRejectTried] = useState(false);
  const [resetting, setResetting] = useState<Kiosk | null>(null);
  const [registering, setRegistering] = useState(false);
  const [regTried, setRegTried] = useState(false);
  const [reg, setReg] = useState<{ place: string; locationId: string | null; mode: 'attendance' | 'visitor' }>({ place: '', locationId: null, mode: 'attendance' });
  // The key HR types on the tablet: shown until closed (it is not shown again).
  const [key, setKey] = useState<(KioskKey & { where: string }) | null>(null);
  const [q, setQ] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const kiosks = d?.kiosks ?? [];
  const binds = d?.requests ?? [];
  const phones = d?.phones ?? [];
  const many = (d?.entities ?? 1) > 1;
  const offline = kiosks.filter((k) => k.status === 'offline');
  const isIssue = (p: Phone) => p.status === 'lost' || p.status === 'inactive';
  const shownPhones = phones.filter((p) => (!onlyIssues || isIssue(p)) && `${p.person} ${p.model}`.toLowerCase().includes(q.trim().toLowerCase()));
  const issueCount = phones.filter(isIssue).length;
  const tableState = live.state === 'loading' ? 'loading' : live.state === 'error' ? 'error' : 'ready';
  const kcols: TableColumn<Kiosk>[] = [
    { key: 'code', header: 'Kiosk', type: 'id', width: KIOSK_W, value: (r) => r.code, render: (r) => <span className="yx-tim-list__main" style={pad}><strong>{r.code}</strong><span className="yx-tim-muted">{r.place} · {r.location}</span></span> },
    ...(many ? [{ key: 'entity', header: 'Entity', value: (r: Kiosk) => r.entity } as TableColumn<Kiosk>] : []),
    { key: 'mode', header: 'Mode', width: 110, value: (r) => (r.mode === 'visitor' ? 'Visitor' : 'Attendance'), optional: true },
    { key: 'lastSeen', header: 'Last seen', width: 130, value: (r) => (r.status === 'not_set_up' ? 'Not yet' : seenAgo(r.lastSeenAt, now)) },
    { key: 'status', header: 'Status', type: 'status', width: 120, value: (r) => STATUS[r.status], statusTone: (v) => (v === 'Online' ? 'success' : v === 'Offline' ? 'danger' : v === 'Stale' ? 'warning' : 'neutral') },
    {
      key: 'uses', header: 'Check-ins', type: 'number', width: 120,
      value: (r) => (r.mode === 'visitor' || r.checkInsToday === null ? null : r.checkInsToday),
      // An offline tablet keeps its check-ins until it syncs, so a count would be wrong.
      render: (r) => (r.mode === 'visitor' || r.status === 'not_set_up' ? '—' : r.status === 'offline' ? <span className="yx-tim-muted">Not synced</span> : r.checkInsToday),
    },
  ];
  const bcols: TableColumn<BindReq>[] = [
    { key: 'person', header: 'Employee', type: 'person', value: (r) => r.person, person: (r) => ({ name: r.person }) },
    {
      key: 'change', header: 'Phone change', value: (r) => r.model,
      render: (r) => (
        <span className="yx-tim-list__main" style={pad}>
          <span>{r.oldModel ? `${r.oldModel}${r.oldPhoneLost ? ' (lost)' : ''} → ${r.model}` : `First phone: ${r.model}`}</span>
          <span className="yx-tim-muted">{r.reason || 'No reason given'}</span>
        </span>
      ),
    },
    {
      key: 'raised', header: 'Raised', type: 'date', width: 170, value: (r) => new Date(r.raisedAt),
      render: (r) => {
        const raised = new Date(r.raisedAt);
        const age = relativeDue(raised, now);
        // Someone with a lost phone can't check in by phone, so a wait of more than a day is flagged.
        return <span className="yx-tim-row">{formatDate(raised)}<Badge tone={r.oldPhoneLost && age.days < -1 ? 'warning' : 'neutral'}>{age.text.charAt(0).toUpperCase() + age.text.slice(1)}</Badge></span>;
      },
    },
  ];
  const pcols: TableColumn<Phone>[] = [
    { key: 'person', header: 'Employee', type: 'person', width: 240, value: (r) => r.person, person: (r) => ({ name: r.person, secondary: r.model }) },
    { key: 'app', header: 'App version', value: (r) => r.appVersion ?? '—', optional: true },
    {
      key: 'lastSeen', header: 'Last seen', value: (r) => seenOn(r.lastSeenAt, now),
      render: (r) => (r.status === 'inactive' && r.lastSeenAt ? <span className="yx-tim-row">{seenOn(r.lastSeenAt, now)}<Badge tone="warning">{relativeDue(new Date(r.lastSeenAt), now).text}</Badge></span> : seenOn(r.lastSeenAt, now)),
    },
    { key: 'status', header: 'Status', type: 'status', value: (r) => PHONE_STATUS[r.status], statusTone: (v) => (v === 'Active' ? 'success' : v === 'Lost' ? 'danger' : v === 'Inactive' ? 'warning' : 'neutral') },
  ];
  const kioskAt = (site: string) => kiosks.some((k) => k.location === site && k.mode === 'attendance' && k.status !== 'not_set_up');
  /** What the person can do after a refusal. */
  const rejectEffect = (r: BindReq) => {
    const f = first(r.person);
    if (r.oldPhoneLost && r.oldModel) return `The lost ${r.oldModel} stays signed out, so ${f} can't check in by phone until a new phone is approved.`;
    if (r.oldModel) return `${f} is told why and keeps using the ${r.oldModel}.`;
    return `${f} is told why and can check in ${kioskAt(r.site) ? `at a kiosk at ${r.site}` : 'on the web or at the HR desk'} meanwhile.`;
  };
  const approve = (r: BindReq) =>
    run(`approve-${r.id}`, async () => {
      await live.onApprove(r.id);
      const f = first(r.person);
      note(`${f}'s ${r.model} approved · ${f} can check in from it now.${r.oldModel ? ` The ${r.oldPhoneLost ? 'lost ' : ''}${r.oldModel} is signed out.` : ''}`);
      setApproving(null);
    });
  const register = () => {
    setRegTried(true);
    if (!reg.place.trim() || !reg.locationId) {
      document.getElementById(!reg.place.trim() ? 'yx-dev-place' : 'yx-dev-location')?.focus();
      return;
    }
    const loc = d?.locations.find((l) => l.id === reg.locationId);
    void run('register', async () => {
      const k = await live.onRegister({ place: reg.place.trim(), locationId: reg.locationId!, mode: reg.mode });
      note(`${k.code} registered. Enter the set-up key on the tablet at ${reg.place.trim()}, ${loc?.name ?? ''}.`);
      setKey({ ...k, where: `${reg.place.trim()}, ${loc?.name ?? ''}` });
      setRegistering(false);
      setRegTried(false);
      setReg({ place: '', locationId: null, mode: 'attendance' });
    });
  };
  const registerBtn = <Button variant="primary" icon={Plus} onClick={() => setRegistering(true)}>Register kiosk</Button>;
  if (live.state === 'no-access') return <TimePage active="Devices & kiosks"><NoAccessState grantedBy="your System Admin" what="devices and kiosks" note="Kiosks and phones are company-wide set-up." /></TimePage>;
  return (
    <TimePage active="Devices & kiosks">
      <PageHeader title="Devices and kiosks" description={`HR · ${live.company ?? d?.company ?? 'all locations'}`} actions={registerBtn} />
      {key && (
        <InlineAlert tone="info" title={`Set-up key for ${key.code}: ${key.setupCode}`} actions={<Button size="sm" onClick={() => setKey(null)}>Done</Button>}>
          Open the kiosk page on the tablet at {key.where} and type this key before {time12(new Date(key.setupExpiresAt))}. It works once and is not shown again.
        </InlineAlert>
      )}
      {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
      {live.state === 'error' ? (
        <ErrorState title="Devices could not load" description="Check your connection and try again." onRetry={live.onRetry} />
      ) : (
        <Tabs defaultValue="kiosks">
          <TabsList aria-label="Devices">
            <TabsTrigger value="kiosks">Kiosks</TabsTrigger>
            <TabsTrigger value="binds" count={binds.length}>{narrow ? 'Requests' : 'New phone requests'}</TabsTrigger>
            <TabsTrigger value="phones">{narrow ? 'Phones' : 'Employee phones'}</TabsTrigger>
          </TabsList>
          <TabsContent value="kiosks">
            <div className="yx-tim-stack">
              {offline.map((k) => (
                <InlineAlert key={k.id} tone="danger" title={`${k.code} · ${k.place} has been offline for ${seenAgo(k.lastSeenAt, now).replace(' ago', '')}`}>
                  Check-ins on it are kept on the tablet and sync when it's back. Check power and Wi-Fi at the {k.place.toLowerCase()}.
                </InlineAlert>
              ))}
              <DataTable
                label="Kiosks"
                columns={kcols}
                rows={kiosks}
                getRowId={(r) => r.id}
                state={tableState}
                onRetry={live.onRetry}
                empty={<EmptyState title="No kiosks registered" description="Register a site tablet so people without phones can check in with code and PIN." action={registerBtn} />}
                rowButtons={(r) => <Button size="sm" onClick={() => setResetting(r)}>{r.status === 'not_set_up' ? 'New set-up key' : 'Reset kiosk key'}</Button>}
              />
              {live.state === 'ready' && kiosks.length > 0 && <p className="yx-tim-note">Check-ins: today so far. Stale: not seen for 15 min or more. Offline: not seen for an hour or more.</p>}
            </div>
          </TabsContent>
          <TabsContent value="binds">
            <div className="yx-tim-stack">
              <DataTable
                label="New phone requests"
                columns={bcols}
                rows={binds}
                getRowId={(r) => r.id}
                state={tableState}
                onRetry={live.onRetry}
                empty={<EmptyState title="No new phone requests" description="Requests appear here when someone signs in on a phone that isn't approved yet." />}
                rowButtons={(r) => <><Button size="sm" onClick={() => { setRejectWhy(null); setRejectTried(false); setRejecting(r); }}>Reject</Button><Button variant="approve" size="sm" loading={busy === `approve-${r.id}`} onClick={() => (r.oldModel ? setApproving(r) : void approve(r))}>Approve</Button></>}
              />
            </div>
          </TabsContent>
          <TabsContent value="phones">
            <DataTable
              label="Employee phones"
              columns={pcols}
              rows={shownPhones}
              getRowId={(r) => r.id}
              state={tableState}
              onRetry={live.onRetry}
              toolbar={
                <FilterBar fields={[]} value={[]} onChange={() => {}} search={q} onSearchChange={setQ} searchPlaceholder="Search name or phone">
                  <button type="button" className="yx-ppl__chip yx-ppl__chip--toggle" aria-pressed={onlyIssues} onClick={() => setOnlyIssues(!onlyIssues)}>
                    {onlyIssues && <Icon icon={Check} size="sm" />}
                    Only lost or inactive ({issueCount})
                  </button>
                </FilterBar>
              }
              filtered={!!q.trim() || onlyIssues}
              onClearFilters={() => { setQ(''); setOnlyIssues(false); }}
              empty={<EmptyState title="No approved phones yet" description="Phones appear here once you approve a new phone request." />}
              rowButtons={(r) =>
                r.status === 'lost' ? (
                  <Button variant="danger" size="sm" icon={LogOut} onClick={() => setSo(r)}>Sign out remotely</Button>
                ) : r.status === 'inactive' || r.status === 'active' ? (
                  <Button size="sm" icon={LogOut} onClick={() => setSo(r)}>Sign out phone</Button>
                ) : null
              }
            />
          </TabsContent>
        </Tabs>
      )}
      <ConfirmDialog
        open={!!resetting}
        onOpenChange={(o) => !o && setResetting(null)}
        destructive
        title={`Reset ${resetting?.code}'s key?`}
        consequence={`The ${resetting?.place} tablet at ${resetting?.location} stops ${resetting?.mode === 'visitor' ? 'signing in visitors' : 'recording check-ins'} until someone enters the new key on it.`}
        confirmLabel="Reset key"
        onConfirm={() => {
          const k = resetting;
          if (!k) return;
          void run(`reset-${k.id}`, async () => {
            const key2 = await live.onReset(k.id);
            note(`${k.code} key reset · enter the new key on the ${k.place} tablet.`);
            setKey({ ...key2, where: `${k.place}, ${k.location}` });
          });
          setResetting(null);
        }}
      />
      <Dialog
        open={registering}
        onOpenChange={(o) => { setRegistering(o); if (!o) setRegTried(false); }}
        title="Register kiosk"
        footer={
          <>
            {(!reg.place.trim() || !reg.locationId) && <span className="yx-tim-muted">Enter the place and location</span>}
            <Button onClick={() => setRegistering(false)}>Cancel</Button>
            {/* Never disabled: pressed too early, the missing field says so and gets the focus. */}
            <Button variant="primary" loading={busy === 'register'} onClick={register}>Register kiosk</Button>
          </>
        }
      >
        <div className="yx-tim-form">
          <FormField id="yx-dev-place" label="Place on site" required helper="Where the tablet is mounted, e.g. Gate 2" error={regTried && !reg.place.trim() ? 'Enter the place on site.' : undefined}>
            <TextField value={reg.place} onChange={(place) => setReg((x) => ({ ...x, place }))} />
          </FormField>
          <FormField id="yx-dev-location" label="Location" required error={regTried && !reg.locationId ? 'Choose a location.' : undefined}>
            <Select options={(d?.locations ?? []).map((l) => ({ value: l.id, label: many ? `${l.name} · ${l.entity}` : l.name }))} value={reg.locationId} onChange={(locationId) => setReg((x) => ({ ...x, locationId }))} placeholder="Choose a location" />
          </FormField>
          <FormField label="Mode">
            <Segment label="Mode" value={reg.mode} onChange={(mode) => setReg((x) => ({ ...x, mode }))} options={[{ value: 'attendance', label: 'Attendance' }, { value: 'visitor', label: 'Visitor' }]} />
          </FormField>
        </div>
      </Dialog>
      <Dialog
        open={!!rejecting}
        onOpenChange={(o) => !o && setRejecting(null)}
        title={`Reject ${first(rejecting?.person)}'s ${rejecting?.model}?`}
        description={rejecting ? rejectEffect(rejecting) : undefined}
        footer={
          <>
            {!rejectWhy && <span className="yx-tim-muted">Choose a reason</span>}
            <Button onClick={() => setRejecting(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={busy === 'reject'}
              onClick={() => {
                setRejectTried(true);
                const r = rejecting;
                if (!r) return;
                if (!rejectWhy) return void document.getElementById('yx-dev-reason')?.focus();
                void run('reject', async () => {
                  await live.onRefuse(r.id, rejectWhy);
                  note(`Rejected · ${first(r.person)} is told why: ${rejectWhy.toLowerCase()}.`);
                  setRejecting(null);
                });
              }}
            >
              Reject request
            </Button>
          </>
        }
      >
        <FormField id="yx-dev-reason" label="Reason sent to the employee" required error={rejectTried && !rejectWhy ? 'Choose a reason.' : undefined}>
          <Select options={REJECT_REASONS} value={rejectWhy} onChange={setRejectWhy} placeholder="Choose a reason" />
        </FormField>
      </Dialog>
      <ConfirmDialog
        open={!!so}
        onOpenChange={(o) => !o && setSo(null)}
        destructive
        title={`Sign out ${first(so?.person)}'s ${so?.model}?`}
        consequence={`${first(so?.person)} is signed out at once (on every device, as sign-ins are not tied to one phone), and the ${so?.model} can't record check-ins. ${
          so && binds.some((b) => b.employeeId === so.employeeId) ? `${first(so.person)} can use the app again once the new phone is approved.` : `If ${first(so?.person)} uses it again, it comes back here as a new phone request.`
        }`}
        confirmLabel="Sign out phone"
        onConfirm={() => {
          const p = so;
          if (!p) return;
          void run(`out-${p.id}`, async () => {
            await live.onSignOut(p.id);
            note(`${first(p.person)}'s ${p.model} is signed out.`);
          });
          setSo(null);
        }}
      />
      <ConfirmDialog
        open={!!approving}
        onOpenChange={(o) => !o && setApproving(null)}
        confirmVariant="approve"
        title={`Approve ${first(approving?.person)}'s ${approving?.model}?`}
        consequence={
          approving?.oldPhoneLost
            ? `The lost ${approving.oldModel} is signed out in the same step, so only the new phone can record check-ins.`
            : `${first(approving?.person)}'s ${approving?.oldModel} (last seen ${approving ? seenOn(approving.oldLastSeenAt, now).toLowerCase() : ''}) is signed out in the same step, so only the new phone can record check-ins.`
        }
        confirmLabel={`Approve and sign out ${approving?.oldModel}`}
        onConfirm={() => { if (approving) void approve(approving); }}
      />
    </TimePage>
  );
}
