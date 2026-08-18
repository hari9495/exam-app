import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Candidate, CandidateProfile } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { TenantContext } from '@exam-platform/shared';
import { AuditService } from '@exam-platform/shared';
import { BlobStorageService, BlobDeleteOutcome } from '@exam-platform/shared';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { parseCandidateCsv } from './csv-parser';
import { resolvePaginationParams, buildPaginatedResponse, PaginatedResponse } from '../common/paginated-response';
import { signProctoringEvidence } from '../common/sign-proctoring-evidence';

interface CandidateFilters {
  page?: string;
  pageSize?: string;
  search?: string;
  status?: string;
}

// A recruiter's erase-candidate click sits on this call, and one candidate's evidence blobs
// span every attempt they ever sat -- unbounded, sequential deletes would turn that into a
// multi-minute synchronous request. Bound both the fan-out and the per-call latency, mirroring
// attempt.service.ts's SCREENSHOT_UPLOAD_TIMEOUT_MS/withTimeout pattern for the upload side of
// the same blobs.
const EVIDENCE_DELETE_CONCURRENCY = 10;
const EVIDENCE_DELETE_TIMEOUT_MS = 3000;
// Overall ceiling on the delete phase's wall clock, on top of the per-call timeout above. A
// batch is only admitted if it can finish inside this budget even in the worst case (every
// delete in it degrading to the full per-call timeout) -- so the phase's own wall clock never
// exceeds this number, unlike a plain "check the clock, then run anyway" loop which could run
// one more full timeout past it. This phase runs synchronously inside a recruiter's HTTP
// request, *after* the Prisma transaction and audit write already in that same request, so the
// budget leaves headroom under common reverse-proxy/gateway default request timeouts (e.g. a
// 30s nginx or Azure App Service front door default) rather than spending the whole 30s itself.
// At worst case this still attempts 6 batches (60 blobs) before giving up; a healthy store
// clears many times that in the same budget.
const EVIDENCE_DELETE_BUDGET_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer!: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// The database reference to a failed-or-unattempted evidence blob is gone the moment this
// function's caller returns (metadataJson is already null by then) -- this is the only
// remaining way to point someone at the file. Safe to log: strips scheme, host, and any query
// string (a SAS token, if this URL ever carried one), keeping only the path inside the
// container so an operator can look the blob up by hand.
//
// evidenceUrls also carries legacy inline `data:` URIs (image bytes, base64-encoded, straight
// in the string -- see blob-storage.service.ts's "inline data: URIs from before this fix").
// `new URL()` parses those happily, and for an opaque scheme like `data:` its `.pathname` *is*
// the entire opaque body -- slicing that would log the candidate's own webcam/screenshot bytes
// into the one log the erase does not control the retention of. Only ever slice a real
// hierarchical http(s) blob URL; anything else is reported as unparseable rather than sliced.
function blobPathForLogging(blobUrl: string): string {
  try {
    const url = new URL(blobUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return '(inline or non-URL evidence value)';
    }
    const [, , ...containerRelative] = url.pathname.split('/');
    const path = containerRelative.length > 0 ? containerRelative.join('/') : url.pathname;
    try {
      return decodeURIComponent(path);
    } catch {
      return path; // malformed percent-encoding -- log the raw (still scheme/host/query-free) path
    }
  } catch {
    return '(unparseable evidence URL)';
  }
}

// Logging hundreds of paths on one line risks a truncated log pipeline silently dropping the
// tail -- the only surviving record of those blobs. Chunk into numbered groups instead.
const LOG_CHUNK_SIZE = 50;
function chunkedLogLines(label: string, paths: string[]): string[] {
  const lines: string[] = [];
  for (let i = 0; i < paths.length; i += LOG_CHUNK_SIZE) {
    const chunk = paths.slice(i, i + LOG_CHUNK_SIZE);
    const suffix = paths.length > LOG_CHUNK_SIZE ? ` [${i + 1}-${i + chunk.length} of ${paths.length}]` : '';
    lines.push(`${label}${suffix}: ${chunk.join(', ')}`);
  }
  return lines;
}

