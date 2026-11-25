'use client';

import { useState } from 'react';
import { CompensationScreen, type Breakup, type CompensationInForce, type EmployeeHit, type SalaryTemplate, type StatutoryProfile } from '@yukthix/ui/pay';
import type { CompensationHistoryItem, LiveCompensation, SplitFreshness, SplitSuggestion } from '@yukthix/ui/pay';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';
import { usePeopleSearch } from '../../../../../lib/yx-pay-5b';
import { todayIndia } from '../../../../../lib/yx-time';
import { useYxPermissions } from '../../../../../lib/yx-org';

// Payroll › Compensation (PAY-12, PAY-2.09 / 2.10): the salary in force, a new or revised salary sent for approval
// (someone else approves it), the revision letter, and the statutory profile.
export default function YxPayCompensationPage() {
  const [employee, setEmployee] = useState<EmployeeHit | null>(null);
  const id = employee ? encodeURIComponent(employee.id) : null;
  const current = usePay<CompensationInForce | null>(id ? `/employees/${id}/compensation` : null);
  const profile = usePay<StatutoryProfile>(id ? `/employees/${id}/statutory-profile` : null);
  const history = usePay<CompensationHistoryItem[]>(id ? `/employees/${id}/compensation-history` : null);
  const templates = usePay<SalaryTemplate[]>('/templates');
  const write = usePayWrite();
  const search = usePeopleSearch();
  // Founder 21 Oct 2026: only HR changes pay (the salary grant and the job-change right); payroll reads it and keeps
  // the statutory profile.
  const perms = useYxPermissions();
  const changesPay = perms.has('employee.salary.manage') && perms.has('employee.change.manage');
  const live: LiveCompensation = {
    onSearch: search,
    employee,
    onEmployee: setEmployee,
    // Someone with no salary key gets "no access" up front, not an empty person search.
    state: perms.data === undefined ? 'loading' : !perms.has('employee.salary.view') && !perms.has('employee.salary.manage') ? 'no-access' : payState(current),
    onRetry: () => void current.refetch(),
    current: current.data ?? null,
    templates: templates.data ?? null,
    today: todayIndia(),
    onSuggest: employee ? (annualCtc, effectiveDate) => write<SplitSuggestion[]>('/compensations/suggest', { employeeId: employee.id, annualCtc, effectiveDate }) : undefined,
    onCheckSplit: employee ? (madeAt, effectiveDate) => write<SplitFreshness>('/compensations/suggest/check', { employeeId: employee.id, madeAt, effectiveDate }) : undefined,
    // A failed history read leaves the panel out; the salary in force still shows.
    history: history.isError ? undefined : (history.data ?? null),
    onPreview: (c) => write<Breakup>('/compensations/preview', { ...c, employeeId: employee!.id }),
    onSubmit: changesPay ? (c) => write<{ changeId: string; status: string }>(`/employees/${id}/compensation-changes`, { ...c, employeeId: employee!.id }) : undefined,
    onLetter: (changeId, signatory) =>
      write<{ referenceNo: string }>(`/compensation-changes/${encodeURIComponent(changeId)}/letter`, {
        signatory,
        confirmation: {
          phrase: 'ISSUE RL',
          impact: [{ label: 'Person', value: employee!.name }],
        },
      }),
    profile: profile.data ?? null,
    onSaveProfile: (p) => write(`/employees/${id}/statutory-profile`, p, 'PUT'),
  };
  return <CompensationScreen live={live} />;
}
