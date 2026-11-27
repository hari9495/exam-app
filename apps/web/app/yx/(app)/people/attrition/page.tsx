'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MetricExplorerScreen, type AttritionSplit, type AttritionView } from '@yukthix/ui/frame';
import { apiFetch, apiFetchBlob } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { loadState, todayIst } from '../../../../../lib/yx-org';
import { saveBlob } from '../../../../../lib/yx-pay';
import { attritionPeriods } from '../../../../../lib/yx-attrition';

// People › Headcount and attrition (T2-G 47, answer 2747): the drawn ANL-04 Metric explorer made live. The API answers
// only holders of the people analytics key (company-wide) and hides groups under 5 people.
export default function YxAttritionPage() {
  const { accessToken } = useAuth();
  const periods = useMemo(() => attritionPeriods(todayIst()), []);
  const [period, setPeriod] = useState(periods[0]!.value);
  const [by, setBy] = useState<AttritionSplit>('department');
  const [from, to] = period.split('|') as [string, string];
  const q = `?from=${from}&to=${to}&by=${by}`;
  const data = useQuery<AttritionView>({ queryKey: ['people', 'attrition', q], queryFn: () => apiFetch(`/people/attrition${q}`, {}, accessToken ?? undefined), enabled: Boolean(accessToken), retry: false });
  return (
    <MetricExplorerScreen
      live={{
        state: loadState(data),
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        by,
        onBy: setBy,
        periods,
        period,
        onPeriod: setPeriod,
        onExport: async () => {
          const { blob, filename } = await apiFetchBlob(`/people/attrition/export${q}`, {}, accessToken ?? undefined);
          saveBlob(blob, filename ?? `headcount-attrition-${from}-to-${to}.csv`);
        },
      }}
    />
  );
}
