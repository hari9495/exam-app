'use client';

import { useAuth } from '../../../../../lib/auth-context';
import { BiasAuditScreen, type AuditCategory, type BiasAuditInput } from '@yukthix/ui/hiring';
import { apiFetch } from '../../../../../lib/api-client';
import { useHiring, useHiringWrite } from '../../../../../lib/yx-hiring';
import { todayInIndia } from '../../../../../lib/yx-hiring-costs';

type View = {
  canEdit: boolean;
  nycOn: boolean;
  law: { name: string; categories: { sex: string[]; race: string[] } } | null;
  valid: boolean;
  validUntil: string | null;
  tools: { rediscoveryAi: boolean; aiDraft: boolean };
  audits: { id: string; auditedOn: string; auditor: string; summaryUrl: string; results: { sex: AuditCategory[]; race: AuditCategory[] } }[];
};

const day = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

// Hiring › Reports & compliance › Bias audits (HIR-23): the designed BiasAuditScreen with `live`. The company says it uses
// an automated tool for New York City jobs (setting hiring.bias_audit.nyc, off by default); the latest independent audit
// counts for a year (rule set HIR.BIAS_AUDIT). Recording needs the hiring settings key for the whole company; the API
// refuses it while acting for someone else.
export default function YxBiasAuditsPage() {
  const { accessToken, impersonating, actingSuperAdmin } = useAuth();
  const view = useHiring<View>('/bias-audits');
  const write = useHiringWrite();
  const v = view.data;
  const latest = v?.audits[0] ?? null;
  const tools = [v?.tools.rediscoveryAi ? 'AI notes on past candidates' : null, v?.tools.aiDraft ? 'AI draft scorecards' : null].filter(Boolean).join(' and ') || 'Automated hiring tools';
  return (
    <BiasAuditScreen
      // Remount once the law's categories arrive (the Record audit form starts from them).
      key={v ? `ready-${v.law?.categories.sex.length ?? 0}-${latest?.id ?? 'none'}` : 'loading'}
      feature={tools}
      nycOn={Boolean(v?.nycOn)}
      lastAudit={latest ? day(latest.auditedOn) : null}
      auditor={latest?.auditor ?? null}
      summaryUrl={latest?.summaryUrl ?? null}
      sex={latest?.results.sex ?? []}
      race={latest?.results.race ?? []}
      today={todayInIndia()}
      live={{
        state: view.isError ? 'error' : v ? 'ready' : 'loading',
        onRetry: () => void view.refetch(),
        canEdit: Boolean(v?.canEdit) && !impersonating && !actingSuperAdmin,
        lawName: v?.law?.name ?? 'NYC Local Law 144',
        categories: v?.law?.categories ?? { sex: [], race: [] },
        validUntil: v?.validUntil ? day(v.validUntil) : null,
        onReport: latest
          ? async () => {
              const { url } = (await apiFetch(`/hiring/bias-audits/${encodeURIComponent(latest.id)}/report`, {}, accessToken ?? undefined)) as { url: string };
              window.open(url, '_blank', 'noopener');
            }
          : undefined,
        onRecord: async (input: BiasAuditInput) => {
          await write('POST', '/bias-audits', { ...input, note: input.note ?? undefined });
        },
      }}
    />
  );
}
