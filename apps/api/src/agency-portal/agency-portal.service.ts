import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService, BlobStorageService } from '@exam-platform/shared';
import { validatePdfUpload } from '../public-applications/pdf-validation';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { toPaise, toRupees } from '../staffing/staffing-rules';

@Injectable()
export class AgencyPortalService {
  // agencies/agency_jobs/agency_submissions are RLS-protected and there is no org context until
  // the portal token resolves one. Same LOOKUP_ORG/isSuperAdmin bypass as
  // PublicApplicationsService/InterviewsService/OffersService -- this placeholder org is never
  // used for filtering (isSuperAdmin skips the RLS predicate) and never written anywhere.
  private readonly LOOKUP_ORG = '00000000-0000-0000-0000-000000000000';

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly blobStorage: BlobStorageService,
  ) {}

  // Same message regardless of "no such token" vs "deactivated" -- an outsider must not be able
  // to distinguish an unknown portal token from one belonging to a deactivated agency.
  private async resolveAgency(tx: any, token: string): Promise<{ id: string; organizationId: string; name: string }> {
    const agency = await tx.agency.findFirst({ where: { portalToken: token, active: true } });
    if (!agency) throw new NotFoundException('Portal not available');
    return agency;
  }

  async getPortal(token: string) {
    const { agencyName, jobs, submissions } = await this.tenantPrisma.forTenant(
      { organizationId: this.LOOKUP_ORG, isSuperAdmin: true },
      async (tx) => {
        const agency = await this.resolveAgency(tx, token);
        // HIR-21: an expired share is gone; the rate cap shows; a hidden client never does (vendors never see bill rates).
        const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
        const agencyJobs = await tx.agencyJob.findMany({
          where: { agencyId: agency.id, job: { status: 'open' }, OR: [{ expiresOn: null }, { expiresOn: { gte: new Date(`${today}T00:00:00Z`) } }] },
          select: { rateCapPaise: true, maxSubmissions: true, expiresOn: true, maskClient: true, job: { select: { id: true, title: true, location: true, department: true, staffingClientId: true } } },
        });
        const clientIds = agencyJobs.map((aj: any) => aj.job.staffingClientId).filter(Boolean);
        const clients = new Map<string, string>((await tx.staffingClient.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } })).map((c: any) => [c.id, c.name]));
        const submissionRows = await tx.agencySubmission.findMany({
          where: { agencyId: agency.id },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            jobId: true,
            status: true,
            candidateName: true,
            createdAt: true,
            duplicateOfAgencyId: true,
            ownerUntil: true,
            job: { select: { title: true } },
          },
        });
        return {
          agencyName: agency.name,
          jobs: agencyJobs.map((aj: any) => ({
            id: aj.job.id,
            title: aj.job.title,
            location: aj.job.location,
            department: aj.job.department,
            client: aj.job.staffingClientId ? (aj.maskClient ? null : (clients.get(aj.job.staffingClientId) ?? null)) : null,
            rateCap: aj.rateCapPaise != null ? toRupees(aj.rateCapPaise) : null,
            maxSubmissions: aj.maxSubmissions,
            expiresOn: aj.expiresOn ? aj.expiresOn.toISOString().slice(0, 10) : null,
          })),
          // Flatten job.title -- the public page reads s.jobTitle (matches the authed
          // /agency-submissions endpoint's flat shape), not a nested job object.
          submissions: submissionRows.map((s: any) => ({
            id: s.id,
            jobId: s.jobId,
            jobTitle: s.job.title,
            candidateName: s.candidateName,
            // A duplicate reads as not accepted; who holds the candidate is never shown to a vendor.
            status: s.duplicateOfAgencyId || s.ownerUntil ? 'duplicate' : s.status,
            createdAt: s.createdAt,
          })),
        };
      },
    );
    return { agencyName, jobs, submissions };
  }

  async submit(token: string, dto: CreateSubmissionDto): Promise<{ id: string }> {
    // Validate the résumé FIRST -- reject an oversized/non-PDF payload before touching the DB.
    const buf = Buffer.from(dto.resumeBase64, 'base64');
    const validated = validatePdfUpload(buf);
    if (!validated.ok) {
      throw new BadRequestException(validated.reason === 'too_large' ? 'Résumé exceeds 5 MB' : 'Résumé must be a PDF');
    }

    // Resolve the agency and assert jobId is in ITS allowlist AND still open. A job that exists
    // but isn't assigned to this agency (or has since closed) is indistinguishable from a
    // nonexistent job -- same generic BadRequestException either way (anti-oracle).
    const agency = await this.tenantPrisma.forTenant(
      { organizationId: this.LOOKUP_ORG, isSuperAdmin: true },
      (tx) => this.resolveAgency(tx, token),
    );
    const allowed = await this.tenantPrisma.forTenant(
      { organizationId: this.LOOKUP_ORG, isSuperAdmin: true },
      (tx) => tx.agencyJob.findFirst({ where: { agencyId: agency.id, jobId: dto.jobId, job: { status: 'open' } } }),
    );
    const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    if (!allowed || (allowed.expiresOn && allowed.expiresOn.toISOString().slice(0, 10) < today)) throw new BadRequestException('This role is not accepting agency submissions');
    // HIR-21: a capped share needs a quote, right to represent and consent; the vendor's limit per job holds.
    const quoted = dto.quotedRate ? toPaise(dto.quotedRate) : null;
    if (allowed.rateCapPaise != null) {
      if (quoted == null || quoted <= 0n) throw new BadRequestException('Enter your rate for this candidate.');
      if (!dto.rightToRepresent || !dto.consent) throw new BadRequestException('Confirm you have the right to represent this candidate and their consent.');
    }
    if (allowed.maxSubmissions != null) {
      const used = await this.tenantPrisma.forTenant({ organizationId: this.LOOKUP_ORG, isSuperAdmin: true }, (tx) => tx.agencySubmission.count({ where: { agencyId: agency.id, jobId: dto.jobId } }));
      if (used >= allowed.maxSubmissions) throw new BadRequestException(`You have sent the most submissions allowed for this role (${allowed.maxSubmissions}).`);
    }

    // Uploaded OUTSIDE the tenant tx (ADO #6810): blob I/O inside a tx holds the transaction open
    // for the duration of a network call to storage.
    const resumePath = await this.blobStorage.upload(
      `candidates/${agency.organizationId}/${randomUUID()}.pdf`,
      buf,
      'application/pdf',
    );

    const { id } = await this.tenantPrisma.forTenant(
      { organizationId: agency.organizationId, isSuperAdmin: true },
      async (tx) => {
        const isDuplicate = Boolean(
          await tx.candidate.findUnique({
            where: { organizationId_email: { organizationId: agency.organizationId, email: dto.email } },
          }),
        );
        // HIR-21 ownership: the first submitter holds the candidate for this job for the company's window (setting
        // staffing.vendor.ownership_days); a later vendor's submission, or one for someone already in the job's own
        // pipeline, is a duplicate (the holder is never told to the vendor).
        const windowRow = await tx.setting.findFirst({ where: { organizationId: agency.organizationId, key: 'staffing.vendor.ownership_days', scopeType: 'tenant' }, select: { value: true } });
        const windowDays = Number(windowRow?.value ?? 90);
        const since = new Date(Date.now() - windowDays * 86_400_000);
        const prior = await tx.agencySubmission.findFirst({ where: { organizationId: agency.organizationId, jobId: dto.jobId, candidateEmail: { equals: dto.email, mode: 'insensitive' }, createdAt: { gte: since } }, orderBy: { createdAt: 'asc' } });
        if (prior && prior.agencyId === agency.id) throw new BadRequestException('You have already submitted this candidate for this role.');
        const inPipeline = !prior && (await tx.pipelineEntry.findFirst({ where: { organizationId: agency.organizationId, jobId: dto.jobId, createdAt: { gte: since }, candidate: { email: { equals: dto.email, mode: 'insensitive' } } }, select: { createdAt: true } }));
        const ownedFrom = prior?.createdAt ?? (inPipeline ? inPipeline.createdAt : null);
        const ownerUntil = ownedFrom ? new Date(new Date(ownedFrom.getTime() + windowDays * 86_400_000).toISOString().slice(0, 10) + 'T00:00:00Z') : null;
        // No candidate/pipeline row is written here -- a submission is only turned into a
        // candidate/pipeline entry later, when a recruiter reviews and accepts it.
        const submission = await tx.agencySubmission.create({
          data: {
            organizationId: agency.organizationId,
            agencyId: agency.id,
            jobId: dto.jobId,
            candidateName: dto.name,
            candidateEmail: dto.email,
            candidatePhone: dto.phone ?? null,
            resumePath,
            isDuplicate,
            quotedRatePaise: quoted,
            rightToRepresent: dto.rightToRepresent ?? false,
            consent: dto.consent ?? false,
            duplicateOfAgencyId: prior ? prior.agencyId : null,
            ownerUntil,
          },
        });
        return { id: submission.id, isDuplicate };
      },
    );

    return { id };
  }
}
