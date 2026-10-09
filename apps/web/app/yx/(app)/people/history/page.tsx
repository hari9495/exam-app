'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner } from '@yukthix/ui';
import { PersonHistoryScreen, type AsOfView, type HistoryView, type PersonOption } from '@yukthix/ui/history';
import { loadState, todayIst, useYxPermissions } from '../../../../../lib/yx-org';
import { useChangeOptions, usePeople, useRaiseChange } from '../../../../../lib/yx-people';

const id = encodeURIComponent;

// People › Job history (P06 §4.7, §7). HR sees everyone; others themselves and their team, a manager only
// for the periods they managed (the API decides). Pay is asked for only after "Show pay", each look
// recorded by the API (R1).
function History() {
  const router = useRouter();
  const params = useSearchParams();
  const today = todayIst();
  const personId = params.get('person');
  const asOf = params.get('asOf') ?? today;
  const [payShown, setPayShown] = useState(false);
  const perms = useYxPermissions();
  const people = usePeople<PersonOption[]>('/employees');
  const pay = payShown ? '&pay=true' : '';
  const view = usePeople<AsOfView>(personId ? `/employees/${id(personId)}/as-of?date=${id(asOf)}${pay}` : null);
  const history = usePeople<HistoryView>(personId ? `/employees/${id(personId)}/history?${pay.slice(1)}` : null);
  const canManage = perms.has('employee.change.manage');
  const options = useChangeOptions(people.data ?? [], perms.has('employee.salary.manage'), canManage);
  const raise = useRaiseChange();
  const go = (next: { person?: string; asOf?: string }) => {
    const q = new URLSearchParams({ ...(personId ? { person: personId } : {}), ...(asOf !== today ? { asOf } : {}), ...next });
    if (q.get('asOf') === today) q.delete('asOf');
    router.replace(`/yx/people/history?${q}`);
  };
  return (
    <PersonHistoryScreen
      state={loadState(people)}
      onRetry={() => void people.refetch()}
      people={people.data ?? []}
      personId={personId}
      onPickPerson={(person) => {
        setPayShown(false);
        go({ person });
      }}
      today={today}
      asOf={asOf}
      onAsOf={(date) => go({ asOf: date })}
      view={view.data ?? null}
      history={history.data ?? null}
      payShown={payShown}
      onShowPay={async (show) => setPayShown(show)}
      change={canManage ? { options, ...raise } : undefined}
    />
  );
}

export default function YxJobHistoryPage() {
  return (
    <Suspense fallback={<Spinner label="Loading" size="md" />}>
      <History />
    </Suspense>
  );
}
