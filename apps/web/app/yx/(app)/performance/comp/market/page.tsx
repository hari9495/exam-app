'use client';

import { useState } from 'react';
import { MarketDataScreen, PerfNoAccessScreen } from '@yukthix/ui/performance';
import type { LegalEntity } from '@yukthix/ui/org';
import { useOrg } from '../../../../../../lib/yx-org';
import { day, designState, refused, usePerf, usePerfWrite } from '../../../../../../lib/yx-performance';

// PRF-10 market data (founder answer 12): HR who run comp reviews (perf.comp.manage for the company) upload a salary
// survey per grade as CSV. The API checks every row and saves nothing until all are right; each upload is a version.
type Market = {
  staleMonths: number;
  latest: { version: number; source: string; currency: string; asOf: string; stale: boolean; rows: { grade: string; min: number; median: number; max: number }[] } | null;
  versions: { version: number; source: string; currency: string; asOf: string; fileName: string | null; rows: number; uploadedBy: string; uploadedAt: string }[];
};

export default function YxMarketDataPage() {
  const entities = useOrg<LegalEntity[]>('/legal-entities');
  const [chosen, setChosen] = useState<string | null>(null);
  const entityId = chosen ?? entities.data?.[0]?.id ?? null;
  const market = usePerf<Market>(entityId ? `/comp-market?legalEntityId=${encodeURIComponent(entityId)}` : null);
  const write = usePerfWrite();
  const m = market.data;
  if (refused(entities, market)) return <PerfNoAccessScreen title="Market data" what="market data" grantedBy="HR" active="Calibration & comp review" persona="hr" />;
  return (
    <MarketDataScreen
      state={designState(entities, market)}
      onRetry={() => void market.refetch()}
      entities={(entities.data ?? []).map((e) => ({ value: e.id, label: e.name }))}
      entityId={entityId}
      onEntity={setChosen}
      staleMonths={m?.staleMonths ?? 12}
      latest={m?.latest ? { ...m.latest, asOf: day(m.latest.asOf) } : null}
      versions={(m?.versions ?? []).map((v) => ({ ...v, asOf: day(v.asOf), uploadedAt: new Date(v.uploadedAt) }))}
      onUpload={(input) => write('POST', '/comp-market', { legalEntityId: entityId, ...input })}
    />
  );
}
