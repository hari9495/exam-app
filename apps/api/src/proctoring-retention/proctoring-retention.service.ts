import { Injectable, Logger } from '@nestjs/common';
import { AuditService, BlobStorageService, TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { buildCandidateEmailHtml } from '../candidate-emails/candidate-email-render';
import { notOnHold, RETENTION_MIN_DAYS, pastRetention, retentionByCompany, retentionCutoff } from '../assessments/asmt-rules';

// Webcam snapshots + screen captures are proctoring evidence; once the review window has passed they
// are candidate imagery with no remaining purpose. AS-2 (answer 2008): the window is each company's
// Settings 6.5 retention (asmt.retention, 30 to 365 days, default 30; it was a fixed 90), and evidence
// of an attempt whose result is held (an open incident or appeal) is kept until the result is released.
// Bound each metadata-rewrite tx so a big sweep never holds one long interactive transaction.
const WRITE_CHUNK = 50;

// Deletes webcam/screen proctoring images (and strips their URLs from metadataJson, keeping any other
// event metadata) once past the company's retention. Scheduled as a nightly BullMQ job scheduler by
// ScheduledSweepsModule.
@Injectable()
export class ProctoringRetentionService {
  private readonly logger = new Logger(ProctoringRetentionService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly blobStorage: BlobStorageService,
    private readonly email: EmailService,
  ) {}

  /**
   * AS-5 part 3 (PRC-28): carry out the candidates' erasure requests: their camera frames and screen captures (the
   * images, and their links on the events) and their face data (enrolment rows and reference images). A request whose
   * evidence is held (an undecided incident, an open appeal or its open window) waits for the next night. Scores and
   * answers stay. The candidate is emailed (unless they opted out of email).
   */
  async eraseRequested(now: Date = new Date()): Promise<number> {
    const superAdmin = { organizationId: null, isSuperAdmin: true };
    let done = 0;
    try {
      const waiting = await this.tenantPrisma.forTenant(superAdmin, (tx) => tx.asmtErasureRequest.findMany({ where: { status: 'waiting' }, orderBy: { requestedAt: 'asc' }, take: 200 }));
      for (const r of waiting) {
        const ctx = { organizationId: r.organizationId, isSuperAdmin: false };
        const work = await this.tenantPrisma.forTenant(ctx, async (tx) => {
          const attempts = await tx.attempt.findMany({ where: { invitation: { candidateId: r.candidateId } }, select: { id: true } });
          const ids = attempts.map((a) => a.id);
          const held = ids.length
            ? await tx.integrityIncident.count({ where: { attemptId: { in: ids }, OR: [{ status: { not: 'decided' } }, { appeal: { is: { status: 'open' } } }, { appeal: { is: null }, appealClosesAt: { gt: now } }] } })
            : 0;
          if (held) return null;
          const events = await tx.proctoringEvent.findMany({ where: { attemptId: { in: ids }, OR: [{ metadataJson: { contains: '"snapshot"' } }, { metadataJson: { contains: '"screenshot"' } }] }, select: { id: true, metadataJson: true } });
          const urls: string[] = [];
          for (const e of events) {
            let meta: Record<string, unknown>;
            try {
              meta = JSON.parse(e.metadataJson ?? '{}') as Record<string, unknown>;
            } catch {
              continue;
            }
            if (typeof meta.snapshot === 'string' && meta.snapshot) urls.push(meta.snapshot);
            if (typeof meta.screenshot === 'string' && meta.screenshot) urls.push(meta.screenshot);
            delete meta.snapshot;
            delete meta.screenshot;
            await tx.proctoringEvent.update({ where: { id: e.id }, data: { metadataJson: Object.keys(meta).length ? JSON.stringify(meta) : null } });
          }
          const faces = await tx.faceEnrolment.findMany({ where: { attemptId: { in: ids } }, select: { referenceImagePath: true } });
          faces.forEach((f) => f.referenceImagePath && urls.push(f.referenceImagePath));
          await tx.faceEnrolment.deleteMany({ where: { attemptId: { in: ids } } });
          await tx.asmtErasureRequest.update({ where: { id: r.id }, data: { status: 'done', doneAt: now } });
          await AuditService.recordIn(tx, ctx, { actorUserId: null, action: 'candidate.erasure_done', entityType: 'candidate', entityId: r.candidateId, metadata: { frames: events.length, faceRecords: faces.length } });
          const c = await tx.candidate.findUnique({ where: { id: r.candidateId }, select: { name: true, email: true, emailOptedOutAt: true } });
          const org = await tx.organization.findUnique({ where: { id: r.organizationId }, select: { name: true } });
          return { urls, c, org: org?.name ?? null };
        });
        if (!work) continue;
        done++;
        // The links are gone from the database already; a blob that fails to delete is logged, never left linked.
        for (const url of work.urls) {
          try {
            await this.blobStorage.deleteByUrl(url);
          } catch (error) {
            this.logger.warn(`Failed to delete an erased blob for request ${r.id}: ${(error as Error).message}`);
          }
        }
        if (work.c?.email && !work.c.emailOptedOutAt) {
          const html = buildCandidateEmailHtml({ logoUrl: null, orgName: work.org, bodyText: [`Hi ${work.c.name},`, '', 'As you asked, we erased the camera frames, screen captures and face data from your tests.', '', 'Your answers and scores stay with your application.'].join('\n') });
          const res = await this.email.send({ to: work.c.email, subject: 'Your recordings and face data were erased', html, organizationId: r.organizationId });
          if (!res.success) this.logger.warn(`Erasure email for request ${r.id} failed`);
        }
      }
      return done;
    } catch (error) {
      this.logger.warn(`Erasure requests sweep failed: ${error instanceof Error ? error.message : String(error)}`);
      return done;
    }
  }

  async prune(now: Date = new Date()): Promise<number> {
    const superAdmin = { organizationId: null, isSuperAdmin: true };

    try {
      // A platform-wide housekeeping sweep in the super-admin context. Only rows past the shortest retention can be
      // due; each is then checked against its own company's days. Narrow to image-bearing rows, never a held result.
      const [days, candidates] = await this.tenantPrisma.forTenant(superAdmin, async (tx) => [
        await retentionByCompany(tx),
        await tx.proctoringEvent.findMany({
          where: {
            occurredAt: { lt: retentionCutoff(now, RETENTION_MIN_DAYS) },
            OR: [{ metadataJson: { contains: '"snapshot"' } }, { metadataJson: { contains: '"screenshot"' } }],
            AND: [notOnHold(now)],
          },
          select: { id: true, metadataJson: true, occurredAt: true, organizationId: true },
        }),
      ] as const);
      const rows = candidates.filter((r) => pastRetention(r.occurredAt, r.organizationId, days, now));
      if (rows.length === 0) return 0;

      const urls: string[] = [];
      const updates: { id: string; metadataJson: string | null }[] = [];
      for (const row of rows) {
        if (!row.metadataJson) continue;
        let meta: Record<string, unknown>;
        try {
          meta = JSON.parse(row.metadataJson) as Record<string, unknown>;
        } catch {
          continue; // unparseable metadata: leave it alone rather than guess
        }
        if (typeof meta.snapshot === 'string') urls.push(meta.snapshot);
        if (typeof meta.screenshot === 'string') urls.push(meta.screenshot);
        delete meta.snapshot;
        delete meta.screenshot;
        // Keep any other event metadata (e.g. an AI-analysis reason); null only when nothing is left.
        updates.push({ id: row.id, metadataJson: Object.keys(meta).length ? JSON.stringify(meta) : null });
      }

      // Delete blobs best-effort: one failure must not strand the DB rewrite (the URL is cleared
      // either way, and an orphaned blob is a smaller problem than retained candidate imagery).
      for (const url of urls) {
        try {
          await this.blobStorage.deleteByUrl(url);
        } catch (error) {
          this.logger.warn(`Failed to delete proctoring blob ${url}: ${(error as Error).message}`);
        }
      }

      for (let i = 0; i < updates.length; i += WRITE_CHUNK) {
        const batch = updates.slice(i, i + WRITE_CHUNK);
        await this.tenantPrisma.forTenant(superAdmin, (tx) =>
          Promise.all(batch.map((u) => tx.proctoringEvent.update({ where: { id: u.id }, data: { metadataJson: u.metadataJson } }))),
        );
      }

      this.logger.log(`Purged proctoring imagery from ${updates.length} event(s) past their company's retention (${urls.length} blob(s))`);
      return updates.length;
    } catch (error) {
      // Retention is housekeeping -- never crash the app or spam on a DB blip.
      this.logger.warn(`Proctoring retention prune failed: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }
}
