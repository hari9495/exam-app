import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService, BlobStorageService } from '@exam-platform/shared';
import { validatePdfUpload } from '../public-applications/pdf-validation';
import { CreateSubmissionDto } from './dto/create-submission.dto';

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
        const agencyJobs = await tx.agencyJob.findMany({
          where: { agencyId: agency.id, job: { status: 'open' } },
          select: { job: { select: { id: true, title: true, location: true, department: true } } },
        });
        const submissionRows = await tx.agencySubmission.findMany({
          where: { agencyId: agency.id },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            jobId: true,
            status: true,
            isDuplicate: true,
            candidateName: true,
            createdAt: true,
            job: { select: { title: true } },
          },
        });
        return {
          agencyName: agency.name,
          jobs: agencyJobs.map((aj: any) => aj.job),
          submissions: submissionRows,
        };
      },
    );
    return { agencyName, jobs, submissions };
  }

  async submit(token: string, dto: CreateSubmissionDto): Promise<{ id: string; isDuplicate: boolean }> {
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
    if (!allowed) throw new BadRequestException('This role is not accepting agency submissions');

    // Uploaded OUTSIDE the tenant tx (ADO #6810): blob I/O inside a tx holds the transaction open
    // for the duration of a network call to storage.
    const resumePath = await this.blobStorage.upload(
      `candidates/${agency.organizationId}/${randomUUID()}.pdf`,
      buf,
      'application/pdf',
    );

    const { id, isDuplicate } = await this.tenantPrisma.forTenant(
      { organizationId: agency.organizationId, isSuperAdmin: true },
      async (tx) => {
        const isDuplicate = Boolean(
          await tx.candidate.findUnique({
            where: { organizationId_email: { organizationId: agency.organizationId, email: dto.email } },
          }),
        );
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
          },
        });
        return { id: submission.id, isDuplicate };
      },
    );

    return { id, isDuplicate };
  }
}