export type CandidateListItem = Candidate & { invitationCount: number };

export interface BulkUploadResult {
  created: number;
  updated: number;
  errors: { row: number; reason: string }[];
}

export interface CandidateDataExport {
  candidate: { id: string; email: string; name: string; phone: string | null; createdAt: Date };
  invitations: {
    id: string; examTitle: string; status: string; invitedAt: Date; expiresAt: Date; revokedAt: Date | null;
  }[];
  attempts: {
    id: string; examTitle: string; status: string; startedAt: Date; submittedAt: Date | null; deviceFingerprint: string | null;
    result: { score: number; maxScore: number; percentage: number; passFail: string | null } | null;
    answers: { questionText: string; selectedOptions: string[]; isCorrect: boolean | null; marksAwarded: number | null }[];
    proctoringEvents: { eventType: string; severity: string; occurredAt: Date; metadata: Record<string, unknown> | null }[];
    proctoringAnalysis: { status: string; riskLevel: string | null; summary: string | null } | null;
    insight: { status: string; summary: string | null } | null;
    messages: { body: string; sentAt: Date; readAt: Date | null }[];
    // Special-category biometric data. Erase already reaches it, so the subject-access path
    // must too -- a face reference image the subject cannot see in their own export is data
    // held about them that they were never told about.
    faceEnrolment: {
      status: string;
      capturedAt: Date | null;
      consentAt: Date | null;
      referenceImageUrl: string | null;
    } | null;
  }[];
}

@Injectable()
export class CandidatesService {
  private readonly logger = new Logger(CandidatesService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly blobStorage: BlobStorageService,
  ) {}

