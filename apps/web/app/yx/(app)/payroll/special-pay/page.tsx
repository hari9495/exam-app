'use client';

import { useEffect, useState } from 'react';
import { SpecialPayHomeScreen, type IncentivePlanView, type PieceOutput, type TipPoolView, type UnionRemittance, type PieceCheck, type OncallRuleView, type RateCard, type SetupEntity, type SpecialPosting, type UnionsView, type SettlementPreview } from '@yukthix/ui/pay';
import { useOrg } from '../../../../../lib/yx-org';
import { payState, usePay, usePayRead } from '../../../../../lib/yx-pay';
import { useApiWrite, useNames } from '../../../../../lib/yx-pay-5j';
import { usePeopleSearch } from '../../../../../lib/yx-pay-5b';
import { todayIndia } from '../../../../../lib/yx-time';

// Payroll › Special pay (PAY-50 home, PAY-31 … 37 tabs; PAY-9.02, 9.04, 9.06 … 9.08): piece-rate, incentives, tips,
// on-call, union dues, settlements, lay-off and VRS, each month's sheet sent to payroll for approval.
export default function YxPaySpecialPage() {
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const [entityId, setEntityId] = useState<string | null>(null);
  useEffect(() => {
    if (!entityId && entities.data?.length) setEntityId(entities.data[0].id);
  }, [entities.data, entityId]);
  const [month, setMonth] = useState(() => todayIndia().slice(0, 7));
  const q = (path: string) => (entityId ? `/special/${path}${path.includes('?') ? '&' : '?'}legalEntityId=${encodeURIComponent(entityId)}` : null);
  const postings = usePay<SpecialPosting[]>(q(`postings?month=${month}`));
  const cards = usePay<RateCard[]>(q('rate-cards'));
  const outputs = usePay<PieceOutput[]>(q(`outputs?month=${month}`));
  const pools = usePay<TipPoolView[]>(q(`tip-pools?month=${month}`));
  const read = usePayRead();
  const plans = usePay<IncentivePlanView[]>(q('plans'));
  const unions = usePay<UnionsView>(q('unions'));
  const rules = usePay<OncallRuleView[]>(q('oncall-rules'));
  const locations = useOrg<{ id: string; name: string; legalEntityId: string | null }[]>('/locations');
  const departments = useOrg<{ id: string; name: string; archivedAt: string | null }[]>('/masters/departments');
  const write = useApiWrite();
  const nameOf = useNames();
  const search = usePeopleSearch();
  const e = encodeURIComponent;
  const sp = (path: string, body?: unknown) => write(`/payroll/special/${path}`, body);
  return (
    <SpecialPayHomeScreen
      live={{
        // Postings need payroll.special.manage: without it the whole page is "no access", not an empty home tab.
        state: entityId ? payState(entities, postings) : payState(entities),
        onRetry: () => void entities.refetch(),
        entities: entities.data ?? [],
        entityId,
        onEntity: setEntityId,
        month,
        onMonth: setMonth,
        locations: (locations.data ?? []).filter((l) => l.legalEntityId === entityId),
        nameOf,
        onSearch: search,
        postings: postings.data ?? null,
        cards: cards.data ?? null,
        outputs: outputs.data ?? null,
        plans: plans.data ?? null,
        pools: pools.data ?? null,
        unions: unions.data ?? null,
        oncallRules: rules.data ?? null,
        onAddCard: (x) => sp('rate-cards', { legalEntityId: entityId, ...x }),
        onSaveOutput: (x) => sp('outputs', { legalEntityId: entityId, rows: [x] }),
        onImportOutputs: (file) => {
          const form = new FormData();
          form.append('legalEntityId', entityId!);
          form.append('file', file);
          return write('/payroll/special/outputs/import', form);
        },
        onAddPlan: (x) => sp('plans', { legalEntityId: entityId, ...x }),
        departments: (departments.data ?? []).filter((d) => !d.archivedAt).map((d) => ({ id: d.id, name: d.name })),
        onUpdatePlan: (id, x) => write(`/payroll/special/plans/${e(id)}`, { legalEntityId: entityId, ...x }, 'PUT'),
        onPublishPlan: (id) => sp(`plans/${e(id)}/publish`),
        onNewPlanVersion: (id, effectiveFrom) => sp(`plans/${e(id)}/versions`, { effectiveFrom }),
        onSaveResult: (planId, x) => sp(`plans/${e(planId)}/results`, { month, rows: [x] }),
        onAddPool: (x) => sp('tip-pools', { ...x, month }) as Promise<{ id: string }>,
        onAddRule: (x) => sp('oncall-rules', { legalEntityId: entityId, ...x }),
        onSettlementPreview: (id) => read<SettlementPreview>(`/special/settlements/${e(id)}/preview?month=${month}`),
        onAddSlot: (x) => sp('oncall-slots', x),
        onAddUnion: (x) => sp('unions', { legalEntityId: entityId, ...x }),
        onAuthorise: (x) => sp('union-authorisations', x),
        onRevoke: (id, revokedOn) => sp(`union-authorisations/${e(id)}/revoke`, { revokedOn }),
        onRemittance: (unionId) => read<UnionRemittance>(`/special/unions/${e(unionId)}/remittance?month=${month}`),
        onMarkRemitted: (unionId, x) => sp(`unions/${e(unionId)}/remittance`, { month, ...x }),
        onPieceCheck: () => read<PieceCheck>(`/special/piece/check?legalEntityId=${e(entityId!)}&month=${month}`),
        today: todayIndia(),
        onAddSettlement: (x) => sp('settlements', { legalEntityId: entityId, ...x }),
        onLayoff: (x) => sp(`entities/${e(entityId!)}/layoff-days`, { ...x, month }),
        onVrs: (x) => sp(`entities/${e(entityId!)}/vrs`, { ...x, month }),
        onPost: (what) => {
          if (what.kind === 'plan') return sp(`plans/${e(what.id)}/post`, { month });
          if (what.kind === 'pool') return sp(`tip-pools/${e(what.id)}/post`);
          if (what.kind === 'settlement') return sp(`settlements/${e(what.id)}/post`, { month });
          return sp(`${what.kind === 'clawbacks' ? 'clawbacks' : what.kind}/post`, { legalEntityId: entityId, month });
        },
      }}
    />
  );
}
