'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BillingWorkbenchScreen, type LiveBillingData } from '@yukthix/ui/hiring';
import { loadState } from '../../../../../lib/yx-org';
import { lastMonths, useProjects, useProjectsWrite } from '../../../../../lib/yx-projects';

// Projects › Billing workbench (PRJ-05), Projects P-6 (answers 1414, 1415): unbilled project work becomes drafts on the
// staffing desk's invoice engine; issued invoices live in Staffing desk › Invoices (one invoice list). Projects finance
// bills; an account manager approves the drafts when the company asks for it.
export default function YxBillingWorkbenchPage() {
  const router = useRouter();
  const months = lastMonths(12);
  const [month, setMonth] = useState(months[1]!);
  const data = useProjects<LiveBillingData>(`/billing?month=${month}`);
  const write = useProjectsWrite();
  const state = loadState(data);
  const id = encodeURIComponent;
  return (
    <BillingWorkbenchScreen
      rows={[]}
      today={new Date()}
      live={{
        state: (data.error as { code?: string } | null)?.code === 'PROJECTS_OFF' ? 'off' : state === 'no-access' ? 'no-access' : state === 'error' ? 'error' : state === 'loading' ? 'loading' : 'ready',
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        months,
        onMonth: setMonth,
        today: new Date(),
        onDraft: (seriesId, items) => write<{ ids: string[] }>('POST', '/billing/drafts', { seriesId, month: data.data?.month ?? month, items }),
        onDelete: async (d) => void (await write('DELETE', `/billing/drafts/${id(d.id)}`)),
        onApprove: async (d) => void (await write('POST', `/billing/drafts/${id(d.id)}/approve`, { version: d.version })),
        onIssue: (d) => write<{ number: string }>('POST', `/billing/drafts/${id(d.id)}/issue`, { version: d.version }),
        onOpenInvoices: () => router.push('/yx/staffing/invoices'),
        onCorrect: () => router.push('/yx/projects/billing/correct'),
      }}
    />
  );
}
