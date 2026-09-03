import type { ApprovalGate, ResolvedStep, ApproverType } from '@exam-platform/shared';

export interface ChainStepInput {
  position: number; name: string; approverType: ApproverType;
  approverUserIds: string[]; managerLevel: number | null;
}

async function walkManagers(tx: any, startUserId: string, levels: number): Promise<string | null> {
  let current: string | null = startUserId;
  for (let i = 0; i < levels && current; i++) {
    const u: { managerId: string | null } | null = await tx.user.findUnique({ where: { id: current }, select: { managerId: true } });
    current = u?.managerId ?? null;
  }
  return current;
}

async function activeIds(tx: any, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await tx.user.findMany({ where: { id: { in: ids }, status: 'active' }, select: { id: true } });
  return rows.map((r: { id: string }) => r.id);
}

export async function resolveSteps(
  tx: any,
  args: { steps: ChainStepInput[]; submitterUserId: string; gate: ApprovalGate; subjectId: string },
): Promise<{ resolved: ResolvedStep[]; skipped: { position: number; reason: string }[] }> {
  const resolved: ResolvedStep[] = [];
  const skipped: { position: number; reason: string }[] = [];
  for (const s of args.steps) {
    let ids: string[] = [];
    if (s.approverType === 'users') {
      ids = await activeIds(tx, s.approverUserIds);
    } else if (s.approverType === 'reporting_manager') {
      const mgr = await walkManagers(tx, args.submitterUserId, s.managerLevel ?? 1);
      ids = mgr ? await activeIds(tx, [mgr]) : [];
    } else if (s.approverType === 'hiring_manager') {
      let jobId = args.subjectId;
      if (args.gate === 'offer') {
        const offer = await tx.offer.findUnique({ where: { id: args.subjectId }, select: { pipelineEntry: { select: { jobId: true } } } });
        jobId = offer?.pipelineEntry?.jobId ?? '';
      }
      const job = jobId ? await tx.job.findUnique({ where: { id: jobId }, select: { hiringManagerId: true } }) : null;
      ids = job?.hiringManagerId ? await activeIds(tx, [job.hiringManagerId]) : [];
    }
    if (ids.length === 0) {
      skipped.push({ position: s.position, reason: `No approver resolved for step "${s.name}" (${s.approverType})` });
      continue;
    }
    resolved.push({ position: s.position, name: s.name, approverType: s.approverType, approverUserIds: ids });
  }
  // Re-number resolved steps to a contiguous 0..n so currentStepPosition math is simple.
  resolved.forEach((r, i) => (r.position = i));
  return { resolved, skipped };
}
