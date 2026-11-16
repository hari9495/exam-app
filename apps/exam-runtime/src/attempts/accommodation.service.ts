import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService, BlobStorageService, EVIDENCE_MAX_BYTES, TenantPrismaService, evidenceType, requestProblem, safeEvidenceName } from '@exam-platform/shared';
import { CandidateSession } from '../candidate-auth/current-candidate.decorator';

// Assessments AS-4b (answer 2011; PRC-23, PRC-24): the candidate asks for help with the test before starting it, with
// optional evidence (special data, seen only by the test owner who decides). One open request at a time. A manual
// identity check ('identity') is asked for after saying no to face checks, only on a test that has them.

export interface AccommodationAsk {
  kinds: string[];
  extraTimePercent?: number | null;
  note?: string | null;
  evidence?: { fileName: string; dataUri: string } | null;
}

export interface CandidateHelp {
  /** The latest request, as the candidate sees it (never the evidence). */
  request: { kinds: string[]; extraTimePercent: number | null; status: string; approvedKinds: string[]; grantedExtraTimePercent: number | null; message: string | null; createdAt: string; decidedAt: string | null } | null;
  /** Everything approved for this invitation so far (answer 2164: "approved for you"). */
  approved: string[];
  extraTimePercent: number;
}

@Injectable()
export class AccommodationService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly blobStorage: BlobStorageService,
    private readonly audit: AuditService,
  ) {}

  /** The signed-in candidate's invitation, its company, test and attempt (found as a system read by the session's id). */
  private async invitationOf(invitationId: string) {
    const inv = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.invitation.findUnique({ where: { id: invitationId }, select: { id: true, organizationId: true, extraTimePercent: true, status: true, exam: { select: { faceVerificationEnabled: true } }, attempt: { select: { id: true } } } }),
    );
    if (!inv?.organizationId) throw new UnauthorizedException('Invalid candidate session');
    return inv as typeof inv & { organizationId: string };
  }

  async help(session: CandidateSession): Promise<CandidateHelp> {
    const inv = await this.invitationOf(session.invitationId);
    return this.tenantPrisma.forTenant({ organizationId: inv.organizationId, isSuperAdmin: false }, (tx) => helpOf(tx, inv.id, inv.extraTimePercent));
  }

  async ask(session: CandidateSession, dto: AccommodationAsk): Promise<CandidateHelp> {
    const inv = await this.invitationOf(session.invitationId);
    if (inv.status === 'revoked') throw new BadRequestException('This invitation was withdrawn.');
    if (inv.attempt) throw new ConflictException('Your test has started. Ask the recruiter for help instead.');
    const kinds = [...new Set(dto.kinds)];
    const problem = requestProblem(kinds, dto.extraTimePercent ?? null);
    if (problem) throw new BadRequestException(problem);
    if (kinds.includes('identity') && !inv.exam.faceVerificationEnabled) throw new BadRequestException('This test has no face check, so no manual check is needed.');

    // Evidence: decoded and checked by its first bytes before anything is stored.
    let evidence: { buf: Buffer; type: string; name: string } | null = null;
    if (dto.evidence) {
      const m = /^data:[^;,]*;base64,([A-Za-z0-9+/=\s]+)$/.exec(dto.evidence.dataUri);
      if (!m) throw new BadRequestException('The file could not be read. Send a PDF, JPG or PNG.');
      const buf = Buffer.from(m[1]!, 'base64');
      if (buf.length === 0) throw new BadRequestException('The file is empty.');
      if (buf.length > EVIDENCE_MAX_BYTES) throw new BadRequestException('The file is larger than 10 MB.');
      const type = evidenceType(buf);
      if (!type) throw new BadRequestException('Send a PDF, JPG or PNG.');
      evidence = { buf, type, name: safeEvidenceName(dto.evidence.fileName) };
    }
    const ctx = { organizationId: inv.organizationId, isSuperAdmin: false };
    if (await this.tenantPrisma.forTenant(ctx, (tx) => tx.accommodationRequest.count({ where: { invitationId: inv.id, status: 'pending' } })))
      throw new ConflictException('Your earlier request is still being decided. You will hear back before your test.');
    // The slow upload outside the transaction; a private blob, signed only for the person deciding.
    const path = evidence ? await this.blobStorage.upload(`accommodation-evidence/${inv.organizationId}/${inv.id}/${randomUUID()}-${evidence.name}`, evidence.buf, evidence.type) : null;
    try {
      await this.tenantPrisma.forTenant(ctx, (tx) =>
        tx.accommodationRequest.create({
          data: {
            invitationId: inv.id,
            kinds,
            extraTimePercent: dto.extraTimePercent ?? null,
            note: dto.note?.trim() || null,
            evidencePath: path,
            evidenceName: evidence?.name ?? null,
            evidenceType: evidence?.type ?? null,
          },
        }),
      );
    } catch (e) {
      // Two sends at once: the open-request index keeps one; the second file is not kept.
      if (path) await this.blobStorage.deleteByUrl(path).catch(() => undefined);
      if ((e as { code?: string }).code === 'P2002') throw new ConflictException('Your earlier request is still being decided. You will hear back before your test.');
      throw e;
    }
    await this.audit.record(ctx, { actorUserId: null, action: 'accommodation.requested', entityType: 'invitation', entityId: inv.id, metadata: { kinds, evidence: Boolean(path) } });
    return this.help(session);
  }
}

/** What the candidate sees of their requests (also part of the pre-start screen). */
export async function helpOf(tx: { accommodationRequest: { findMany: (a: object) => Promise<{ kinds: string[]; extraTimePercent: number | null; status: string; approvedKinds: string[]; grantedExtraTimePercent: number | null; message: string | null; createdAt: Date; decidedAt: Date | null }[]> } }, invitationId: string, extraTimePercent: number): Promise<CandidateHelp> {
  const rows = await tx.accommodationRequest.findMany({ where: { invitationId }, orderBy: { createdAt: 'desc' }, select: { kinds: true, extraTimePercent: true, status: true, approvedKinds: true, grantedExtraTimePercent: true, message: true, createdAt: true, decidedAt: true } });
  const last = rows[0];
  return {
    request: last ? { ...last, createdAt: last.createdAt.toISOString(), decidedAt: last.decidedAt?.toISOString() ?? null } : null,
    approved: [...new Set(rows.flatMap((r) => r.approvedKinds))],
    extraTimePercent,
  };
}
