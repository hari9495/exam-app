import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, TenantPrismaService, BlobStorageService } from '@exam-platform/shared';
import { JobsService } from '../jobs/jobs.service';
import { IntegrationEventsService } from '../integrations/integration-events.service';
import { expandedName } from '../walk-in/walk-in.service';
import { applicationStatusBucket } from './application-status';
import { validatePdfUpload } from './pdf-validation';
import { ApplyDto } from './dto/apply.dto';

// Job-feed fields are wrapped in CDATA (the aggregator-standard for free-text). The only way to
// break out of CDATA is the literal "]]>", so split it so it can never terminate the section early.
function xmlCdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

@Injectable()
export class PublicApplicationsService {
  // jobs is RLS-protected and there is no org context until the applyToken resolves one. The
  // super-admin flag on forTenant bypasses the RLS predicate entirely, so this placeholder org
  // is never used for filtering and never written anywhere -- it just satisfies the context shape.
  private readonly LOOKUP_ORG = '00000000-0000-0000-0000-000000000000';

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly blobStorage: BlobStorageService,
    private readonly jobsService: JobsService,
    private readonly integrationEvents: IntegrationEventsService,
  ) {}

  private async resolveJob(applyToken: string) {
    const job = await this.tenantPrisma.forTenant(
      { organizationId: this.LOOKUP_ORG, isSuperAdmin: true },
      (tx) =>
        tx.job.findUnique({
          where: { applyToken },
          select: {
            id: true,
            organizationId: true,
            createdById: true,
            status: true,
            publicApplyEnabled: true,
            title: true,
            description: true,
            location: true,
            employmentType: true,
            createdAt: true,
          },
        }),
    );
    // Generic message regardless of which condition failed -- distinguishing "no such token" from
    // "closed" from "public apply disabled" would give an outsider an oracle to probe job state.
    if (!job || job.status !== 'open' || !job.publicApplyEnabled) {
      throw new NotFoundException('This role is not accepting applications');
    }
    return job;
  }

  async getPublicJob(applyToken: string) {
    const job = await this.resolveJob(applyToken);
    const org = await this.prisma.organization.findUnique({
      where: { id: job.organizationId },
      select: { name: true, logoPath: true },
    });
    return {
      jobTitle: job.title,
      jobDescription: job.description,
      location: job.location,
      employmentType: job.employmentType,
      postedAt: job.createdAt.toISOString(),
      orgName: org?.name ?? '',
      // Container is private -- unsigned logoPath 403s in <img src>. signIfOurs mints a
      // read-only SAS for blobs we own and passes anything else through untouched.
      orgLogo: org?.logoPath ? ((await this.blobStorage.signIfOurs(org.logoPath)) as string | null) : null,
    };
  }

  // Public jobs feed for aggregators (Indeed-style XML). Every entry is an already-public
  // (open + publicApplyEnabled) role linking to its own apply page. Global across tenants: these
  // roles are already individually public, and aggregators filter by company.
  // ponytail: global feed; if a per-org careers feed is ever needed, key it on a public org slug.
  async getJobsFeed(): Promise<string> {
    const baseUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const jobs = await this.tenantPrisma.forTenant(
      { organizationId: this.LOOKUP_ORG, isSuperAdmin: true },
      (tx) =>
        tx.job.findMany({
          where: { status: 'open', publicApplyEnabled: true, applyToken: { not: null } },
          select: {
            title: true, description: true, location: true, employmentType: true,
            createdAt: true, applyToken: true, organizationId: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
    );
    // Job has no organization relation navigation; resolve names in one batched query.
    const orgs = await this.prisma.organization.findMany({
      where: { id: { in: [...new Set(jobs.map((j) => j.organizationId))] } },
      select: { id: true, name: true },
    });
    const orgName = new Map(orgs.map((o) => [o.id, o.name]));
    const entries = jobs
      .map((j) =>
        [
          '  <job>',
          `    <title>${xmlCdata(j.title)}</title>`,
          `    <date>${j.createdAt.toUTCString()}</date>`,
          `    <referencenumber>${xmlCdata(j.applyToken as string)}</referencenumber>`,
          `    <url>${xmlCdata(`${baseUrl}/apply/${j.applyToken}`)}</url>`,
          `    <company>${xmlCdata(orgName.get(j.organizationId) ?? '')}</company>`,
          `    <city>${xmlCdata(j.location ?? '')}</city>`,
          `    <jobtype>${xmlCdata(j.employmentType ?? '')}</jobtype>`,
          `    <description>${xmlCdata(j.description ?? '')}</description>`,
          '  </job>',
        ].join('\n'),
      )
      .join('\n');
    return `<?xml version="1.0" encoding="utf-8"?>\n<source>\n  <publisher>Prudent Hire</publisher>\n${entries}\n</source>\n`;
  }

  async apply(applyToken: string, dto: ApplyDto): Promise<{ statusToken: string; portalToken: string }> {
    const job = await this.resolveJob(applyToken);

    const buf = Buffer.from(dto.resumeBase64, 'base64');
    const validated = validatePdfUpload(buf);
    if (!validated.ok) {
      throw new BadRequestException(validated.reason === 'too_large' ? 'Résumé exceeds 5 MB' : 'Résumé must be a PDF');
    }

    // Uploaded OUTSIDE the tenant tx (ADO #6810): blob I/O inside a tx holds the transaction open
    // for the duration of a network call to storage, which is the known mistake to avoid here.
    const resumePath = await this.blobStorage.upload(
      `candidates/${job.organizationId}/${randomUUID()}.pdf`,
      buf,
      'application/pdf',
    );

    const context = { organizationId: job.organizationId, isSuperAdmin: true };
    const { entry, candidateId, isNewCandidate, portalToken } = await this.tenantPrisma.forTenant(context, async (tx) => {
      // Public, unauthenticated endpoint: an existing candidate match must NOT be overwritten
      // with request-body name/phone -- anyone who knows a candidate's email could tamper with
      // their stored details. Same rule as WalkInService.register; expandedName carries the one
      // narrow exception (expanding a placeholder single-word stored name).
      const existingCandidate = await tx.candidate.findUnique({
        where: { organizationId_email: { organizationId: job.organizationId, email: dto.email } },
      });
      const isNewCandidate = !existingCandidate;
      const nameUpdate = existingCandidate ? expandedName(existingCandidate.name, dto.name) : null;
      const candidate = await tx.candidate.upsert({
        where: { organizationId_email: { organizationId: job.organizationId, email: dto.email } },
        create: { organizationId: job.organizationId, email: dto.email, name: dto.name, phone: dto.phone ?? null, portalToken: randomUUID() },
        update: nameUpdate ? { name: nameUpdate } : {},
      });
      // Existing candidates (pre-portal, or added via other paths) may lack a token; mint one so
      // every applicant gets a portal link.
      let portalToken = candidate.portalToken;
      if (!portalToken) {
        portalToken = randomUUID();
        await tx.candidate.update({ where: { id: candidate.id }, data: { portalToken } });
      }
      await tx.candidateProfile.upsert({
        where: { candidateId: candidate.id },
        create: { organizationId: job.organizationId, candidateId: candidate.id, resumePath, parseStatus: 'pending' },
        // Re-apply resets the parsed fields + status so the newly-uploaded résumé gets re-parsed
        // instead of showing stale data from the previous submission.
        update: {
          resumePath,
          parseStatus: 'pending',
          parsedSummary: null,
          parsedSkills: null,
          parsedTitle: null,
          parsedYearsExperience: null,
          parsedAt: null,
        },
      });
      const entry = await tx.pipelineEntry.upsert({
        where: { jobId_candidateId: { jobId: job.id, candidateId: candidate.id } },
        create: {
          organizationId: job.organizationId,
          jobId: job.id,
          candidateId: candidate.id,
          stage: 'applied',
          enteredVia: 'application',
          applicationToken: randomUUID(),
        },
        // Stamp-if-absent: a re-apply keeps the existing entry (and its token) untouched, even
        // though the profile above IS refreshed with the newly-uploaded résumé.
        update: {},
      });
      return { entry, candidateId: candidate.id, isNewCandidate, portalToken };
    });

    await this.jobsService.enqueue(context, 'resume_parse', JSON.stringify({ candidateId }), job.createdById);

    if (isNewCandidate) {
      await this.integrationEvents.emit(job.organizationId, 'candidate.applied', {
        subject: dto.name,
        source: 'public',
        linkPath: `/candidates/${candidateId}`,
      });
    }

    return { statusToken: entry.applicationToken!, portalToken };
  }

  // The unified candidate portal: resolve the candidate by their magic-link token and aggregate
  // ALL their applications at the org (each with its interviews + offers), so they see everything
  // in one place. Read-only aggregation; actions happen on the existing per-artifact token pages.
  async getPortal(portalToken: string) {
    const candidate = await this.tenantPrisma.forTenant(
      { organizationId: this.LOOKUP_ORG, isSuperAdmin: true },
      (tx) => tx.candidate.findUnique({ where: { portalToken }, select: { id: true, organizationId: true, name: true, email: true, erasedAt: true } }),
    );
    if (!candidate || candidate.erasedAt) throw new NotFoundException('Portal not found');
    const org = await this.prisma.organization.findUnique({ where: { id: candidate.organizationId }, select: { name: true } });
    const entries = await this.tenantPrisma.forTenant(
      { organizationId: candidate.organizationId, isSuperAdmin: true },
      (tx) =>
        tx.pipelineEntry.findMany({
          where: { candidateId: candidate.id },
          orderBy: { createdAt: 'desc' },
          select: {
            applicationToken: true,
            stage: true,
            rejected: true,
            createdAt: true,
            job: { select: { title: true } },
            interviews: {
              select: { interviewToken: true, status: true, location: true, timeZone: true, confirmedSlotId: true, slots: { select: { startsAt: true, endsAt: true } } },
            },
            offers: { select: { offerToken: true, status: true, compensation: true, startDate: true, expiresAt: true } },
          },
        }),
    );
    return {
      candidateName: candidate.name,
      candidateEmail: candidate.email,
      orgName: org?.name ?? '',
      applications: entries.map((e) => ({
        jobTitle: e.job.title,
        stage: e.stage,
        rejected: e.rejected,
        appliedAt: e.createdAt.toISOString(),
        statusToken: e.applicationToken,
        interviews: e.interviews.map((i) => ({
          token: i.interviewToken,
          status: i.status,
          location: i.location,
          timeZone: i.timeZone,
          confirmed: Boolean(i.confirmedSlotId),
          slots: i.slots.map((s) => ({ startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString() })),
        })),
        offers: e.offers
          .filter((o) => o.offerToken)
          .map((o) => ({ token: o.offerToken, status: o.status, compensation: o.compensation, startDate: o.startDate.toISOString(), expiresAt: o.expiresAt.toISOString() })),
      })),
    };
  }

  async getApplicationStatus(statusToken: string) {
    const row = await this.tenantPrisma.forTenant(
      { organizationId: this.LOOKUP_ORG, isSuperAdmin: true },
      (tx) =>
        tx.pipelineEntry.findUnique({
          where: { applicationToken: statusToken },
          select: { stage: true, rejected: true, createdAt: true, job: { select: { title: true } } },
        }),
    );
    if (!row) throw new NotFoundException('Application not found');
    return {
      jobTitle: row.job.title,
      appliedAt: row.createdAt,
      statusBucket: applicationStatusBucket(row.stage, row.rejected),
    };
  }
}
