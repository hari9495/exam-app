import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService, TenantContext, BlobStorageService, buildCertificatePdf } from '@exam-platform/shared';
import { CertificateTemplatesService } from './certificate-templates.service';

const CERT_SIGN_TTL_MS = 60 * 60 * 1000; // 1h read link for the on-demand download

@Injectable()
export class CertificateService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly blob: BlobStorageService,
    private readonly templates: CertificateTemplatesService,
  ) {}

  // Get-or-generate a pass certificate for an attempt and return a signed download URL. `requireReleased`
  // gates the candidate path (recruiters may download before releasing); both paths require the exam to
  // have certificates enabled and the candidate to have passed.
  async getCertificateUrl(context: TenantContext, attemptId: string, opts: { requireReleased: boolean }): Promise<{ url: string }> {
    const orgId = context.organizationId as string;
    const loaded = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.attempt.findFirst({
        where: { id: attemptId, invitation: { exam: { organizationId: orgId } } },
        include: {
          result: true,
          invitation: { include: { candidate: { select: { name: true } }, exam: { select: { title: true, certificatesEnabled: true, resultsReleaseMode: true } } } },
        },
      }),
    );
    if (!loaded) throw new NotFoundException(`Attempt ${attemptId} not found`);
    const { result } = loaded;
    const exam = loaded.invitation.exam;

    if (!exam.certificatesEnabled) throw new BadRequestException('Certificates are not enabled for this exam');
    if (!result || result.passFail !== 'pass') throw new ForbiddenException('A certificate is only available for a passing result');
    if (opts.requireReleased && !this.isReleased(result.releaseOverride, exam.resultsReleaseMode)) {
      throw new ForbiddenException('Results have not been released yet');
    }

    if (result.certificatePath) {
      return { url: (await this.blob.signIfOurs(result.certificatePath, CERT_SIGN_TTL_MS)) as string };
    }

    const org = await this.tenantPrisma.forTenant(context, (tx) => tx.organization.findUnique({ where: { id: orgId }, select: { name: true } }));
    const copy = await this.templates.resolveCopy(context);
    const pdf = await buildCertificatePdf(copy, {
      candidateName: loaded.invitation.candidate.name,
      examTitle: exam.title,
      scorePercent: String(Math.round(result.percentage)),
      date: new Date().toLocaleDateString('en-US', { dateStyle: 'long' } as Intl.DateTimeFormatOptions),
      orgName: org?.name ?? '',
      certificateId: result.id,
    });
    const path = await this.blob.upload(`certificates/${orgId}/${attemptId}.pdf`, pdf, 'application/pdf');
    await this.tenantPrisma.forTenant(context, (tx) => tx.result.update({ where: { id: result.id }, data: { certificatePath: path } }));
    return { url: (await this.blob.signIfOurs(path, CERT_SIGN_TTL_MS)) as string };
  }

  private isReleased(releaseOverride: string | null, resultsReleaseMode: string): boolean {
    if (releaseOverride === 'released') return true;
    if (releaseOverride === 'held') return false;
    return resultsReleaseMode !== 'manual';
  }
}
