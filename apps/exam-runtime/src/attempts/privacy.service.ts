import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantPrismaService } from '@exam-platform/shared';
import { CandidateSession } from '../candidate-auth/current-candidate.decorator';

// AS-5 part 3 (PRC-28): the candidate's privacy centre at one company: the consents they gave, what is kept and until
// when, a copy of their data, and a request to erase their recordings, clips and face data. The API's nightly sweep
// does the erasing once nothing holds the evidence (an undecided incident, an open appeal or its open window).

export interface PrivacyView {
  company: string;
  consents: { what: string; test: string; at: string }[];
  recordings: { frames: number; deleteOn: string | null };
  face: { kept: boolean; deleteOn: string | null };
  /** Answer 2279: files sent with accommodation requests; kept until decided, then the company's retention. */
  accommodation: { files: number; deleteOn: string | null; pending: boolean };
  /** An incident or appeal holds the evidence (legal hold). */
  held: boolean;
  request: { status: 'waiting' | 'done'; requestedAt: string; doneAt: string | null; dueOn: string } | null;
}

const DAY = 86_400_000;
/** How long the company has to act on an erasure request (DPDP: without delay; the page promises 30 days). */
const ERASE_WITHIN_DAYS = 30;

@Injectable()
export class PrivacyService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The signed-in candidate and their company (a system read by the session's invitation). */
  private async whoOf(session: CandidateSession) {
    const found = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
      const inv = await tx.invitation.findUnique({ where: { id: session.invitationId }, select: { organizationId: true, candidateId: true } });
      const org = inv?.organizationId ? await tx.organization.findUnique({ where: { id: inv.organizationId }, select: { name: true } }) : null;
      return inv ? { ...inv, name: org?.name ?? null } : null;
    });
    if (!found?.organizationId) throw new UnauthorizedException('Invalid candidate session');
    return { org: found.organizationId, candidateId: found.candidateId, company: found.name ?? 'The company' };
  }

  async view(session: CandidateSession): Promise<PrivacyView> {
    const who = await this.whoOf(session);
    return this.tenantPrisma.forTenant({ organizationId: who.org, isSuperAdmin: false }, async (tx) => {
      const attempts = await tx.attempt.findMany({
        where: { invitation: { candidateId: who.candidateId } },
        orderBy: { startedAt: 'desc' },
        select: { id: true, consentAt: true, startedAt: true, submittedAt: true, invitation: { select: { exam: { select: { title: true } } } }, faceEnrolment: { select: { consentAt: true, capturedAt: true, referenceImagePath: true, embedding: true } } },
      });
      const ids = attempts.map((a) => a.id);
      const days = await retentionDays(tx, who.org);
      const frames = await tx.proctoringEvent.count({ where: { attemptId: { in: ids }, OR: [{ metadataJson: { contains: '"snapshot"' } }, { metadataJson: { contains: '"screenshot"' } }] } });
      const last = attempts.map((a) => a.submittedAt ?? a.startedAt).filter((d): d is Date => d !== null).sort((a, b) => b.getTime() - a.getTime())[0];
      const faces = attempts.map((a) => a.faceEnrolment).filter((f) => f && (f.referenceImagePath || f.embedding));
      const faceAt = faces.map((f) => f!.capturedAt).filter((d): d is Date => d !== null).sort((a, b) => b.getTime() - a.getTime())[0];
      const r = await tx.asmtErasureRequest.findFirst({ where: { candidateId: who.candidateId }, orderBy: { requestedAt: 'desc' } });
      const acc = await tx.accommodationRequest.findMany({ where: { invitation: { candidateId: who.candidateId }, evidencePath: { not: null } }, select: { status: true, decidedAt: true } });
      const decided = acc.map((a) => a.decidedAt).filter((d): d is Date => d !== null).sort((a, b) => b.getTime() - a.getTime())[0];
      return {
        company: who.company,
        consents: attempts.flatMap((a) => [
          ...(a.consentAt ? [{ what: 'Camera, screen and activity monitoring', test: a.invitation.exam.title, at: a.consentAt.toISOString() }] : []),
          ...(a.faceEnrolment?.consentAt ? [{ what: 'Face check (biometric)', test: a.invitation.exam.title, at: a.faceEnrolment.consentAt.toISOString() }] : []),
        ]),
        recordings: { frames, deleteOn: frames && last ? new Date(last.getTime() + days * DAY).toISOString() : null },
        face: { kept: faces.length > 0, deleteOn: faces.length && faceAt ? new Date(faceAt.getTime() + days * DAY).toISOString() : null },
        accommodation: { files: acc.length, pending: acc.some((a) => a.status === 'pending'), deleteOn: acc.length && decided ? new Date(decided.getTime() + days * DAY).toISOString() : null },
        held: await onHold(tx, ids),
        request: r ? { status: r.status as 'waiting' | 'done', requestedAt: r.requestedAt.toISOString(), doneAt: r.doneAt?.toISOString() ?? null, dueOn: new Date(r.requestedAt.getTime() + ERASE_WITHIN_DAYS * DAY).toISOString() } : null,
      };
    });
  }

  /** Asking again while one waits records nothing new. */
  async requestErase(session: CandidateSession): Promise<PrivacyView> {
    const who = await this.whoOf(session);
    const ctx = { organizationId: who.org, isSuperAdmin: false };
    const created = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const waiting = await tx.asmtErasureRequest.findFirst({ where: { candidateId: who.candidateId, status: 'waiting' } });
      if (waiting) return false;
      await tx.asmtErasureRequest.create({ data: { organizationId: who.org, candidateId: who.candidateId } });
      return true;
    });
    if (created) await this.audit.record(ctx, { actorUserId: null, action: 'candidate.erasure_requested', entityType: 'candidate', entityId: who.candidateId, metadata: { scope: 'recordings_face' } });
    return this.view(session);
  }

  /** A copy of what the company holds about the candidate's tests (no images and no score before it is released). */
  async export(session: CandidateSession) {
    const who = await this.whoOf(session);
    const ctx = { organizationId: who.org, isSuperAdmin: false };
    const data = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const candidate = await tx.candidate.findUnique({ where: { id: who.candidateId }, select: { name: true, email: true } });
      const attempts = await tx.attempt.findMany({
        where: { invitation: { candidateId: who.candidateId } },
        orderBy: { startedAt: 'asc' },
        select: {
          status: true,
          startedAt: true,
          submittedAt: true,
          consentAt: true,
          invitation: { select: { exam: { select: { title: true } } } },
          proctoringEvents: { orderBy: { occurredAt: 'asc' }, take: 2000, select: { eventType: true, occurredAt: true } },
          messages: { orderBy: { sentAt: 'asc' }, select: { fromCandidate: true, body: true, sentAt: true } },
          integrityAppeals: { select: { text: true, status: true, createdAt: true } },
          id: true,
          faceEnrolment: { select: { status: true, consentAt: true, capturedAt: true } },
        },
      });
      // AS-6 part 2: an AI-allowed test's assistant log is the candidate's data too.
      const assistant = await tx.asmtAssistantMessage.findMany({ where: { attemptId: { in: attempts.map((a) => a.id) } }, orderBy: { createdAt: 'asc' }, take: 2000, select: { attemptId: true, role: true, body: true, createdAt: true } });
      const accommodations = await tx.accommodationRequest.findMany({ where: { invitation: { candidateId: who.candidateId } }, orderBy: { createdAt: 'asc' }, select: { status: true, createdAt: true, decidedAt: true, evidenceName: true } });
      return {
        company: who.company,
        exportedAt: new Date().toISOString(),
        you: candidate,
        tests: attempts.map((a) => ({
          test: a.invitation.exam.title,
          status: a.status,
          startedAt: a.startedAt,
          submittedAt: a.submittedAt,
          monitoringConsentAt: a.consentAt,
          faceCheck: a.faceEnrolment,
          monitoringEvents: a.proctoringEvents.map((e) => ({ type: e.eventType, at: e.occurredAt })),
          messages: a.messages.map((m) => ({ from: m.fromCandidate ? 'you' : 'proctor', body: m.body, at: m.sentAt })),
          appeals: a.integrityAppeals,
          assistant: assistant.filter((m) => m.attemptId === a.id).map((m) => ({ from: m.role === 'candidate' ? 'you' : 'assistant', body: m.body, at: m.createdAt })),
        })),
        accommodationRequests: accommodations.map((a) => ({ status: a.status, sentAt: a.createdAt, decidedAt: a.decidedAt, file: a.evidenceName })),
        note: 'Camera frames, screen captures and accommodation files are not included as files. Your score shows on your result page once the company releases it.',
      };
    });
    await this.audit.record(ctx, { actorUserId: null, action: 'candidate.data_exported', entityType: 'candidate', entityId: who.candidateId, metadata: { by: 'candidate' } });
    return data;
  }
}

/** The company's evidence retention (asmt.retention), 30 to 365 days, 30 when not set (as the API's sweeps). */
async function retentionDays(tx: Prisma.TransactionClient, organizationId: string): Promise<number> {
  const row = await tx.setting.findFirst({ where: { organizationId, key: 'asmt.retention', scopeType: 'tenant' }, select: { value: true } });
  const n = Number(row?.value);
  return Number.isInteger(n) ? Math.min(365, Math.max(30, n)) : 30;
}

/** Legal hold: an undecided incident, an open appeal, or a decided one whose appeal window is still open. */
export async function onHold(tx: Prisma.TransactionClient, attemptIds: string[], now = new Date()): Promise<boolean> {
  if (!attemptIds.length) return false;
  const n = await tx.integrityIncident.count({
    where: {
      attemptId: { in: attemptIds },
      OR: [{ status: { not: 'decided' } }, { appeal: { is: { status: 'open' } } }, { appeal: { is: null }, appealClosesAt: { gt: now } }],
    },
  });
  return n > 0;
}
