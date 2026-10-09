import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { PeopleListScreen, type DeskPerson, type DirectorySource } from './people-list';
import { PrivacyScreen, type PrivacyRequestRow, type PrivacyStatus } from './privacy';
import { DeskSignUpScreen, KnownIssuesScreen, SetupStart, type SetupChecklist } from './setup-start';
import { BANNERS, DESK } from './data';

const meta: Meta = { title: 'Screens/Service desk/Batch 4 standalone and privacy', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = (ms = 400) => new Promise<void>((r) => setTimeout(r, ms));

const PEOPLE: DeskPerson[] = [
  { id: 'p1', name: 'Asha Rao', email: 'asha@kaveri.test', team: 'Sales', location: 'Chennai office', locationId: 'l1', source: 'csv', hasLogin: true, directoryActive: null },
  { id: 'p2', name: 'Vikram Shah', email: 'vikram@kaveri.test', team: 'IT', location: null, locationId: null, source: 'ldap', hasLogin: false, directoryActive: false },
  { id: 'p3', name: 'Meera Nair', email: 'meera@kaveri.test', team: 'Finance', location: 'Kochi', locationId: 'l2', source: 'scim', hasLogin: true, directoryActive: true },
];
const SOURCES: DirectorySource[] = [
  { id: 's1', kind: 'ldap', name: 'Head office AD', ldap: { url: 'ldaps://dc1.kaveri.test', bindDn: 'CN=read,DC=kaveri,DC=test', baseDn: 'DC=kaveri,DC=test', filter: null }, scimUrl: null, groupMap: [{ group: 'IT Support', deskId: DESK.id, role: 'agent' }], schedule: 'daily', status: 'active', lastSyncAt: '2026-10-07T04:00:00Z', lastResult: { ok: true, read: 120, applied: 118 }, people: 118, disabled: 3, version: 1 },
  { id: 's2', kind: 'scim', name: 'Identity provider', ldap: null, scimUrl: 'https://api.example.test/api/v1/desk/scim/o/s2/v2', groupMap: [], schedule: 'off', status: 'active', lastSyncAt: null, lastResult: null, people: 40, disabled: 0, version: 1 },
];
const REQUESTS: PrivacyRequestRow[] = [
  { id: 'r1', kind: 'erasure', source: 'portal', note: 'Please remove my messages', status: 'open', decisionNote: null, result: null, createdAt: '2026-10-06T05:00:00Z', doneAt: null, person: { id: 'x1', name: 'Neha Iyer', email: 'neha@client.test' } },
  { id: 'r2', kind: 'access', source: 'app', note: null, status: 'open', decisionNote: null, result: null, createdAt: '2026-10-05T05:00:00Z', doneAt: null, person: { id: 'x2', name: 'Asha Rao', email: 'asha@kaveri.test' } },
];
const CHECKLIST: SetupChecklist = {
  done: 2,
  total: 5,
  standalone: true,
  steps: [
    { key: 'desk', label: 'Create your first desk', done: true, link: '#' },
    { key: 'agents', label: 'Add agents to the desk', done: true, link: '#' },
    { key: 'sla', label: 'Set response targets (SLA)', done: false, link: '#' },
    { key: 'email', label: 'Connect the support email address', done: false, link: '#' },
    { key: 'portal', label: 'Open a help portal for customers (if you serve them)', done: false, link: '#', optional: true },
  ],
};

export const PeopleList: S = {
  render: () => {
    const [search, setSearch] = useState('');
    return (
      <PeopleListScreen
        state="ready"
        people={PEOPLE.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))}
        search={search}
        onSearch={setSearch}
        onSavePerson={() => wait()}
        onImport={async (_csv, dryRun) => (await wait(), dryRun ? { imported: 0, rows: 3, problems: [{ row: 3, problem: 'The email is missing or not valid.' }] } : { imported: 3, created: 2, rows: 3, problems: [] })}
        sources={SOURCES}
        desks={[DESK]}
        onSaveSource={async () => (await wait(), { id: 's9', scimToken: 'scim_demo_token', scimUrl: 'https://api.example.test/api/v1/desk/scim/o/s9/v2' })}
        onSyncNow={() => wait()}
        onNewToken={async () => (await wait(), { scimToken: 'scim_new_token' })}
      />
    );
  },
};

export const Privacy: S = {
  render: () => {
    const [status, setStatus] = useState<PrivacyStatus>('open');
    return <PrivacyScreen state="ready" status={status} onStatus={setStatus} requests={status === 'open' ? REQUESTS : []} legalHold={false} settings={{ retentionMonths: 36, legalHold: false, binDays: 30 }} onDecide={() => wait()} onSaveSettings={() => wait()} />;
  },
};

export const GetStarted: S = {
  render: () => <SetupStart checklist={CHECKLIST} onCreateDesk={async () => (await wait(), { id: 'd9' })} onCreatePolicy={() => wait()} onCreateMailbox={async () => (await wait(), { webhookUrl: 'https://api.example.test/desk/inbound/email/o/tok', signingSecret: 'whsec_demo' })} />,
};

export const KnownIssues: S = {
  render: () => <KnownIssuesScreen state="ready" desks={[DESK]} selectedId={DESK.id} onSelect={() => {}} banners={{ state: 'ready', banners: BANNERS, openTickets: [], onSave: () => wait(), onEnd: () => wait() }} />,
};

export const SignUp: S = {
  render: () => <DeskSignUpScreen signInHref="#" onSubmit={() => wait()} />,
};