  async create(context: TenantContext, dto: CreateCandidateDto): Promise<Candidate> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.candidate.findFirst({
        where: { organizationId: context.organizationId as string, email: dto.email },
      });
      if (existing) {
        throw new ConflictException(`A candidate with email ${dto.email} already exists`);
      }
      return tx.candidate.create({
        data: {
          organizationId: context.organizationId as string,
          email: dto.email,
          name: dto.name,
          phone: dto.phone,
        },
      });
    });
  }

  async list(context: TenantContext, filters: CandidateFilters): Promise<PaginatedResponse<CandidateListItem>> {
    const { page, pageSize, skip, take } = resolvePaginationParams(filters.page, filters.pageSize);
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const where = {
        organizationId: context.organizationId as string,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.search ? { OR: [{ name: { contains: filters.search } }, { email: { contains: filters.search } }] } : {}),
      };
      const [candidates, total] = await Promise.all([
        tx.candidate.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take }),
        tx.candidate.count({ where }),
      ]);

      // The UI only offers Delete for candidates with no exam history, so the
      // count travels with the row rather than needing a per-card follow-up call.
      const candidateIds = candidates.map((candidate) => candidate.id);
      const invitationGroups =
        candidateIds.length > 0
          ? await tx.invitation.groupBy({ by: ['candidateId'], where: { candidateId: { in: candidateIds } }, _count: { _all: true } })
          : [];
      const countByCandidate = new Map(invitationGroups.map((group) => [group.candidateId, group._count._all]));

      const data = candidates.map((candidate) => ({
        ...candidate,
        invitationCount: countByCandidate.get(candidate.id) ?? 0,
      }));
      return buildPaginatedResponse(data, total, page, pageSize);
    });
  }

  async update(context: TenantContext, actorUserId: string, candidateId: string, dto: UpdateCandidateDto): Promise<Candidate> {
    const updated = await this.tenantPrisma.forTenant(context, async (tx) => {
      const candidate = await tx.candidate.findFirst({
        where: { id: candidateId, organizationId: context.organizationId as string },
      });
      if (!candidate) {
        throw new NotFoundException(`Candidate ${candidateId} not found`);
      }
      // An erased candidate's name/email are deliberately redacted placeholders;
      // letting them be edited back would undo the erasure.
      if (candidate.erasedAt) {
        throw new ConflictException('An erased candidate cannot be edited');
      }

      if (dto.email && dto.email !== candidate.email) {
        const clash = await tx.candidate.findFirst({
          where: { organizationId: context.organizationId as string, email: dto.email, id: { not: candidateId } },
        });
        if (clash) {
          throw new ConflictException(`A candidate with email ${dto.email} already exists`);
        }
      }

      return tx.candidate.update({
        where: { id: candidateId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
      });
    });

    await this.audit.record(context, {
      actorUserId,
      action: 'candidate.updated',
      entityType: 'candidate',
      entityId: candidateId,
      metadata: { fields: Object.keys(dto) },
    });

    return updated;
  }

  async remove(context: TenantContext, actorUserId: string, candidateId: string): Promise<{ id: string }> {
    await this.tenantPrisma.forTenant(context, async (tx) => {
      const candidate = await tx.candidate.findFirst({
        where: { id: candidateId, organizationId: context.organizationId as string },
      });
      if (!candidate) {
        throw new NotFoundException(`Candidate ${candidateId} not found`);
      }
      // Deleting a candidate who has been invited would orphan their invitations,
      // attempts and results -- deactivating is the supported path for those.
      const invitationCount = await tx.invitation.count({ where: { candidateId } });
      if (invitationCount > 0) {
        throw new ConflictException(
          `Candidate ${candidateId} has ${invitationCount} invitation(s) and cannot be deleted -- mark them inactive instead`,
        );
      }
      await tx.candidate.delete({ where: { id: candidateId } });
    });

    await this.audit.record(context, {
      actorUserId,
      action: 'candidate.deleted',
      entityType: 'candidate',
      entityId: candidateId,
    });

    return { id: candidateId };
  }

  async lookupByEmail(context: TenantContext, email: string): Promise<Candidate> {
    const candidate = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.candidate.findFirst({
        where: { organizationId: context.organizationId as string, email },
      }),
    );
    if (!candidate) {
      throw new NotFoundException(`No candidate found with email ${email}`);
    }
    return candidate;
  }

  async bulkUpload(context: TenantContext, csvContent: string): Promise<BulkUploadResult> {
    const { rows, errors } = parseCandidateCsv(csvContent);

    return this.tenantPrisma.forTenant(context, async (tx) => {
      let created = 0;
      let updated = 0;

      for (const row of rows) {
        const existing = await tx.candidate.findFirst({
          where: { organizationId: context.organizationId as string, email: row.email },
        });
        if (existing) {
          await tx.candidate.update({
            where: { id: existing.id },
            data: { name: row.name, phone: row.phone },
          });
          updated += 1;
        } else {
          await tx.candidate.create({
            data: {
              organizationId: context.organizationId as string,
              email: row.email,
              name: row.name,
              phone: row.phone,
            },
          });
          created += 1;
        }
      }

      return { created, updated, errors };
    });
  }

  async getProfile(context: TenantContext, candidateId: string): Promise<CandidateProfile | null> {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.candidateProfile.findFirst({ where: { candidateId, organizationId: context.organizationId as string } }),
    );
  }

  async getResumeUrl(context: TenantContext, candidateId: string): Promise<{ url: string }> {
    const resumePath = await this.tenantPrisma.forTenant(context, async (tx) => {
      const profile = await tx.candidateProfile.findFirst({
        where: { candidateId, organizationId: context.organizationId as string },
      });
      return profile?.resumePath ?? null;
    });
    if (!resumePath) throw new NotFoundException(`No résumé on file for candidate ${candidateId}`);
    const url = await this.blobStorage.signIfOurs(resumePath);
    return { url: url as string };
  }

  async exportData(context: TenantContext, actorUserId: string, candidateId: string): Promise<CandidateDataExport> {
    const exportPayload = await this.tenantPrisma.forTenant(context, async (tx) => {
      const candidate = await tx.candidate.findFirst({
        where: { id: candidateId, organizationId: context.organizationId as string },
      });
      if (!candidate) {
        throw new NotFoundException(`Candidate ${candidateId} not found`);
      }

      const invitations = await tx.invitation.findMany({
        where: { candidateId },
        orderBy: { invitedAt: 'desc' },
        include: {
          exam: { select: { title: true } },
          attempt: {
            include: {
              result: true,
              answers: { include: { question: { select: { text: true, options: { select: { id: true, text: true } } } } } },
              proctoringEvents: { orderBy: { occurredAt: 'asc' } },
              proctoringAnalysis: true,
              insight: true,
              faceEnrolment: true,
              messages: { orderBy: { sentAt: 'asc' } },
            },
          },
        },
      });

      return {
        candidate: {
          id: candidate.id, email: candidate.email, name: candidate.name, phone: candidate.phone, createdAt: candidate.createdAt,
        },
        invitations: invitations.map((invitation) => ({
          id: invitation.id, examTitle: invitation.exam.title, status: invitation.status,
          invitedAt: invitation.invitedAt, expiresAt: invitation.expiresAt, revokedAt: invitation.revokedAt,
        })),
        attempts: await Promise.all(
          invitations
            .filter((invitation) => invitation.attempt !== null)
            .map(async (invitation) => {
              const attempt = invitation.attempt!;
              return {
                id: attempt.id, examTitle: invitation.exam.title, status: attempt.status,
                startedAt: attempt.startedAt, submittedAt: attempt.submittedAt, deviceFingerprint: attempt.deviceFingerprint,
                result: attempt.result
                  ? { score: attempt.result.score, maxScore: attempt.result.maxScore, percentage: attempt.result.percentage, passFail: attempt.result.passFail }
                  : null,
                answers: attempt.answers.map((answer) => {
                  const selectedIds: string[] = JSON.parse(answer.selectedOptionIdsJson);
                  const optionTextById = new Map(answer.question.options.map((option) => [option.id, option.text]));
                  return {
                    questionText: answer.question.text,
                    selectedOptions: selectedIds.map((optionId) => optionTextById.get(optionId) ?? optionId),
                    isCorrect: answer.isCorrect,
                    marksAwarded: answer.marksAwarded,
                  };
                }),
                // Staff download this GDPR export as a retained JSON artifact -- sign evidence
                // URLs here too, same as the log modal, but the signed link embeds a credential
                // that expires in 15 minutes. It renders if opened promptly; the file itself
                // does not stay viewable.
                proctoringEvents: await Promise.all(
                  attempt.proctoringEvents.map(async (event) => ({
                    eventType: event.eventType, severity: event.severity, occurredAt: event.occurredAt,
                    metadata: event.metadataJson
                      ? ((await signProctoringEvidence(this.blobStorage, JSON.parse(event.metadataJson))) as Record<string, unknown>)
                      : null,
                  })),
                ),
                proctoringAnalysis: attempt.proctoringAnalysis
                  ? { status: attempt.proctoringAnalysis.status, riskLevel: attempt.proctoringAnalysis.riskLevel, summary: attempt.proctoringAnalysis.summary }
                  : null,
                insight: attempt.insight ? { status: attempt.insight.status, summary: attempt.insight.summary } : null,
                messages: attempt.messages.map((message) => ({ body: message.body, sentAt: message.sentAt, readAt: message.readAt })),
                // The face container is private and the stored column is a bare path: sign on
                // read, exactly like the proctoring evidence above, and never persist the signed
                // value. Same 15-minute SAS caveat applies to this retained JSON artifact.
                faceEnrolment: attempt.faceEnrolment
                  ? {
                      status: attempt.faceEnrolment.status,
                      capturedAt: attempt.faceEnrolment.capturedAt,
                      consentAt: attempt.faceEnrolment.consentAt,
                      referenceImageUrl: (await this.blobStorage.signIfOurs(
                        attempt.faceEnrolment.referenceImagePath,
                      )) as string | null,
                    }
                  : null,
              };
            }),
        ),
      };
    });

    await this.audit.record(context, {
      actorUserId,
      action: 'candidate.data_exported',
      entityType: 'candidate',
      entityId: candidateId,
    });

    return exportPayload;
  }

  async erase(context: TenantContext, actorUserId: string, candidateId: string): Promise<{ id: string; erasedAt: Date }> {
    const { erasedAt, didErase, evidenceUrls } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const candidate = await tx.candidate.findFirst({
        where: { id: candidateId, organizationId: context.organizationId as string },
      });
      if (!candidate) {
        throw new NotFoundException(`Candidate ${candidateId} not found`);
      }
      if (candidate.erasedAt) {
        return { erasedAt: candidate.erasedAt, didErase: false, evidenceUrls: [] as string[] };
      }

      const invitations = await tx.invitation.findMany({ where: { candidateId }, select: { id: true } });
      const invitationIds = invitations.map((invitation) => invitation.id);
      const attempts = await tx.attempt.findMany({ where: { invitationId: { in: invitationIds } }, select: { id: true } });
      const attemptIds = attempts.map((attempt) => attempt.id);

      // Collect proctoring evidence blob URLs *before* the updateMany below nulls
      // metadataJson -- once that column is null the references are gone forever.
      const proctoringEvents = await tx.proctoringEvent.findMany({
        where: { attemptId: { in: attemptIds } },
        select: { metadataJson: true },
      });
      const evidenceUrls: string[] = [];
      for (const event of proctoringEvents) {
        if (!event.metadataJson) continue;
        try {
          const metadata = JSON.parse(event.metadataJson) as { snapshot?: string; screenshot?: string };
          if (metadata.snapshot) evidenceUrls.push(metadata.snapshot);
          if (metadata.screenshot) evidenceUrls.push(metadata.screenshot);
        } catch {
          // A corrupt row must not abort a legally required erase.
        }
      }

      // Same "collect the URL before the row goes away" rule as proctoring evidence above --
      // and the reference image feeds the same best-effort delete loop below, so a failed blob
      // delete gets the same batching/timeout/tally treatment instead of a bespoke path.
      const faceEnrolments = await tx.faceEnrolment.findMany({
        where: { attemptId: { in: attemptIds } },
        select: { referenceImagePath: true },
      });
      for (const enrolment of faceEnrolments) {
        if (enrolment.referenceImagePath) evidenceUrls.push(enrolment.referenceImagePath);
      }
      await tx.faceEnrolment.deleteMany({ where: { attemptId: { in: attemptIds } } });

      // Same rule again: read the résumé blob's path before it's out of reach, and feed it into
      // the same best-effort delete loop as the other evidence. The candidate_profiles row's FK
      // cascade never fires here -- erase scrubs the candidate row in place, it doesn't delete
      // it -- so the parsed-résumé PII columns are redacted explicitly below instead.
      const profile = await tx.candidateProfile.findFirst({ where: { candidateId }, select: { resumePath: true } });
      if (profile?.resumePath) evidenceUrls.push(profile.resumePath);

      // Same rule again: read each offer letter's PDF blob path before pdfPath is nulled below,
      // and feed it into the same best-effort delete loop as the other evidence.
      const offers = await tx.offer.findMany({
        where: { candidateId, organizationId: context.organizationId as string },
        select: { pdfPath: true },
      });
      for (const offer of offers) {
        if (offer.pdfPath) evidenceUrls.push(offer.pdfPath);
      }

      const now = new Date();
      await tx.candidate.update({
        where: { id: candidateId },
        data: { name: 'Redacted', email: `erased-${candidateId}@redacted.invalid`, phone: null, erasedAt: now },
      });
      await tx.attempt.updateMany({ where: { id: { in: attemptIds } }, data: { deviceFingerprint: null } });
      await tx.candidateMessage.updateMany({ where: { attemptId: { in: attemptIds } }, data: { body: '[redacted]' } });
      await tx.proctoringEvent.updateMany({ where: { attemptId: { in: attemptIds } }, data: { metadataJson: null } });
      await tx.proctoringAnalysis.updateMany({
        where: { attemptId: { in: attemptIds }, summary: { not: null } },
        data: { summary: '[redacted]' },
      });
      await tx.attemptInsight.updateMany({
        where: { attemptId: { in: attemptIds }, summary: { not: null } },
        data: { summary: '[redacted]' },
      });
      // Redact the parsed-résumé PII columns in place -- candidateId's FK cascade only fires on
      // a genuine candidate row DELETE, and erase never deletes the candidate row (it scrubs it),
      // so without this the summary/skills/title/years survive an erasure request indefinitely.
      await tx.candidateProfile.updateMany({
        where: { candidateId },
        data: {
          resumePath: null,
          parsedSummary: null,
          parsedSkills: null,
          parsedTitle: null,
          parsedYearsExperience: null,
          parseStatus: 'unavailable',
        },
      });
      await tx.candidateEmail.updateMany({
        where: { candidateId, organizationId: context.organizationId as string },
        data: { toEmail: 'erased@redacted.invalid', subject: 'Redacted', renderedBody: 'Redacted', errorDetail: null },
      });
      await tx.offer.updateMany({
        where: { candidateId, organizationId: context.organizationId as string },
        data: { compensation: 'Redacted', letterSubject: 'Redacted', letterBody: 'Redacted', pdfPath: null },
      });
      // Interviews have no blobs of their own (location/notes are plain text, not blob paths),
      // so this is a straight redact-in-place with no evidenceUrls to collect first.
      await tx.interview.updateMany({
        where: { candidateId, organizationId: context.organizationId as string },
        data: { interviewToken: null, location: 'Redacted', recruiterNote: null, candidateReschedNote: null },
      });
      await tx.candidateRefreshToken.deleteMany({ where: { invitationId: { in: invitationIds } } });
      await tx.invitation.updateMany({
        where: { id: { in: invitationIds }, status: 'invited' },
        data: { status: 'revoked', revokedAt: now },
      });

      return { erasedAt: now, didErase: true, evidenceUrls };
    });

    if (didErase) {
      // The audit record is written as soon as the transaction has committed, *before* the
      // best-effort blob cleanup below -- a process kill or timeout during the delete loop
      // must not leave a legally-erased candidate with no audit trail of that erasure.
      await this.audit.record(context, {
        actorUserId,
        action: 'candidate.erased',
        entityType: 'candidate',
        entityId: candidateId,
      });

      // Deleting the blobs is outside the transaction on purpose: a failed remote delete
      // must not roll back the erase -- the database redaction is the part that's legally
      // required, the blob cleanup is best-effort on top of it.
      const uniqueUrls = Array.from(new Set(evidenceUrls));
      if (uniqueUrls.length > 0) {
        // Tally outcomes so a partial or total no-op is visible instead of looking identical to
        // a clean full delete. The one-line summary below stays counts-only; failed and
        // unattempted blobs additionally get their container-relative *path* logged (via
        // blobPathForLogging, never the full URL/host/query) since after this call returns
        // metadataJson is already null and the log line is the only remaining way to find them.
        const tally: Record<BlobDeleteOutcome, number> = {
          deleted: 0, 'not-found': 0, 'skipped-not-ours': 0, 'skipped-empty-name': 0, 'skipped-not-configured': 0,
        };
        let attempted = 0;
        // Never the URL (host/query) -- but the path plus why it failed is exactly the
        // information an operator needs to find and retry it later, and after this call
        // returns it's the *only* place that information still exists (metadataJson is
        // already null).
        const failedBlobs: { path: string; error: string }[] = [];
        const deadline = Date.now() + EVIDENCE_DELETE_BUDGET_MS;

        // Admit a batch only if it can *finish* inside the budget in the worst case (every
        // delete in it hitting the full per-call timeout) -- checking the clock only at entry
        // (`Date.now() < deadline`) would let one more full timeout run past the budget.
        for (
          let i = 0;
          i < uniqueUrls.length && Date.now() + EVIDENCE_DELETE_TIMEOUT_MS <= deadline;
          i += EVIDENCE_DELETE_CONCURRENCY
        ) {
          const batch = uniqueUrls.slice(i, i + EVIDENCE_DELETE_CONCURRENCY);
          attempted += batch.length;
          const results = await Promise.allSettled(
            batch.map((url) => withTimeout(this.blobStorage.deleteByUrl(url), EVIDENCE_DELETE_TIMEOUT_MS)),
          );
          results.forEach((result, index) => {
            if (result.status === 'rejected') {
              const reason = result.reason as Error | undefined;
              failedBlobs.push({ path: blobPathForLogging(batch[index]), error: reason?.message ?? String(reason) });
            } else {
              tally[result.value] += 1;
            }
          });
        }

        const failed = failedBlobs.length;
        const unattemptedUrls = uniqueUrls.slice(attempted);
        const unattempted = unattemptedUrls.length;
        const clean = unattempted === 0 && failed === 0 && tally.deleted === uniqueUrls.length;
        const summary =
          `Proctoring evidence blob deletion for candidate ${candidateId}: ${uniqueUrls.length} total, ` +
          `${tally.deleted} deleted, ${tally['not-found']} not found, ${failed} failed, ` +
          `${tally['skipped-not-ours']} skipped (not ours), ${tally['skipped-empty-name']} skipped (empty name), ` +
          `${tally['skipped-not-configured']} skipped (not configured), ${unattempted} unattempted` +
          (unattempted > 0 ? ' (delete budget exhausted)' : '');

        if (clean) {
          this.logger.log(summary);
        } else {
          this.logger.warn(summary);
          // Paths (never full URLs) plus, for failures, the error -- so the summary's "this
          // wasn't fully deleted" is paired with enough to actually go find the blob, instead of
          // just proving it's lost. Chunked so a candidate with hundreds of blobs doesn't produce
          // one oversized line that a log pipeline truncates, silently dropping the tail.
          if (failedBlobs.length > 0) {
            for (const line of chunkedLogLines('failed', failedBlobs.map((entry) => `${entry.path} (${entry.error})`))) {
              this.logger.warn(`Proctoring evidence blob deletion detail for candidate ${candidateId}: ${line}`);
            }
          }
          if (unattemptedUrls.length > 0) {
            for (const line of chunkedLogLines('unattempted', unattemptedUrls.map(blobPathForLogging))) {
              this.logger.warn(`Proctoring evidence blob deletion detail for candidate ${candidateId}: ${line}`);
            }
          }
        }

        // A companion audit entry (AuditService.record is create-only, so this can't be folded
        // into the 'candidate.erased' entry above without moving that call after the delete loop
        // and losing its crash-safety guarantee) -- this is the durable record of what actually
        // happened to the evidence, since application logs typically retain far less time than
        // the audit table. This whole delete phase is deliberately non-throwing (a failed remote
        // delete must not fail the erase), so this write gets the same treatment: a transient DB
        // failure on the *tally* must not turn an already-successful, already-redacted,
        // already-audited erase into a 500 the caller can never retry successfully (a retry just
        // finds `erasedAt` set and no-ops).
        try {
          await this.audit.record(context, {
            actorUserId,
            action: 'candidate.erased.evidence_deleted',
            entityType: 'candidate',
            entityId: candidateId,
            metadata: {
              total: uniqueUrls.length,
              deleted: tally.deleted,
              notFound: tally['not-found'],
              failed,
              skippedNotOurs: tally['skipped-not-ours'],
              skippedEmptyName: tally['skipped-empty-name'],
              skippedNotConfigured: tally['skipped-not-configured'],
              unattempted,
            },
          });
        } catch (error) {
          this.logger.warn(`Failed to write the evidence-deletion audit entry for candidate ${candidateId}`, error as Error);
        }
      }
    }

    return { id: candidateId, erasedAt };
  }
}
