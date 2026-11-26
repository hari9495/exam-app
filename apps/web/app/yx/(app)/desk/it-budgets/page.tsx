'use client';

import { useState } from 'react';
import { ItBudgetsScreen, type ItBudgets } from '@yukthix/ui/desk';
import { deskState, useDesk, useDeskWrite } from '../../../../../lib/yx-desk';

// Helpdesk › IT budgets (GLPI 7, answer 2719): each department's yearly IT budget with what IT desks spent on it and
// what is left. The API allows it only with desk.budget.manage (Service Desk Admin, company admin).
const fyOf = (d: Date) => (d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1);

export default function YxDeskItBudgetsPage() {
  const [thisYear] = useState(() => fyOf(new Date(Date.now() + 330 * 60_000)));
  const [year, setYear] = useState(thisYear);
  const budgets = useDesk<ItBudgets>(`/it-budgets?year=${year}`);
  const write = useDeskWrite();
  return (
    <ItBudgetsScreen
      state={deskState(budgets)}
      onRetry={() => void budgets.refetch()}
      data={budgets.data ?? null}
      year={year}
      thisYear={thisYear}
      onYear={setYear}
      onSet={async (departmentId, y, amount) => {
        await write('/it-budgets', 'PUT', { departmentId, year: y, amount });
      }}
    />
  );
}
