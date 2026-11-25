'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { NoAccessState } from '@yukthix/ui';
import { TestResultsScreen } from '@yukthix/ui/assessments';
import { useApi } from '../../../../../../lib/yx-hiring';
import { BANK_BASE, type ExamListPage } from '../../../../../../lib/yx-assessments';
import { useYxPermissions } from '../../../../../../lib/yx-org';
import { useTestResults } from '../../../../../../lib/yx-test-results';

// Answer 2437: test results for people who read results but do not build tests (the older /v2 panel results list and
// compare page). Test writers see the same on each test's Results tab. The API scopes rows to the viewer's own jobs.
export default function YxTestResultsPage() {
  const router = useRouter();
  const testId = useSearchParams()?.get('test') ?? null;
  const perms = useYxPermissions();
  const reader = perms.has('results:view' as never) || perms.has('asmt.results.view' as never);
  const list = useApi<ExamListPage>(reader ? '/exams?pageSize=100' : null);
  const results = useTestResults(testId, reader, false);
  if (perms.isSuccess && !reader) return <NoAccessState grantedBy="HR" what="test results" />;
  return (
    <TestResultsScreen
      live={{
        tests: (list.data?.data ?? []).filter((e) => e.status !== 'draft').map((e) => ({ id: e.id, title: e.title })),
        testId,
        onPickTest: (id) => router.replace(`${BANK_BASE}/results?test=${encodeURIComponent(id)}`),
        results,
      }}
    />
  );
}
