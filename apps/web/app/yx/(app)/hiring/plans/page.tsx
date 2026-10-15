'use client';

import { useState } from 'react';
import { HeadcountPlansScreen, type HeadcountPlan } from '@yukthix/ui/hiring';
import type { MasterRecord } from '@yukthix/ui/org';
import { loadState, todayIst, useOrg } from '../../../../../lib/yx-org';
import { useHiring, useHiringWrite } from '../../../../../lib/yx-hiring';

// Hiring › Headcount plans (M10 batch AT2): plans per department and financial year (ats.headcount.manage).
const fyNow = () => {
  const t = todayIst();
  return Number(t.slice(5, 7)) >= 4 ? Number(t.slice(0, 4)) : Number(t.slice(0, 4)) - 1;
};

export default function YxHeadcountPlansPage() {
  const [fy, setFy] = useState(fyNow());
  const plans = useHiring<HeadcountPlan[]>(`/plans?fy=${fy}`);
  const write = useHiringWrite();
  const departments = useOrg<MasterRecord[]>('/masters/departments');
  const designations = useOrg<MasterRecord[]>('/masters/designations');
  const grades = useOrg<MasterRecord[]>('/masters/grades');
  const locations = useOrg<MasterRecord[]>('/locations');
  const choices = (rows: MasterRecord[] | undefined) => (rows ?? []).filter((r) => !r.archivedAt).map((r) => ({ value: r.id, label: r.name }));
  return (
    <HeadcountPlansScreen
      state={loadState(plans)}
      onRetry={() => void plans.refetch()}
      plans={plans.data ?? []}
      fy={fy}
      years={[fyNow() - 1, fyNow(), fyNow() + 1]}
      onFy={setFy}
      departments={choices(departments.data)}
      designations={choices(designations.data)}
      grades={choices(grades.data)}
      locations={choices(locations.data)}
      onSave={(id, input) => write(id ? 'PUT' : 'POST', id ? `/plans/${encodeURIComponent(id)}` : '/plans', input)}
      onSubmit={(id, version) => write('POST', `/plans/${encodeURIComponent(id)}/submit`, { version })}
    />
  );
}
