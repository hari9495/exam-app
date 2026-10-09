'use client';

import { useState } from 'react';
import { CompensationLiveScreen, type Breakup, type CompensationInForce, type EmployeeHit, type SalaryTemplate, type StatutoryProfile } from '@yukthix/ui/pay';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';
import { usePeopleSearch } from '../../../../../lib/yx-pay-5b';
import { todayIndia } from '../../../../../lib/yx-time';

// Payroll › Compensation (PAY-12, PAY-2.09 / 2.10): the salary in force, a new or revised salary sent for approval
// (someone else approves it), the revision letter, and the statutory profile.
export default function YxPayCompensationPage() {
  const [employee, setEmployee] = useState<EmployeeHit | null>(null);
  const id = employee ? encodeURIComponent(employee.id) : null;
  const current = usePay<CompensationInForce | null>(id ? `/employees/${id}/compensation` : null);
  const profile = usePay<StatutoryProfile>(id ? `/employees/${id}/statutory-profile` : null);
  const templates = usePay<SalaryTemplate[]>('/templates');
  const write = usePayWrite();
  const search = usePeopleSearch();
  return (
    <CompensationLiveScreen
      onSearch={search}
      employee={employee}
      onEmployee={setEmployee}
      state={payState(current)}
      onRetry={() => void current.refetch()}
      current={current.data ?? null}
      templates={templates.data ?? null}
      today={todayIndia()}
      onPreview={(c) =>
        write<Breakup>('/compensations/preview', {
          ...c,
          employeeId: employee!.id,
        })
      }
      onSubmit={(c) => write<{ changeId: string; status: string }>(`/employees/${id}/compensation-changes`, { ...c, employeeId: employee!.id })}
      onLetter={(changeId, signatory) =>
        write<{ referenceNo: string }>(`/compensation-changes/${encodeURIComponent(changeId)}/letter`, {
          signatory,
          confirmation: {
            phrase: 'ISSUE RL',
            impact: [{ label: 'Person', value: employee!.name }],
          },
        })
      }
      profile={profile.data ?? null}
      onSaveProfile={(p) => write(`/employees/${id}/statutory-profile`, p, 'PUT')}
    />
  );
}
