'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { CompReviewScreen, type CompReviewRow, type CompSheet, type PayEquity, PerfNoAccessScreen } from '@yukthix/ui/performance';
import type { MasterRecord } from '@yukthix/ui/org';
import { useOrg, useYxPermissions } from '../../../../../../lib/yx-org';
import { day, designState, usePerf, usePerfWrite, refused } from '../../../../../../lib/yx-performance';
import { formatDate } from '@yukthix/ui';

// PRF-10 Comp review sheet, the designed screen with live data (PAY-39, M06 batch PM7): managers propose for their
// team (merit, promotion, bonus, a justification outside the matrix); HR sets budgets, opens and applies (the API asks
// for a fresh second factor on apply); approvers approve or send back from the sheet. Pay is read in the pay scope.
const pct = (g: PayEquity['before'][number]) => (g.suppressed ? '' : `${g.medianGapPct.toFixed(1)}%`);

export default function YxCompSheetPage() {
  const perms = useYxPermissions();
  const { id } = useParams<{ id: string }>();
  const base = `/comp-cycles/${encodeURIComponent(id)}`;
  const sheet = usePerf<CompSheet>(`${base}/sheet`);
  const s = sheet.data;
  const hrOrFinance = s?.role === 'hr' || s?.role === 'finance';
  const departments = useOrg<MasterRecord[]>('/masters/departments');
  const designations = useOrg<MasterRecord[]>('/masters/designations', perms.has('org.structure.view') || perms.has('org.settings.manage'));
  const [dimension, setDimension] = useState<'gender' | 'grade' | 'location'>('gender');
  const equity = usePerf<PayEquity>(`${base}/pay-equity?dimension=${dimension}`, hrOrFinance);
  const write = usePerfWrite();
  const version = s?.cycle.version ?? 0;
  const choices = (rows: MasterRecord[] | undefined) => (rows ?? []).filter((r) => !r.archivedAt).map((r) => ({ value: r.id, label: r.name }));
  const rows: CompReviewRow[] = (s?.proposals ?? []).map((p) => {
    const f = p.proration ?? 1;
    return {
      id: p.id,
      name: p.employee,
      department: p.department ?? '',
      grade: p.grade ?? '',
      score: p.score ?? null,
      ctc: p.currentCtc ?? 0,
      gradeMid: 0,
      factor: f,
      eligibility: f < 1 ? 'Part of the year' : 'Included',
      proposed: p.meritPct,
      justification: p.justification ?? undefined,
      peerMedian: 0,
      market: p.market ? { p25: p.market.min, p50: p.market.median, p75: p.market.max } : undefined,
      live: {
        band: p.band ?? 'Not rated',
        compa: p.compaRatio,
        range: p.cell ? [Math.round(p.cell.minPct * f * 100) / 100, Math.round(p.cell.maxPct * f * 100) / 100] : null,
        outOfRange: p.outOfRange,
        newCtc: p.newCtc ?? p.currentCtc ?? 0,
        increment: (p.meritAmount ?? 0) + (p.promotionAmount ?? 0),
        belowPeers: Boolean(p.belowPeers),
        editable: Boolean(s?.can.edit) && p.status === 'draft',
        promotionToDesignationId: p.promotionToDesignationId,
        promotionAmount: p.promotionAmount ?? 0,
        bonusAmount: p.bonusAmount ?? 0,
      },
    };
  });
  const byId = new Map((s?.proposals ?? []).map((p) => [p.id, p]));
  if (refused(sheet)) return <PerfNoAccessScreen title="Comp review" what="comp review" grantedBy="HR" active="Calibration & comp review" persona="hr" />;
  return (
    <CompReviewScreen
      persona={s?.role === 'hr' ? 'hr' : s?.role === 'finance' ? 'fin' : 'mgr'}
      state={designState(sheet)}
      rows={rows}
      budget={[]}
      benchmark={s?.benchmark ? { source: s.benchmark.source, effective: day(s.benchmark.asOf), stale: s.benchmark.stale } : null}
      live={{
        onRetry: () => void sheet.refetch(),
        title: s ? `Comp review · ${s.cycle.name}` : 'Comp review',
        facts: s ? `${s.role === 'manager' ? 'Your team' : `${rows.length} people`} · effective ${formatDate(day(s.cycle.effectiveOn))} · ${s.cycle.status}` : '',
        budgets: (s?.budgets ?? []).map((b) => ({ department: b.kind === 'bonus' ? `${b.department} bonus pool` : b.department, amount: b.amount, used: b.used, remaining: b.remaining, over: b.over })),
        equity: hrOrFinance ? (equity.data?.after ?? []).map((a) => ({ dimension: a.group, before: pct(equity.data!.before.find((b) => b.group === a.group) ?? a), after: pct(a), suppressed: a.suppressed })) : null,
        can: { submit: Boolean(s?.can.submit), decide: Boolean(s?.can.decide), budgets: s?.role === 'hr' && s.cycle.status === 'draft', open: s?.role === 'hr' && s.cycle.status === 'draft', apply: Boolean(s?.can.apply) },
        departments: choices(departments.data),
        designations: choices(designations.data),
        equityDimension: dimension,
        onEquity: setDimension,
        onPropose: (rowId, input) => write('PUT', `/comp-proposals/${encodeURIComponent(rowId)}`, { ...input, version: byId.get(rowId)?.version }),
        onSubmit: () => write('POST', `${base}/submit`),
        onDecide: (decision, reason) => write('POST', `${base}/decide`, { decision, reason }),
        onBudgets: ({ departmentId, merit, bonus }) => write('PUT', `${base}/budgets`, { budgets: [...(merit !== null ? [{ departmentId, kind: 'merit', amount: merit }] : []), ...(bonus !== null ? [{ departmentId, kind: 'bonus', amount: bonus }] : [])] }),
        onOpenCycle: () => write('POST', `${base}/open`, { version }),
        onApply: () => write('POST', `${base}/apply`, { version }),
        marketHref: perms.has('perf.comp.manage') ? '/yx/performance/comp/market' : undefined,
      }}
    />
  );
}
