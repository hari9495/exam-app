'use client';

import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { DeathInServiceFlow, ExitCaseWorkspace } from '@yukthix/ui/frame';
import { type DeathFacts, type ExitStep, type ExitWorkspace, type Handoff, type InterviewAnswers, type Payee, type Payees, type QueueDocument } from '@yukthix/ui/lifecycle';
import type { FnfSettlementView } from '@yukthix/ui/pay';
import { loadState, useYxPermissions } from '../../../../../../lib/yx-org';
import { useLife, useLifeWrite } from '../../../../../../lib/yx-lifecycle';
import { usePay, usePayWrite } from '../../../../../../lib/yx-pay';
import { useAuth } from '../../../../../../lib/auth-context';
import { apiFetch } from '../../../../../../lib/api-client';

const id = encodeURIComponent;

// People › Exits › one exit (PPL-19 workspace): the exit, last-day changes, HR-only facts, clearance, the interview.
export default function YxExitPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { accessToken } = useAuth();
  const { id: caseId } = useParams<{ id: string }>();
  const perms = useYxPermissions();
  const data = useLife<ExitWorkspace>(`/lifecycle/exits/${id(caseId)}`);
  const manage = perms.has('lifecycle.exit.manage');
  // 6d: the steps after the last day (HR) and the payroll hand-off (HR or payroll staff).
  const steps = useLife<ExitStep[]>(manage ? `/lifecycle/exits/${id(caseId)}/steps` : null);
  // 6e death in service: the payees, and the succession certificates on the record for legal heirs.
  const death = manage && data.data?.exitType === 'death';
  const payees = useLife<Payees>(death ? `/lifecycle/exits/${id(caseId)}/payees` : null);
  const docs = useLife<{ documents: QueueDocument[] }>(death && data.data?.personId ? `/documents/people/${id(data.data.personId)}` : null);
  const handoff = useLife<Handoff>(manage || perms.has('payroll.period.view') ? `/lifecycle/exits/${id(caseId)}/handoff` : null);
  // PPL-23: a death in service runs as its own five steps; its F&F shows only to those who may see pay.
  const facts = useLife<DeathFacts>(death ? `/lifecycle/exits/${id(caseId)}/death` : null);
  const seesPay = death && perms.has('payroll.fnf.manage');
  const fnf = usePay<FnfSettlementView[]>(seesPay ? '/fnf' : null);
  const payWrite = usePayWrite();
  const write = useLifeWrite();
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const who = data.data?.name ?? 'the leaver';
  // Each done action is a toast that names the person and the item.
  const said = <A extends unknown[]>(run: (...a: A) => Promise<unknown>, title: (...a: A) => string) => async (...a: A) => {
    const out = await run(...a);
    toast({ tone: 'success', title: title(...a) });
    return out;
  };
  const signOff = said(
    (item: { id: string; title: string; version: number }, x: { action: 'clear' | 'waive'; note: string | null; recoveryAmount: string | null; recoveryReason: string | null }) =>
      write('POST', `/lifecycle/clearance/${id(item.id)}/sign-off`, { action: x.action, version: item.version, ...(x.note ? { note: x.note } : {}), ...(x.recoveryAmount ? { recoveryAmount: x.recoveryAmount, recoveryReason: x.recoveryReason } : {}) }),
    (item, x) => `${item.title} ${x.action === 'clear' ? 'signed off' : 'waived'} for ${who}`,
  );
  if (death && data.data) {
    const d = data.data;
    const s = fnf.data?.find((x) => x.employeeId === d.employeeId && x.exitType === 'death') ?? null;
    const canSubmit = Boolean(perms.has('payroll.run.prepare') && s?.runId);
    const upload = (typeKey: string) => (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return write('POST', `/documents/people/${id(d.personId!)}/${typeKey}`, form);
    };
    const state = loadState(data, facts, payees, ...(seesPay ? [fnf] : []));
    return (
      <DeathInServiceFlow
        live={{
          state: state === 'no-access' ? 'not-found' : state,
          onRetry: () => void Promise.all([data.refetch(), facts.refetch(), payees.refetch(), ...(seesPay ? [fnf.refetch()] : [])]),
          name: d.name,
          about: facts.data?.about ?? null,
          diedOn: new Date(`${d.lastDay}T00:00:00`),
          contact: facts.data?.contactUserId ?? null,
          contacts: facts.data?.contacts ?? [],
          onContact: said((userId: string) => write('PUT', `/lifecycle/exits/${id(caseId)}/death/contact`, { userId }), () => `Compassionate contact for ${who}'s family saved`),
          certificate: facts.data?.certificate ?? null,
          onCertificate: said(upload('death_certificate'), () => `Death certificate uploaded for ${who}`),
          payees: payees.data ?? null,
          successionDocuments: (docs.data?.documents ?? []).filter((x) => x.typeKey === 'succession_certificate').map((x) => ({ value: x.id, label: `${x.typeName}${x.file ? `: ${x.file.name}` : ''}` })),
          onSuccession: said(upload('succession_certificate'), () => `Succession certificate uploaded for ${who}`),
          onPayees: said(
            (list: Payee[]) => write('PUT', `/lifecycle/exits/${id(caseId)}/payees`, { payees: list.map((p) => ({ kind: p.kind, name: p.name, relation: p.relation, sharePercent: p.sharePercent, ...(p.email ? { email: p.email } : {}), ...(p.documentId ? { documentId: p.documentId } : {}) })) }),
            () => `Payees for ${who} saved`,
          ),
          settlement: seesPay ? s : undefined,
          claims: d.clearance.filter((c) => facts.data?.claimItemIds.includes(c.id)),
          letters: (steps.data ?? []).filter((x) => x.handler.startsWith('letters.')),
          onAccess: async () => {
            const r = await write<{ sent: number }>('POST', `/lifecycle/exits/${id(caseId)}/payees/access`);
            toast({ tone: 'success', title: `Login link sent to ${r.sent} ${r.sent === 1 ? 'payee' : 'payees'}` });
          },
          onBack: () => router.push('/yx/people/exits'),
          ...(canSubmit ? { onFinish: said(() => payWrite(`/runs/${id(s!.runId!)}/submit`, {}), () => `The F&F for ${who} is sent for approval`) } : {}),
          finishBlocked: !payees.data?.complete ? 'Complete the payees first; nothing is paid before that.' : !canSubmit ? 'Payroll sends the F&F for approval.' : s!.runStatus !== 'calculated' ? 'Calculate the F&F run in Full and final first.' : undefined,
        }}
      />
    );
  }
  return (
    <ExitCaseWorkspace
      today={new Date(`${today}T00:00:00`)}
      persona={manage || perms.has('lifecycle.exit.view') ? 'hr' : 'mgr'}
      live={{
        state: loadState(data),
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        today,
        onBack: () => router.push('/yx/people/exits'),
        onNotice: said(
          (x: { kind: 'early_release' | 'buyout' | 'lwd_change'; lwd: string; buyoutBy: 'employee' | 'company' | null; buyoutDays: number | null; reason: string; version: number }) =>
            write('POST', `/lifecycle/exits/${id(caseId)}/notice`, { kind: x.kind, lwd: x.lwd, reason: x.reason, version: x.version, ...(x.kind === 'buyout' ? { buyoutBy: x.buyoutBy, buyoutDays: x.buyoutDays } : {}) }),
          () => `New last day for ${who} sent for approval`,
        ),
        onHrFacts: said((x: Parameters<typeof write>[2] & object) => write('PUT', `/lifecycle/exits/${id(caseId)}/hr`, x), () => `HR facts for ${who} saved`),
        onSignOff: signOff,
        onInterview: () => apiFetch(`/lifecycle/exits/${id(caseId)}/interview`, {}, accessToken ?? undefined) as Promise<InterviewAnswers>,
        onInterviewNotes: said((notes: string) => write('PUT', `/lifecycle/exits/${id(caseId)}/interview`, { notes }), () => `Notes on ${who}'s exit interview saved`),
        checklistHref: (j) => `/yx/people/onboarding/${id(j)}`,
        steps: steps.data ?? null,
        onRetryStep: said((s: ExitStep) => write('POST', `/lifecycle/exits/${id(caseId)}/steps/${id(s.handler)}/retry`), (s) => `${s.label} tried again for ${who}`),
        onStepDone: said((s: ExitStep, note: string) => write('POST', `/lifecycle/exits/${id(caseId)}/steps/${id(s.handler)}/done`, { note }), (s) => `${s.label} marked done for ${who}`),
        handoff: handoff.data ?? null,
        onSettledOutside: said((x: { settledOn: string; reason: string }) => write('POST', `/lifecycle/exits/${id(caseId)}/settled-outside`, x), () => `${who}'s F&F marked settled outside`),
        ...(manage ? { onWithdraw: said((reason: string) => write('POST', `/lifecycle/exits/${id(caseId)}/withdraw`, { reason }), () => `The exit of ${who} is withdrawn`) } : {}),
      }}
    />
  );
}
