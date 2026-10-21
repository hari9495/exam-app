'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { ComplianceDashboardScreen, type LiveComplianceData } from '@yukthix/ui/frame';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { useJoinerPlaces } from '../../../../../lib/yx-lifecycle';
import { useLearning, useLearningFiles, useLearningWrite } from '../../../../../lib/yx-learning';
import { useScope } from '../../../../../lib/yx-shell';
import { learnState } from '../my-learning';

// Learning › Compliance (LRN-08, learning.report.view): mandatory courses by department for the people in the reader's
// scope, who is overdue, the audit export and Remind overdue. L&D also reaches the assignment rules from here.
export default function YxCompliancePage() {
  const router = useRouter();
  const { toast } = useToast();
  const perms = useYxPermissions();
  const { scope } = useScope();
  const [picked, setEntity] = useState<string | null>(null);
  const entity = picked ?? scope.entity ?? 'all';
  const q = entity === 'all' ? '' : `?entityId=${encodeURIComponent(entity)}`;
  const data = useLearning<LiveComplianceData>(`/compliance${q}`);
  const places = useJoinerPlaces(true);
  const write = useLearningWrite();
  const files = useLearningFiles();
  return (
    <ComplianceDashboardScreen
      data={{ courses: [], rows: [], overdue: [] }}
      persona={perms.has('learning.manage') ? 'ld' : 'hr'}
      live={{
        state: learnState(loadState(data)),
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        entities: places.entities,
        entity,
        onEntity: setEntity,
        onExport: () => void files.download(`/compliance/export${q}`, 'compliance-training.csv').catch((e) => toast({ tone: 'error', title: e instanceof Error ? e.message : 'The export did not download.' })),
        onRemind: async () => {
          try {
            const out = await write<{ reminded: number }>('POST', `/compliance/remind${q}`);
            toast({ tone: 'success', title: out.reminded ? `${out.reminded} ${out.reminded === 1 ? 'person' : 'people'} reminded` : 'Nobody to remind', ...(out.reminded ? { description: 'Each gets a notification and an email.' } : {}) });
          } catch (e) {
            toast({ tone: 'error', title: e instanceof Error ? e.message : 'The reminders were not sent. Try again.' });
          }
        },
        onRules: perms.has('learning.manage') ? () => router.push('/yx/learning/compliance/rules') : undefined,
      }}
    />
  );
}
