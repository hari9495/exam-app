'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, ConfirmDialog, FormField, Select, TextArea, TextField, formatPhone, useToast, type ActivityEntry } from '@yukthix/ui';
import { ContactsDrawer, CustomFieldsDrawer, FamilyDrawer, PersonWorkspace, type RecordCustomField, type FieldRow, type LiveRecord, type LiveRecordPay, type RecordDoc } from '@yukthix/ui/frame';
import { CancelDialog, ChangeDialog, PersonalDialog, type ProfileRequest, type ProfileView, type RevealField } from '@yukthix/ui/access';
import { ChangeDrawer, draftForm, type AsOfView, type HistoryView, type PersonOption } from '@yukthix/ui/history';
import type { AssetRow, QueueDocument } from '@yukthix/ui/lifecycle';
import { todayIst, useOrg, useYxPermissions, type Reference } from '../../../../lib/yx-org';
import { useChangeOptions, useMove, usePeople, usePeopleRead, usePeopleWrite, useRaiseChange } from '../../../../lib/yx-people';
import { useDocumentDownload, useLife, useLifeWrite } from '../../../../lib/yx-lifecycle';
import { useTime } from '../../../../lib/yx-time';
import { usePayRead } from '../../../../lib/yx-pay';
import { assetRows, attendanceCard, bankRows, currentPeriod, customRows, docRows, familyData, leaveOrder, payShown, type Compensation, type PersonMonth, historyRows, identityRows, jobRows, performanceData, personalRows, scheduledNotes, upcoming, type ReverifDue } from '../../../../lib/yx-record';
import { usePerf } from '../../../../lib/yx-performance';
import { reportErrors, UploadDocDialog, type AskableType } from './upload-doc-dialog';

const id = encodeURIComponent;
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface PersonRoles {
  id: string;
  company: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  roles: { id: string; roleType: string; startOn: string; endOn: string | null; label: string }[];
}
interface Balance {
  name: string;
  kind: string;
  hasBalance: boolean;
  available: number;
  entitlement: number | null;
  takenThisYear: number;
}
interface WorkAuths {
  designation: string | null;
  reminderDays: number[];
  rows: { id: string; kind: 'employment_visa' | 'residence_visa' | 'work_permit' | 'national_id' | 'passport'; country: string | null; number: string; sponsor: string | null; occupation: string | null; issuedOn: string | null; expiresOn: string; remindedDays: number[] }[];
}
interface IdentityChecks {
  checks: { kind: 'day1' | 'attested' | 'requested'; at: string; by: string | null; note: string | null }[];
  idTypes: { key: string; name: string }[];
  canManage: boolean;
}
interface PersonDocs {
  personId: string;
  documents: QueueDocument[];
  askable: AskableType[];
  canManage: boolean;
}

const LOCKED_PERSONAL: FieldRow[] = ['Date of birth', 'Gender', 'Marital status', 'Personal email', 'Personal phone', 'Home address'].map((label) => ({ label, value: '', cls: 'Personal' as const }));
const LOCKED_IDENTITY: FieldRow[] = [
  ...['Legal name', 'PAN', 'UAN', 'Salary account', 'Passport'].map((label) => ({ label, value: '', cls: 'Confidential' as const })),
  { label: 'Aadhaar', value: '', cls: 'Special' as const },
];

const ROLE: Record<string, string> = { employee: 'Employee', login: 'Login', candidate: 'Candidate', consultant: 'Consultant', contract_worker: 'Contract worker', preboarder: 'Joiner', external_login: 'Help desk contact', alumni: 'Former employee' };

