import { Prisma } from '@prisma/client';
import { deriveGlobalStage, GlobalStage } from '@exam-platform/shared';

export async function recomputeGlobalStage(
  tx: Prisma.TransactionClient,
  organizationId: string,
  candidateId: string,
): Promise<GlobalStage> {
  const entries = await tx.pipelineEntry.findMany({
    where: { candidateId, organizationId },
    select: { archivedAt: true, status: { select: { stage: { select: { category: true } } } } },
  });
  const emailCount = await tx.candidateEmail.count({ where: { candidateId, organizationId } });
  const stage = deriveGlobalStage(
    entries.map((e) => ({
      category: (e.status?.stage.category ?? 'active') as any,
      archived: e.archivedAt != null,
    })),
    emailCount > 0,
  );
  await tx.candidate.update({ where: { id: candidateId }, data: { globalStage: stage } });
  return stage;
}
