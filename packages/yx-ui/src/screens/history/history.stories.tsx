import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { PersonHistoryScreen } from './person-history';
import { JobChangesScreen } from './job-changes';
import { AS_OF, AS_OF_FUTURE, AS_OF_PAY, CHANGES, HISTORY, IMPACT, OPTIONS, PEOPLE, TODAY_ISO } from './data';

const meta: Meta = { title: 'Screens/People/Job history', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = (ms = 500) => new Promise<void>((r) => setTimeout(r, ms));
const change = { options: OPTIONS, onPreview: () => wait().then(() => IMPACT), onSubmit: () => wait() };

function History({ asOfStart = TODAY_ISO, pay = false }: { asOfStart?: string; pay?: boolean }) {
  const [asOf, setAsOf] = useState(asOfStart);
  const [shown, setShown] = useState(pay);
  const view = asOf > TODAY_ISO ? AS_OF_FUTURE : shown ? AS_OF_PAY : AS_OF;
  return (
    <PersonHistoryScreen
      state="ready"
      people={PEOPLE}
      personId="p-arjun"
      onPickPerson={() => {}}
      today={TODAY_ISO}
      asOf={asOf}
      onAsOf={setAsOf}
      view={{ ...view, asOf }}
      history={HISTORY}
      payShown={shown}
      onShowPay={(s) => wait().then(() => setShown(s))}
      change={change}
    />
  );
}

export const HrToday: S = { name: 'HR · today', render: () => <History /> };
export const WithPay: S = { name: 'Payroll · pay shown (recorded)', render: () => <History pay /> };
export const Scheduled: S = { name: 'As on 1 Nov 2026 (scheduled promotion)', render: () => <History asOfStart="2026-11-01" /> };
export const Manager: S = {
  name: 'Manager · no pay, no change button',
  render: () => (
    <PersonHistoryScreen state="ready" people={PEOPLE} personId="p-arjun" onPickPerson={() => {}} today={TODAY_ISO} asOf={TODAY_ISO} onAsOf={() => {}} view={{ ...AS_OF, payAccess: false }} history={{ ...HISTORY, payAccess: false, compensation: [] }} payShown={false} onShowPay={() => wait()} />
  ),
};
export const NoPerson: S = { name: '· no person chosen', render: () => <PersonHistoryScreen state="ready" people={PEOPLE} personId={null} onPickPerson={() => {}} today={TODAY_ISO} asOf={TODAY_ISO} onAsOf={() => {}} view={null} history={null} payShown={false} onShowPay={() => wait()} /> };

function Changes({ view }: { view?: 'pending' | 'scheduled' | 'done' }) {
  return (
    <JobChangesScreen
      state="ready"
      today={TODAY_ISO}
      rows={CHANGES}
      defaultView={view}
      canApprove
      canManage
      personHref={(id) => `#person-${id}`}
      onPreview={() => wait().then(() => IMPACT)}
      onApprove={() => wait()}
      onReject={() => wait()}
      onCancel={() => wait()}
      onReschedule={() => wait()}
      newChange={change}
    />
  );
}

export const WaitingForApproval: S = { name: 'Job changes · waiting for approval', render: () => <Changes /> };
export const ScheduledChanges: S = { name: 'Job changes · scheduled', render: () => <Changes view="scheduled" /> };
export const Done: S = { name: 'Job changes · done', render: () => <Changes view="done" /> };
