'use client';

import { PayGroupsScreen, type EmployeeHit, type PayCalendarMonth, type PayGroup, type PayGroupMember, type SetupEntity } from '@yukthix/ui/pay';
import { payState, usePay, usePayRead, usePayWrite } from '../../../../../lib/yx-pay';
import { usePeopleSearch } from '../../../../../lib/yx-pay-5b';
import { todayIndia } from '../../../../../lib/yx-time';

// Payroll › Pay groups (PAY-2.05): groups per legal entity, dated membership and the pay calendar.
export default function YxPayGroupsPage() {
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const groups = usePay<PayGroup[]>('/pay-groups');
  const read = usePayRead();
  const write = usePayWrite();
  const search = usePeopleSearch();
  return (
    <PayGroupsScreen
      state={payState(entities, groups)}
      onRetry={() => void groups.refetch()}
      entities={(entities.data ?? []).filter((x) => x.keys.includes('payroll.setup.manage'))}
      groups={groups.data ?? null}
      today={todayIndia()}
      onSave={(id, g) => (id ? write(`/pay-groups/${encodeURIComponent(id)}`, g, 'PATCH') : write('/pay-groups', g))}
      onMembers={(id) => read<PayGroupMember[]>(`/pay-groups/${encodeURIComponent(id)}/members`)}
      onAddMembers={(id, employeeIds, from) =>
        write(`/pay-groups/${encodeURIComponent(id)}/members`, {
          employeeIds,
          from,
        })
      }
      onSearch={(q) => search(q) as Promise<EmployeeHit[]>}
      onCalendar={(id, year) => read<PayCalendarMonth[]>(`/pay-groups/${encodeURIComponent(id)}/calendar?year=${year}`)}
    />
  );
}