// People › person record (PPL-03, design audit step 3): the designed record with the live person. Opened from the
// Directory (HR, anyone their grants reach), My team (a manager, their team) and Profile (the person). The API decides
// every class: Personal for the person and personal-data access, identity and bank masked with a recorded "Show",
// pay only after "Show pay" (R1), documents and assets by their own keys.
export function PersonRecord({ personParam, path }: { personParam: string | null; path: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const perms = useYxPermissions();
  const { toast } = useToast();
  const today = todayIst();
  const me = usePeople<{ employeeId: string }>('/me');
  const personId = personParam ?? me.data?.employeeId ?? null;
  const asOfParam = params.get('asOf');
  const hr = perms.has('employee.profile.view');
  const canChange = perms.has('employee.change.manage');
  const p = id(personId ?? '');
  const profile = usePeople<ProfileView>(personId ? `/employees/${p}/profile` : null);
  const view = usePeople<AsOfView>(personId ? `/employees/${p}/as-of?date=${id(asOfParam ?? today)}` : null);
  const history = usePeople<HistoryView>(personId ? `/employees/${p}/history` : null);
  const person = usePeople<PersonRoles>(personId ? `/employees/${p}/person` : null);
  // Additional details: the API sends only the fields (and values) the viewer's class access allows.
  const custom = usePeople<{ fields: RecordCustomField[] }>(personId ? `/employees/${p}/custom-fields` : null);
  const requests = usePeople<{ rows: ProfileRequest[] }>(personId ? '/profile-requests?status=pending' : null);
  const reference = useOrg<Reference>('/reference');
  const self = Boolean(profile.data?.self);
  // A manager (no document keys) reads the team member's documents below Confidential (founder 20 Oct 2026).
  const teamView = Boolean(profile.data && !profile.data.self && !hr);
  const docs = useLife<PersonDocs>(
    self ? '/documents/me' : person.data && (perms.has('document.view') || perms.has('document.manage')) ? `/documents/people/${id(person.data.id)}` : teamView && profile.data?.personId ? `/documents/team/${id(profile.data.personId)}` : null,
  );
  // PPL-42: "Re-verification due" for the person, HR with document.manage, or the manager (the API decides).
  const reverif = useLife<{ items: ReverifDue[] }>(personId && profile.data && (self || teamView || perms.has('document.manage')) ? `/documents/reverification/person/${p}` : null);
  const assets = useLife<{ rows: AssetRow[] }>(perms.has('asset.view') ? '/lifecycle/assets' : null);
  const teamAssets = useLife<{ rows: { tag: string; name: string; issuedOn: string; condition: string; acknowledged: boolean }[] }>(teamView && !perms.has('asset.view') && personId ? `/lifecycle/people/${p}/assets` : null);
  const teamLeave = useTime<{ balances: Balance[] }>(teamView && !perms.has('leave.view') && personId ? `/people/${p}/balances` : null);
  const myAssets = useLife<{ rows: { assignmentId: string; name: string; tag: string; issuedOn: string; condition: string; acknowledgedAt: string | null }[] }>(self && !perms.has('asset.view') ? '/lifecycle/me/assets' : null);
  const balances = useTime<{ people: { employeeId: string; balances: Balance[] }[] }>(personId && !self && perms.has('leave.view') ? '/hr/balances' : null);
  const myLeave = useTime<{ balances: Balance[] }>(self ? '/me/leave' : null);
  // Attendance this month: the muster's scope (the person, their managers, attendance.view in scope).
  const month = useTime<PersonMonth>(personId && (self || teamView || perms.has('attendance.view')) ? `/people/${p}/attendance?month=${today.slice(0, 7)}` : null);
  const people = usePeople<PersonOption[]>(canChange ? '/employees' : null);
  const options = useChangeOptions(people.data ?? [], perms.has('employee.salary.manage'), canChange);
  const raise = useRaiseChange();
  const move = useMove(people.data ?? [], canChange);
  const write = usePeopleWrite();
  const lifeWrite = useLifeWrite();
  const download = useDocumentDownload();
  const payRead = usePayRead();
  // PPL-45: HR who sees the person's identity class.
  const workAuth = usePeople<WorkAuths>(hr && profile.data && !profile.data.self && profile.data.classes.identity ? `/employees/${p}/work-authorisations` : null);
  const activity = usePeople<{ entries: { id: string; kind: ActivityEntry['kind']; actor: string | null; at: string; text: string }[] }>(personId ? `/employees/${p}/activity` : null);
  // Performance tab: for the person, their managers (the API decides) and perf.goal.view / perf.review.view.
  const perfAllowed = Boolean(profile.data) && (Boolean(profile.data?.self) || !hr || perms.has('perf.goal.view') || perms.has('perf.review.view'));
  const periods = usePerf<{ id: string; name: string; fromOn: string; toOn: string; status: string }[]>(perfAllowed ? '/goal-periods' : null);
  const periodId = periods.data ? currentPeriod(periods.data, today) : null;
  const goals = usePerf<{ goals: { id: string; title: string; status: string; progress: number }[] }>(perfAllowed && periodId ? `/goals?period=${id(periodId)}&view=${profile.data?.self ? 'mine' : 'employee'}${profile.data?.self ? '' : `&employeeId=${p}`}` : null);
  const reviews = usePerf<{ employeeId: string; cycle: string; status: string; band: string | null }[]>(perfAllowed ? `/reviews?view=${profile.data?.self ? 'mine' : hr && perms.has('perf.review.view') ? 'scope' : 'team'}` : null);
  const meetings = usePerf<{ meetings: { with: string; on: string; status: string }[] }>(perfAllowed && !profile.data?.self ? '/one-on-ones' : null);
  // Counts only (PPL-03); the API decides who may ask (the person, their managers, HR with review access).
  const feedbackCounts = usePerf<{ received: number; given: number }>(perfAllowed ? `/feedback/employee/${p}/counts` : null);

  const [editing, setEditing] = useState(false);
  const [familyEdit, setFamilyEdit] = useState<'family' | 'contacts' | 'custom' | null>(null);
  const [changing, setChanging] = useState(false);
  const [withdrawing, setWithdrawing] = useState<ProfileRequest | null>(null);
  const [starting, setStarting] = useState(false);
  const [pay, setPay] = useState<{ busy: boolean; error: string | null; data: Compensation | null }>({ busy: false, error: null, data: null });
  const [docDialog, setDocDialog] = useState<{ kind: 'request' | 'reject'; doc?: RecordDoc } | null>(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [phone, setPhone] = useState('');
  // PPL-34: loaded each time HR opens the identity panel (every load is a recorded view of Special data).
  const [ids, setIds] = useState<{ state: 'idle' | 'loading' | 'error' | 'ready'; data: IdentityChecks | null }>({ state: 'idle', data: null });
  const read = usePeopleRead();
  const loadIds = async () => {
    setIds((x) => ({ state: 'loading', data: x.data }));
    try {
      setIds({ state: 'ready', data: await read<IdentityChecks>(`/employees/${p}/identity-checks`) });
    } catch {
      setIds({ state: 'error', data: null });
    }
  };

  const reveal = async (field: RevealField) => (await write<{ value: string }>('POST', `/employees/${p}/identity/reveal`, { field })).value;
  const done = (title: string) => toast({ tone: 'success', title });
  // A refusal from the server (e.g. "The file has not passed the virus check yet.") is a plain message, never a crash.
  const refused = (message: string) => toast({ tone: 'error', title: message });

  const v = view.data ?? null;
  const h = history.data ?? null;
  const prof = profile.data ?? null;
  const pending = (requests.data?.rows ?? []).filter((r) => r.employeeId === personId && r.status === 'pending');
  const docList = docs.data?.documents ?? [];
  const persona = hr ? 'hr' : self ? 'emp' : 'mgr';
  const relation = self ? 'self' : hr ? 'other' : 'team';
  const name = prof?.name ?? v?.employee.name ?? '';
  const first = name.split(' ')[0];

  const showPay = async () => {
    setPay({ busy: true, error: null, data: null });
    try {
      setPay({ busy: false, error: null, data: await payRead<Compensation>(`/employees/${p}/compensation`) });
    } catch {
      setPay({ busy: false, error: `${first}'s pay could not be loaded. Try again in a moment.`, data: null });
    }
  };
  const payState: LiveRecordPay = !v?.payAccess
    ? { kind: 'none', grantedBy: hr ? 'your company admin' : 'HR, who can give a salary grant for your team' }
    : pay.data
      ? payShown(pay.data, prof ? bankRows(prof, reveal) : [])
      : { kind: 'ask', onShow: () => void showPay(), busy: pay.busy, error: pay.error };

  const leave = self ? myLeave.data?.balances : (balances.data?.people.find((x) => x.employeeId === personId)?.balances ?? teamLeave.data?.balances);
  const time: LiveRecord['time'] = leave
    ? {
        balances: leaveOrder(leave.filter((b) => b.hasBalance && b.entitlement)).map((b) => ({ type: b.name, used: Math.max(0, b.entitlement! - b.available), total: b.entitlement! })),
        unpaid: leave.find((b) => b.kind === 'lop')?.takenThisYear ?? null,
        attendance: month.data ? attendanceCard(month.data) : null,
      }
    : null;

  const assetList = useMemo(
    () =>
      self && myAssets.data
        ? myAssets.data.rows.map((a) => ({ tag: a.tag, name: a.name, issued: day(a.issuedOn), condition: a.condition, ack: a.acknowledgedAt ? 'Acknowledged' : 'Waiting' }))
        : assets.data && personId
          ? assetRows(assets.data.rows, personId)
          : teamAssets.data
            ? teamAssets.data.rows.map((a) => ({ tag: a.tag, name: a.name, issued: day(a.issuedOn), condition: a.condition, ack: a.acknowledged ? 'Acknowledged' : 'Waiting' }))
            : null,
    [self, myAssets.data, assets.data, teamAssets.data, personId],
  );

  const docAction = async (d: RecordDoc, decision: 'verify' | 'reject', reason?: string) => {
    const doc = docList.find((x) => x.id === d.id);
    if (!doc) return;
    await lifeWrite('POST', `/documents/${id(doc.id)}/decision`, { decision, version: doc.version, ...(reason ? { reason } : {}) });
    done(decision === 'verify' ? `${d.type} of ${first} verified` : `${d.type} sent back to ${first}`);
  };

  const a = v?.assignment;
  const workEmail = prof?.work?.email ?? person.data?.primaryEmail ?? null;
  const live: LiveRecord = {
    directoryHref: '/yx/people/directory',
    name,
    role: a?.designation?.name ?? '',
    department: a?.department?.name ?? '',
    location: a?.location.name ?? '',
    code: v?.employee.employeeCode ?? prof?.employeeCode ?? '',
    manager: a?.manager?.name ?? '',
    joined: v?.employee.joinedOn ? day(v.employee.joinedOn) : null,
    grade: a?.grade?.name ?? null,
    badges: [
      ...(v?.employee.exitedOn ? [{ label: `Left on ${day(v.employee.exitedOn).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`, tone: 'neutral' as const }] : [{ label: 'Active', tone: 'success' as const }]),
      ...(v?.status?.status === 'probation' ? [{ label: 'On probation', tone: 'warning' as const }] : v?.status?.status === 'notice' ? [{ label: 'Serving notice', tone: 'warning' as const }] : []),
      ...(!asOfParam ? scheduledNotes(h ?? ({ changes: [] } as unknown as HistoryView)).slice(0, 1).map((s) => ({ label: s.title.replace('Scheduled: ', '').replace(/^./, (c) => c.toUpperCase()), tone: 'info' as const })) : []),
    ],
    facts: [
      ...(workEmail ? [{ label: 'Work email', value: workEmail }] : []),
      ...(prof?.work ? [{ label: 'Work phone', value: prof.work.phone ? formatPhone(prof.work.phone) : 'Not on file' }] : []),
      ...(a?.dottedLineManagers?.length ? [{ label: 'Secondary manager', value: a.dottedLineManagers.map((m) => m.name).join(', ') }] : []),
      ...(a?.employmentType ? [{ label: 'Employment type', value: a.employmentType.name ?? '' }] : []),
      ...(v?.employee.legalEntity ? [{ label: 'Legal entity', value: v.employee.legalEntity.name }] : []),
    ],
    events: upcoming(v, h, today, pending.map((r) => r.label), docList, reverif.data?.items ?? []),
    // Without the class the design still shows the card, with how many fields are not shown (never their values).
    personal: prof?.personal ? personalRows(prof.personal) : prof?.classes.internal ? [...(prof.birthday ? [{ label: 'Birthday (shown in directory)', value: day(`2000-${prof.birthday}`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), cls: 'Internal' as const }] : []), ...LOCKED_PERSONAL] : null,
    identity: prof?.identity ? identityRows(prof, reveal) : prof?.classes.internal ? LOCKED_IDENTITY : null,
    pending: pending.map((r) => ({
      id: r.id,
      label: r.label,
      detail: `Sent on ${day(r.requestedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.${r.reason ? ` ${r.reason}` : ''}`,
      ...(r.mine || self ? { onWithdraw: () => setWithdrawing(r) } : {}),
    })),
    ...(prof?.can.editPersonal && prof.personal ? { onEditPersonal: () => setEditing(true) } : {}),
    // PPL-32: one's own change is the Me › Change requests page (with proof); HR raising one for someone keeps the dialog.
    ...(prof?.can.requestChange ? { onRequestChange: () => (prof.self ? router.push('/yx/me/change-requests') : setChanging(true)) } : {}),
    // Family and nominations: HR edits them; emergency contacts: the person too (whoever may edit Personal details).
    family: prof?.family
      ? { ...familyData(prof.family), ...(prof.can.editFamily ? { onEdit: () => setFamilyEdit('family') } : {}), ...(prof.can.editPersonal ? { onEditContacts: () => setFamilyEdit('contacts') } : {}) }
      : null,
    custom: custom.data?.fields.length ? { rows: customRows(custom.data.fields), ...(custom.data.fields.some((f) => f.canEdit) ? { onEdit: () => setFamilyEdit('custom') } : {}) } : null,
    job: v ? jobRows(v) : null,
    scheduled: h ? scheduledNotes(h, pay.data?.next) : [],
    pastChanges: h ? h.changes.filter((c) => c.status === 'effective').length : 0,
    pay: payState,
    time,
    documents: docs.data
      ? {
          rows: docRows(docList, today),
          hidden: 0,
          ...(docs.data.canManage && docs.data.askable.length ? { onRequest: () => setDocDialog({ kind: 'request' }) } : {}),
          // HR uploads on the person's behalf (the API checks document.manage in scope and scans the file).
          ...(docs.data.canManage && !self && docs.data.askable.length ? { onUpload: () => setUploading(true) } : {}),
          ...(docs.data.canManage ? { onVerify: (d: RecordDoc) => void reportErrors(() => docAction(d, 'verify'), refused), onReject: (d: RecordDoc) => setDocDialog({ kind: 'reject', doc: d }) } : {}),
          onDownload: (d: RecordDoc) => void reportErrors(() => download(d.id!, `${d.type}.pdf`), refused),
        }
      : null,
    assets: assetList ? { rows: assetList, ...(perms.has('asset.manage') ? { onIssue: () => router.push('/yx/people/assets') } : {}) } : null,
    history: h
      ? {
          rows: historyRows(h, today),
          roles: (person.data?.roles ?? []).filter((r) => r.roleType !== 'login').map((r) => ({ role: ROLE[r.roleType] ?? r.roleType, from: day(r.startOn), to: r.endOn ? day(r.endOn) : null, link: r.label })),
          company: person.data?.company,
        }
      : null,
    asOf: asOfParam ? day(asOfParam) : null,
    onAsOf: (d) => {
      const q = new URLSearchParams(params.toString());
      if (d && iso(d) !== today) q.set('asOf', iso(d));
      else q.delete('asOf');
      router.replace(`${path}${q.size ? `?${q}` : ''}`);
    },
    ...(canChange && !self ? { onStartChange: () => setStarting(true) } : {}),
    // A manager proposes a change for a team member on the change form (raised on their behalf, HR approves).
    ...(!canChange && !self && !hr && perms.has('request.raise_on_behalf') ? { onStartChange: () => router.push(`/yx/people/changes?person=${p}`) } : {}),
    // Message: the person's work email in the viewer's mail app (there is no in-app chat).
    ...(!self && workEmail ? { onMessage: () => window.location.assign(`mailto:${workEmail}`) } : {}),
    // PPL-46: the salary account abroad goes to approval like any bank change (HR with identity change rights, or the person).
    ...(prof?.can.requestChange ? { onBankAbroad: () => router.push(self ? '/yx/me/bank-abroad' : `/yx/people/directory/${p}/bank-abroad`) } : {}),
    ...(prof?.can.editWork ? { onEditWorkPhone: () => (setPhone(prof.work?.phone ?? ''), setPhoneOpen(true)) } : {}),
    activity: activity.data ? activity.data.entries.map((e) => ({ id: e.id, kind: e.kind, actor: e.actor ? { name: e.actor } : null, at: new Date(e.at), text: e.text })) : null,
    performance:
      perfAllowed && (goals.data || reviews.data) && personId
        ? { ...performanceData(periods.data ?? [], periodId, goals.data?.goals ?? [], reviews.data ?? [], meetings.data?.meetings ?? [], personId, name, today), feedback: feedbackCounts.data ? `${feedbackCounts.data.received} received · ${feedbackCounts.data.given} given` : null, onOpenGoals: () => router.push('/yx/performance/goals') }
        : null,
    workAuth: workAuth.data
      ? {
          rows: workAuth.data.rows.map((r) => ({ ...r, expires: day(r.expiresOn) })),
          designation: workAuth.data.designation,
          reminderDays: workAuth.data.reminderDays,
          // requestChange on someone else's record is employee.identity.manage for them.
          ...(prof?.can.requestChange
            ? {
                onAdd: async (input: object) => {
                  await write('POST', `/employees/${p}/work-authorisations`, input);
                  done(`Work authorisation added for ${first}`);
                },
              }
            : {}),
        }
      : null,
    ...(hr && !self && perms.has('employee.aadhaar.view')
      ? {
          identityPanel: {
            state: ids.state,
            onOpen: () => void loadIds(),
            onRetry: () => void loadIds(),
            checks: (ids.data?.checks ?? []).map((c) => ({ ...c, at: new Date(c.at) })),
            idTypes: ids.data?.idTypes ?? [],
            ...(ids.data?.canManage
              ? {
                  onReverify: async (typeKey: string) => {
                    await write('POST', `/employees/${p}/identity-checks/reverify`, { typeKey });
                    done(`${first} asked for a fresh ${ids.data!.idTypes.find((t) => t.key === typeKey)?.name ?? 'ID'}`);
                    void loadIds();
                  },
                  onAttest: async (note: string) => {
                    await write('POST', `/employees/${p}/identity-checks/attest`, note ? { note } : {});
                    done('HR attestation recorded');
                    void loadIds();
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(perms.has('letter.issue') && !self ? { onIssueLetter: () => router.push(`/yx/people/letters?people=${p}`) } : {}),
    onRetry: () => void Promise.all([profile.refetch(), view.refetch(), history.refetch()]),
  };

  const failed = [profile, view].find((q) => q.isError)?.error as { status?: number } | undefined;
  const waiting = (!personId && me.isLoading) || profile.isLoading || view.isLoading || !perms.isFetched;
  const state = failed ? (failed.status === 403 || failed.status === 404 ? 'not-found' : 'error') : !personId && !me.isLoading ? 'not-found' : waiting ? 'loading' : 'ready';

  live.children = (
    <>
      {uploading && docs.data && (
        <UploadDocDialog
          name={first}
          types={docs.data.askable}
          onUpload={async (typeKey, file, expiresOn) => {
            const form = new FormData();
            form.append('file', file);
            if (expiresOn) form.append('expiresOn', expiresOn);
            await lifeWrite('POST', `/documents/people/${id(docs.data!.personId)}/${id(typeKey)}`, form);
            done(`${docs.data!.askable.find((t) => t.key === typeKey)?.name ?? 'Document'} uploaded for ${first}`);
          }}
          onClose={() => setUploading(false)}
        />
      )}
      {phoneOpen && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setPhoneOpen(false)}
          size="md"
          title={`Work phone for ${name}`}
          consequence="The company line shown on the record and in the directory. Leave it empty to clear it."
          confirmLabel="Save"
          onConfirm={async () => {
            await write('PUT', `/employees/${p}/work-phone`, { workPhone: phone.trim() || null });
            void profile.refetch();
            done(`${first}'s work phone saved`);
          }}
        >
          <FormField label="Work phone" helper="With the country code, e.g. +91 44 4012 3142.">
            <TextField type="tel" value={phone} onChange={setPhone} maxLength={30} />
          </FormField>
        </ConfirmDialog>
      )}
      {editing && prof?.personal && (
        <PersonalDialog
          initial={prof.personal}
          states={(reference.data?.states ?? []).filter((s) => s.country === 'IN')}
          onSave={async (input) => {
            await write('PUT', `/employees/${p}/personal`, input);
            done(`${self ? 'Your' : `${first}'s`} personal details saved`);
          }}
          onClose={() => setEditing(false)}
        />
      )}
      {familyEdit === 'family' && prof?.family && (
        <FamilyDrawer
          name={name}
          initial={familyData(prof.family)}
          onSave={async (f) => {
            await write('PUT', `/employees/${p}/family`, {
              members: f.members.map((m) => ({ ...(m.id ? { id: m.id } : {}), name: m.name, relation: m.relation, dateOfBirth: m.dateOfBirth ? iso(m.dateOfBirth) : null, dependant: m.dependant })),
              nominations: f.nominations.map((n) => ({ scheme: n.scheme, member: n.member, sharePercent: n.share })),
            });
            void profile.refetch();
            done(`${first}'s family and nominees saved`);
          }}
          onClose={() => setFamilyEdit(null)}
        />
      )}
      {familyEdit === 'contacts' && prof?.family && (
        <ContactsDrawer
          initial={prof.family.contacts}
          onSave={async (contacts) => {
            await write('PUT', `/employees/${p}/emergency-contacts`, { contacts });
            void profile.refetch();
            done(`${self ? 'Your' : `${first}'s`} emergency contacts saved`);
          }}
          onClose={() => setFamilyEdit(null)}
        />
      )}
      {familyEdit === 'custom' && custom.data && (
        <CustomFieldsDrawer
          fields={custom.data.fields}
          onSave={async (values) => {
            await write('PUT', `/employees/${p}/custom-fields`, { values });
            done(`${self ? 'Your' : `${first}'s`} additional details saved`);
          }}
          onClose={() => setFamilyEdit(null)}
        />
      )}
      {changing && (
        <ChangeDialog
          pending={pending.map((r) => r.kind)}
          onRequest={async (input) => {
            await write('POST', `/employees/${p}/profile-requests`, input);
            done('Sent for approval');
          }}
          onClose={() => setChanging(false)}
        />
      )}
      {withdrawing && (
        <CancelDialog
          request={withdrawing}
          onCancel={async (requestId, reason) => {
            await write('POST', `/profile-requests/${id(requestId)}/cancel`, { reason });
            done(`${withdrawing.label} change withdrawn`);
          }}
          onClose={() => setWithdrawing(null)}
        />
      )}
      {starting && personId && (
        <ChangeDrawer
          options={options}
          employeeId={personId}
          onPreview={raise.onPreview}
          onRoute={raise.onRoute}
          move={
            move && {
              ...move,
              onSubmit: async (m) => {
                await move.onSubmit(m);
                done(`Inter-entity transfer for ${first} sent for approval in People › Restructure`);
              },
            }
          }
          onSubmit={async (input) => {
            await raise.onSubmit(input);
            done(`Change for ${first} sent`);
          }}
          onSaveDraft={async (d) => {
            await write('POST', '/changes/drafts', { employeeId: personId, ...(d.changeType && d.changeType !== 'entity_transfer' ? { changeType: d.changeType } : {}), form: draftForm(d) });
            done('Draft saved. Find it under People › Change action.');
          }}
          onClose={() => setStarting(false)}
        />
      )}
      {docDialog && docs.data && <DocDialog dialog={docDialog} name={first} askable={docs.data.askable} onClose={() => setDocDialog(null)} onRequest={async (typeKey, typeName) => {
        await lifeWrite('POST', '/documents/requests', { personIds: [docs.data!.personId], typeKey });
        done(`${first} asked to upload the ${typeName}`);
      }} onReject={(d, reason) => docAction(d, 'reject', reason)} />}
    </>
  );
  return <PersonWorkspace persona={persona} relation={relation} today={day(today)} state={state} live={live} />;
}

const REJECT_REASONS = ['Name does not match the record', 'Image is unclear', 'Wrong document type', 'Expired document'];

/** Ask for an upload, or send a document back with the reason (the person sees the reason). */
function DocDialog({ dialog, name, askable, onClose, onRequest, onReject }: { dialog: { kind: 'request' | 'reject'; doc?: RecordDoc }; name: string; askable: { key: string; name: string }[]; onClose: () => void; onRequest: (typeKey: string, typeName: string) => Promise<void>; onReject: (d: RecordDoc, reason: string) => Promise<void> }) {
  const [type, setType] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(REJECT_REASONS[0]);
  const [message, setMessage] = useState('');
  const [tried, setTried] = useState(false);
  if (dialog.kind === 'request')
    return (
      <ConfirmDialog open onOpenChange={(o) => !o && onClose()} title={`Ask ${name} to upload a document`} consequence={`${name} gets an email and sees it in My documents.`} confirmLabel="Send request" onConfirm={async () => {
        setTried(true);
        if (!type) return false;
        await onRequest(type, askable.find((x) => x.key === type)?.name ?? 'document');
        onClose();
      }}>
        <FormField id="rq-type" label="Document" required error={tried && !type ? 'Choose the document to ask for.' : null}>
          <Select aria-label="Document" value={type} onChange={setType} options={askable.map((x) => ({ value: x.key, label: x.name }))} />
        </FormField>
      </ConfirmDialog>
    );
  const d = dialog.doc!;
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} title={`Send ${d.type} back to ${name}?`} consequence={`${name} is asked to upload it again and sees your message.`} confirmLabel="Reject and ask to re-upload" destructive onConfirm={async () => {
      setTried(true);
      if (!reason) return false;
      await onReject(d, [reason, message.trim()].filter(Boolean).join('. '));
      onClose();
    }}>
      <FormField id="rj-reason" label="Reason" required error={tried && !reason ? 'Choose a reason.' : null}>
        <Select aria-label="Reason" value={reason} onChange={setReason} options={REJECT_REASONS.map((x) => ({ value: x, label: x }))} />
      </FormField>
      <FormField id="rj-msg" label={`Message to ${name}`} optional helper="Say what to upload instead.">
        <TextArea value={message} onChange={setMessage} rows={3} maxLength={400} />
      </FormField>
    </ConfirmDialog>
  );
}
