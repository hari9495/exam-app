import { InternalApplicationsService, releaseProblem } from '../internal-applications/internal-applications.service';
import { acceptanceCopy } from '../documents/letters/pdf';
import { FilesService } from '../documents/files.service';
import { createHash, randomUUID } from 'crypto';
import { minorHold } from '../talent-crm/minor';
import type { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { LettersService } from '../documents/letters/letters.service';
import { offerLetterData, offerLetterTemplate } from './offer-letters';
import { FIELDS } from '../documents/letters/fields';
import { todayIst } from '../org-structure/org-validation';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Offer, Prisma } from '@prisma/client';
import { TenantPrismaService, TenantContext, AuditService, BlobStorageService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { IntegrationEventsService } from '../integrations/integration-events.service';
import { buildCandidateEmailHtml } from '../candidate-emails/candidate-email-render';
import { OfferTemplatesService } from './offer-templates.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { buildOfferPdf } from './offer-pdf';
import { renderOfferTemplate } from './offer-render';
import { ApprovalsService, ApprovalSummary } from '../approvals/approvals.service';
import { OtpService } from '../auth/otp.service';
import { publicBrand } from '../public-applications/public-brand';

const LOGO_SIGN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const PDF_SIGN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

@Injectable()
export class OffersService {
  // offers is RLS-protected and there is no org context until the offerToken resolves one. The
  // super-admin flag on forTenant bypasses the RLS predicate entirely, same as
  // PublicApplicationsService.LOOKUP_ORG -- this placeholder org is never used for filtering.
  private readonly LOOKUP_ORG = '00000000-0000-0000-0000-000000000000';

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly offerTemplates: OfferTemplatesService,
    private readonly emailService: EmailService,
    private readonly blobStorage: BlobStorageService,
    private readonly audit: AuditService,
    private readonly integrationEvents: IntegrationEventsService,
    private readonly approvals: ApprovalsService,
    // HIR-09 e-sign: the one-time code the candidate signs with (optional so older unit tests build without it).
    @Optional() private readonly otp?: OtpService,
    @Optional() private readonly internal?: InternalApplicationsService,
    // Answer 377: the sealed copy of an e-signed offer is stored like a letter's (private, the files table).
    @Optional() private readonly files?: FilesService,
    // M10 D4 (answer 2524): an offer from a Letters 'offer' template is issued as a P05 letter.
    @Optional() private readonly letters?: LettersService,
  ) {}

  /** A P05 offer's letter input for a preview (its live link is not made yet, so the letter says where it will go). */
  private async offerPreviewInput(tx: Prisma.TransactionClient, org: string, offerId: string) {
    const offer = await tx.offer.findFirst({ where: { id: offerId, organizationId: org }, include: { pipelineEntry: { include: { candidate: true, job: true } } } });
    if (!offer) throw new NotFoundException(`Offer ${offerId} not found`);
    const t = await offerLetterTemplate(tx, org, offer.templateId);
    if (!t) return null;
    const c = { organizationId: org, isSuperAdmin: false } as CompanyContext;
    const link = offer.offerToken ? `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/yx/offer/${offer.offerToken}` : '(the candidate’s link is added when the offer is sent)';
    return { templateId: t.id, ...(await offerLetterData(tx, c, offer, link)) };
  }

  /** The offer's issued P05 letter (the latest; an earlier version's is superseded), or null for an older offer. */
  private offerLetter(tx: Prisma.TransactionClient, org: string, offerId: string) {
    // Without Letters wired (older unit set-ups) there is no P05 letter to find.
    if (!this.letters) return Promise.resolve(null);
    return tx.letterIssue.findFirst({ where: { organizationId: org, subjectType: 'offer', subjectId: offerId, status: 'issued' }, orderBy: { issuedAt: 'desc' }, select: { id: true, referenceNo: true, sha256: true, acceptedAt: true } });
  }

  async createOffer(context: TenantContext, actorUserId: string, entryId: string, dto: CreateOfferDto): Promise<Offer> {
    // Template lookup opens its own forTenant read (see OfferTemplatesService.getDefault/getById),
    // so it runs before -- not nested inside -- the entry-check/create transaction below, and
    // only when the caller didn't supply both subject and body.
    let letterSubject = dto.subject;
    let letterBody = dto.body;
    if (!letterSubject || !letterBody) {
      const template = dto.templateId
        ? await this.offerTemplates.getById(context, dto.templateId)
        : await this.offerTemplates.getDefault(context);
      letterSubject = letterSubject ?? template.subject;
      letterBody = letterBody ?? template.body;
    }

    const made = await this.tenantPrisma.forTenant(context, async (tx) => {
      const orgId = context.organizationId as string;
      const entry = await tx.pipelineEntry.findFirst({ where: { id: entryId, organizationId: orgId } });
      if (!entry) throw new NotFoundException(`Pipeline entry ${entryId} not found`);
      // HIR-05 under 18 (rule set HIR.MINOR): no offer until a parent or guardian consents.
      const minor = await minorHold(tx as unknown as Tx, orgId, entry.candidateId, todayIst(), 'offer');
      if (minor) throw new ConflictException(minor);
      // Answer 2761: an internal applicant's current manager releases them first (company setting).
      const held = await releaseProblem(tx as unknown as Tx, orgId, entryId);
      if (held) throw new ConflictException(held);

      const offer = await tx.offer.create({
        data: {
          organizationId: orgId,
          pipelineEntryId: entryId,
          candidateId: entry.candidateId,
          compensation: dto.compensation,
          startDate: new Date(dto.startDate),
          expiresAt: new Date(dto.expiresAt),
          status: 'draft',
          letterSubject: letterSubject as string,
          letterBody: letterBody as string,
        },
      });

      await this.audit.record(context, {
        actorUserId,
        action: 'offer.created',
        entityType: 'offer',
        entityId: offer.id,
      });
      return offer;
    });
    // HIR-13: an internal applicant's manager may be told at the offer (company setting).
    await this.internal?.tellAtOffer(context, entryId);
    return made;
  }

  /**
   * Answer 377 (YX-DOC-12 for offers): the issued letter's pages, then the acceptance page (who, when, IP, device, the
   * one-time-code check and the letter's SHA-256) through the letters' acceptanceCopy; stored privately in files.
   */
  async sealCopy(organizationId: string, offerId: string): Promise<{ fileId: string }> {
    const ctx = { organizationId, isSuperAdmin: false };
    const o = await this.tenantPrisma.forTenant(ctx, (tx) => tx.offer.findFirst({ where: { organizationId, id: offerId }, include: { pipelineEntry: { include: { candidate: { select: { name: true, email: true } } } } } }));
    if (!o) throw new NotFoundException('Offer not found');
    if (o.acceptanceFileId) return { fileId: o.acceptanceFileId };
    const ev = o.esignEvidence as { at?: string; ip?: string | null; device?: string | null; channel?: string; assurance?: string } | null;
    if (o.status !== 'accepted' || !o.esign || !ev?.at) throw new ConflictException('Only an offer accepted with e-sign has a sealed copy.');
    try {
      if (!this.files) throw new Error('file storage is not set up');
      // M10 D4: a P05 offer letter's own pages, reference and fingerprint; an older offer's PDF otherwise.
      const issued = await this.tenantPrisma.forTenant(ctx, (tx) => this.offerLetter(tx, organizationId, offerId));
      const p05 = issued && this.letters ? await this.letters.offerLetterPdf(organizationId, issued.id) : null;
      const letter = p05 ? p05.pdf : o.pdfPath ? await this.blobStorage.downloadToBuffer(o.pdfPath) : await this.previewPdf(ctx, offerId);
      const copy = await acceptanceCopy(letter, {
        title: p05 ? p05.title.split(':')[0]! : o.letterSubject.slice(0, 120) || 'Offer letter',
        referenceNo: p05 ? p05.referenceNo : `Offer ${o.id.slice(0, 8)}`,
        letterSha256: p05 ? p05.sha256 : createHash('sha256').update(letter).digest('hex'),
        who: `${o.pipelineEntry.candidate.name} (${o.pipelineEntry.candidate.email})`,
        at: ev.at,
        channel: ev.channel === 'sms' ? 'text message' : 'email',
        ip: ev.ip ?? null,
        device: ev.device ?? null,
        assurance: ev.assurance ?? 'one-time code',
      });
      return await this.tenantPrisma.forTenant(ctx, async (tx) => {
        const file = await this.files!.storeIn(tx, ctx as never, { area: 'offers', name: `offer-${o.id.slice(0, 8)}-accepted.pdf`, data: copy, allowedMime: ['application/pdf'], maxMb: 25, via: 'system' });
        await tx.file.update({ where: { id: file.id }, data: { scanStatus: 'clean', scanDetail: 'generated by YukthiX', scannedAt: new Date() } });
        const n = await tx.offer.updateMany({ where: { id: o.id, organizationId, acceptanceFileId: null }, data: { acceptanceFileId: file.id } });
        if (!n.count) return { fileId: (await tx.offer.findUniqueOrThrow({ where: { id: o.id }, select: { acceptanceFileId: true } })).acceptanceFileId! };
        // The P05 letter records its acceptance once (the letters guard): when, and the sealed copy.
        if (p05) await tx.letterIssue.updateMany({ where: { organizationId, id: p05.id, acceptedAt: null }, data: { acceptedAt: new Date(ev.at!), acceptanceFileId: file.id } });
        await this.audit.record(ctx, { actorUserId: null, action: 'offer.esign_copy_made', entityType: 'offer', entityId: o.id, metadata: { fileId: file.id, sha256: createHash('sha256').update(copy).digest('hex') } });
        return { fileId: file.id };
      });
    } catch (e) {
      await this.audit.record(ctx, { actorUserId: null, action: 'offer.esign_copy_failed', entityType: 'offer', entityId: o.id, metadata: { error: (e as Error).message.slice(0, 200) } }).catch(() => undefined);
      throw new ServiceUnavailableException('The sealed copy could not be made. Try "Make the sealed copy" again.');
    }
  }

  /** Answer 377: the sealed copy for staff (the letter shows pay: the controller checks the pay key). */
  async sealedCopy(context: TenantContext, offerId: string): Promise<{ file: Buffer; name: string }> {
    const row = await this.tenantPrisma.forTenant(context, async (tx) => {
      const o = await tx.offer.findFirst({ where: { organizationId: context.organizationId as string, id: offerId }, select: { acceptanceFileId: true } });
      if (!o) throw new NotFoundException('Offer not found');
      if (!o.acceptanceFileId) throw new NotFoundException('This offer has no sealed copy.');
      return tx.file.findFirstOrThrow({ where: { organizationId: context.organizationId as string, id: o.acceptanceFileId } });
    });
    return { file: await this.files!.bytes(row), name: row.fileName };
  }

  async previewPdf(context: TenantContext, offerId: string): Promise<Buffer> {
    // M10 D4: once issued, the offer's letter is its P05 letter (the same pages the candidate has).
    const issued = this.letters ? await this.tenantPrisma.forTenant(context, (tx) => this.offerLetter(tx, context.organizationId as string, offerId)) : null;
    if (issued) return (await this.letters!.offerLetterPdf(context.organizationId as string, issued.id)).pdf;
    // Not issued yet: a P05 offer previews its letter with the same fill as the send (read-only, marked as a preview).
    const p05 = this.letters ? await this.tenantPrisma.forTenant(context, (tx) => this.offerPreviewInput(tx, context.organizationId as string, offerId)) : null;
    if (p05) return this.letters!.previewOffer(context.organizationId as string, p05);
    const loaded = await this.tenantPrisma.forTenant(context, async (tx) => {
      const orgId = context.organizationId as string;
      const offer = await tx.offer.findFirst({
        where: { id: offerId, organizationId: orgId },
        include: { pipelineEntry: { include: { candidate: true, job: true } } },
      });
      if (!offer) throw new NotFoundException(`Offer ${offerId} not found`);
      const org = await tx.organization.findUnique({ where: { id: orgId }, select: { name: true } });
      return {
        offer,
        candidateName: offer.pipelineEntry.candidate.name,
        jobTitle: offer.pipelineEntry.job.title,
        orgName: org?.name ?? '',
      };
    });
    const { offer, candidateName, jobTitle, orgName } = loaded;

    const dateFmt = (d: Date) => d.toLocaleDateString('en-US', { dateStyle: 'long' } as any);
    const rendered = renderOfferTemplate(offer.letterSubject, offer.letterBody, {
      candidateName,
      jobTitle,
      orgName,
      recruiterName: '',
      compensation: offer.compensation,
      startDate: dateFmt(offer.startDate),
      offerExpiry: dateFmt(offer.expiresAt),
      offerLink: '',
    });

    return buildOfferPdf({
      orgName,
      letterBody: rendered.body,
      candidateName,
      jobTitle,
      compensation: offer.compensation,
      startDate: offer.startDate,
      expiresAt: offer.expiresAt,
    });
  }

  async listForEntry(context: TenantContext, entryId: string): Promise<(Offer & { approval: ApprovalSummary | null })[]> {
    const offers = await this.tenantPrisma.forTenant(context, async (tx) =>
      tx.offer.findMany({
        where: { organizationId: context.organizationId as string, pipelineEntryId: entryId },
        orderBy: { createdAt: 'desc' },
      }),
    );
    return this.withApprovalSummaries(context, offers);
  }

  async listForCandidate(context: TenantContext, candidateId: string): Promise<(Offer & { approval: ApprovalSummary | null })[]> {
    const offers = await this.tenantPrisma.forTenant(context, async (tx) =>
      tx.offer.findMany({
        where: { organizationId: context.organizationId as string, candidateId },
        orderBy: { createdAt: 'desc' },
      }),
    );
    return this.withApprovalSummaries(context, offers);
  }

  // The P03 approval timeline of each offer (one batched read), in the summary shape the offer lists read.
  private async withApprovalSummaries(context: TenantContext, offers: Offer[]): Promise<(Offer & { approval: ApprovalSummary | null })[]> {
    const ids = offers.flatMap((o) => (o.wfRequestId ? [o.wfRequestId] : []));
    const reqs = ids.length ? await this.tenantPrisma.forTenant(context, (tx) => tx.wfRequest.findMany({ where: { organizationId: context.organizationId as string, id: { in: ids } } })) : [];
    return offers.map((offer) => {
      const r = reqs.find((x) => x.id === offer.wfRequestId);
      if (!r) return { ...offer, approval: null };
      const steps = (r.steps as { name: string; state: string }[]).map((st) => ({ name: st.name, state: (st.state === 'approved' || st.state === 'skipped' ? 'approved' : st.state === 'rejected' ? 'rejected' : 'pending') as 'pending' | 'approved' | 'rejected' }));
      return { ...offer, approval: { status: r.status, currentStep: r.currentStep, steps } };
    });
  }

  // Org-scoped status flips for the offer approval lifecycle -- mirrors
  // PipelineService.markRequisitionApproved/Draft (Task 11) for the offer gate.
  async markApproved(context: TenantContext, offerId: string): Promise<void> {
    await this.setOfferStatus(context, offerId, 'approved');
  }

  async markDraft(context: TenantContext, offerId: string): Promise<void> {
    await this.setOfferStatus(context, offerId, 'draft');
  }

  private async setOfferStatus(context: TenantContext, offerId: string, status: string): Promise<void> {
    await this.tenantPrisma.forTenant(context, (tx) =>
      tx.offer.updateMany({ where: { id: offerId, organizationId: context.organizationId as string }, data: { status } }),
    );
  }

  // Submits the offer through the approvals engine. Only a draft offer is eligible -- one
   async sendOffer(context: TenantContext, actorUserId: string, offerId: string, opts: { seesPay?: boolean } = {}): Promise<Offer> {
    const orgId = context.organizationId as string;

    // Offer gate: when the org has an enabled offer approval chain, only an approved offer may
    // be sent. When the gate is off (no chain, or disabled), preserve today's behavior exactly --
    // sendable straight from draft. Read outside the tx below, same as PipelineService.createJob's
    // requisition-gate check.
    const chains = await this.approvals.getChains(context);
    const gateEnabled = chains.offer.enabled;

    // Phase 1 (short tx): org-scoped read + the offerToken mint. No network calls here --
    // forTenant uses Prisma's default 5s interactive-transaction timeout, and the PDF build +
    // blob upload + SMTP send below can take longer than that (see CandidateEmailsService.sendMessage,
    // which follows the same three-phase shape for the same reason).
    const prep = await this.tenantPrisma.forTenant(context, async (tx) => {
      const offer = await tx.offer.findFirst({
        where: { id: offerId, organizationId: orgId },
        include: { pipelineEntry: { include: { candidate: true, job: true } } },
      });
      if (!offer) throw new NotFoundException(`Offer ${offerId} not found`);
      // HIR-09: an offer with CTC versions is sent only once approved (its route, or the auto-pass when it has none).
      if (offer.currentVersion > 0) {
        if (offer.status !== 'approved') throw new ConflictException(offer.status === 'sent' ? 'Offer already sent' : 'Send the offer for approval first.');
      } else if (gateEnabled) {
        if (offer.status !== 'approved') throw new ConflictException('Offer not approved');
      } else if (offer.status !== 'draft') {
        throw new BadRequestException('Offer already sent');
      }
      if (offer.pipelineEntry.candidate.erasedAt) throw new BadRequestException('Candidate has been erased');

      // A send that failed earlier keeps its link, so a letter already made for it (which prints the link) still works.
      const offerToken = offer.offerToken ?? randomUUID();
      const offerLink = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/yx/offer/${offerToken}`;
      // M10 D4 (answer 2524): a Letters 'offer' template is issued as a P05 letter with every letter field filled.
      const letterTpl = await offerLetterTemplate(tx, orgId, offer.templateId);
      // A letter that prints pay is issued only by someone who may see offer pay (P05 R1; bulk offers already need it).
      if (letterTpl && opts.seesPay === false && letterTpl.fields.some((f) => FIELDS[f]?.cls === 'pay')) throw new ForbiddenException('This offer letter shows pay: sending it needs ats.offer.compensation.view.');
      const c = { organizationId: orgId, isSuperAdmin: false, userId: actorUserId } as CompanyContext;
      const p05 = letterTpl
        ? {
            templateId: letterTpl.id,
            ...(await offerLetterData(tx, c, offer, offerLink)),
            // The letter made for this version is used again after a failed email (LettersService.issueOffer).
            since: (offer.currentVersion ? await tx.offerVersion.findFirst({ where: { organizationId: orgId, offerId, version: offer.currentVersion }, select: { createdAt: true } }) : null)?.createdAt ?? offer.createdAt,
          }
        : null;
      await tx.offer.update({ where: { id: offerId }, data: { offerToken } });
      const org = await tx.organization.findUnique({ where: { id: orgId }, select: { name: true, logoPath: true } });
      const actorName = actorUserId
        ? ((await tx.user.findUnique({ where: { id: actorUserId }, select: { name: true } }))?.name ?? '')
        : '';
      // Founder decision 4: e-sign only when the offer's template switches it on (accepting by the link otherwise).
      // Answer 2515: a Letters offer template's "person signs"; an offer drafted before the move keeps its old template's switch.
      const esign = letterTpl
        ? letterTpl.personSigns
        : offer.templateId
        ? Boolean((await tx.letterTemplate.findFirst({ where: { organizationId: orgId, id: offer.templateId }, select: { personSigns: true } }))?.personSigns ?? (await tx.offerTemplate.findFirst({ where: { organizationId: orgId, id: offer.templateId }, select: { esign: true } }))?.esign)
        : false;
      return { offer, candidate: offer.pipelineEntry.candidate, job: offer.pipelineEntry.job, org, actorName, offerToken, offerLink, esign, p05 };
    });

    // Phase 2 (outside any tx): rendering + network calls (PDF build, blob upload, SMTP send).
    if (prep.p05) return this.sendOfferLetter(context, actorUserId, { ...prep, p05: prep.p05 });
    const offerLink = prep.offerLink;
    const rendered = renderOfferTemplate(prep.offer.letterSubject, prep.offer.letterBody, {
      candidateName: prep.candidate.name,
      jobTitle: prep.job.title,
      orgName: prep.org?.name ?? '',
      recruiterName: prep.actorName,
      compensation: prep.offer.compensation,
      startDate: prep.offer.startDate.toLocaleDateString('en-US', { dateStyle: 'long' } as any),
      offerExpiry: prep.offer.expiresAt.toLocaleDateString('en-US', { dateStyle: 'long' } as any),
      offerLink,
    });
    const pdf = await buildOfferPdf({
      orgName: prep.org?.name ?? '',
      letterBody: rendered.body,
      candidateName: prep.candidate.name,
      jobTitle: prep.job.title,
      compensation: prep.offer.compensation,
      startDate: prep.offer.startDate,
      expiresAt: prep.offer.expiresAt,
    });
    const pdfPath = await this.blobStorage.upload(`offers/${orgId}/${prep.offerToken}.pdf`, pdf, 'application/pdf');
    const logoUrl = prep.org?.logoPath ? await this.blobStorage.signIfOurs(prep.org.logoPath, LOGO_SIGN_TTL_MS) : null;
    const html = buildCandidateEmailHtml({
      logoUrl: logoUrl as string | null,
      orgName: prep.org?.name ?? null,
      bodyText: `${rendered.body}\n\nRespond to your offer: ${offerLink}`,
    });
    const result = await this.emailService.send({
      to: prep.candidate.email,
      subject: rendered.subject,
      html,
      organizationId: orgId,
      attachments: [{ filename: 'offer-letter.pdf', content: pdf }],
    });

    // Phase 3 (short tx): log the outcome. A failed send leaves the offer in draft so the
    // recruiter can retry -- it must not look "sent" when the candidate never received it.
    return this.tenantPrisma.forTenant(context, async (tx) => {
      if (!result.success) {
        await this.audit.record(context, {
          actorUserId,
          action: 'offer.send_failed',
          entityType: 'offer',
          entityId: offerId,
          metadata: { to: prep.candidate.email },
        });
        return prep.offer;
      }
      const updated = await tx.offer.update({
        where: { id: offerId },
        data: { status: 'sent', pdfPath, sentAt: new Date(), sentByUserId: actorUserId, esign: prep.esign },
      });
      await this.audit.record(context, {
        actorUserId,
        action: 'offer.sent',
        entityType: 'offer',
        entityId: offerId,
        metadata: { to: prep.candidate.email, esign: prep.esign },
      });
      return updated;
    });
  }

  /**
   * M10 D4 phases 2 and 3 for a P05 offer: the letter is issued (numbered, made, stamped, signed for the entity by its
   * signatory), then emailed with the letter attached and the link to answer it. A failed email leaves the offer approved
   * with its link and letter, so Send again uses the same letter.
   */
  private async sendOfferLetter(context: TenantContext, actorUserId: string, prep: { offer: Offer; candidate: { name: string; email: string }; job: { title: string }; org: { name: string; logoPath: string | null } | null; offerLink: string; esign: boolean; p05: { templateId: string; legalEntityId: string; since: Date; data: Record<string, string | boolean> } }): Promise<Offer> {
    const orgId = context.organizationId as string;
    if (!this.letters) throw new ServiceUnavailableException('Offer letters are not available right now. Try again later.');
    const letter = await this.letters.issueOffer(orgId, actorUserId, { offerId: prep.offer.id, candidateId: prep.offer.candidateId, candidateName: prep.candidate.name, templateId: prep.p05.templateId, legalEntityId: prep.p05.legalEntityId, since: prep.p05.since, data: prep.p05.data });
    const company = String(prep.p05.data.legal_entity || prep.org?.name || '');
    const logoUrl = prep.org?.logoPath ? await this.blobStorage.signIfOurs(prep.org.logoPath, LOGO_SIGN_TTL_MS) : null;
    const answerBy = String(prep.p05.data.offer_expiry);
    const html = buildCandidateEmailHtml({
      logoUrl: logoUrl as string | null,
      orgName: prep.org?.name ?? null,
      bodyText: [
        `Dear ${String(prep.p05.data.first_name) || prep.candidate.name},`,
        `${company} is pleased to offer you the role of ${prep.job.title}. Your offer letter ${letter.referenceNo} is attached.`,
        prep.esign ? `Read it and sign it with a one-time code by ${answerBy}: ${prep.offerLink}` : `Read it and answer by ${answerBy}: ${prep.offerLink}`,
      ].join('\n\n'),
    });
    const result = await this.emailService.send({
      to: prep.candidate.email,
      subject: `Your offer from ${company} for ${prep.job.title}`.slice(0, 200),
      html,
      organizationId: orgId,
      attachments: [{ filename: `${letter.referenceNo.replace(/[^A-Za-z0-9]+/g, '-')}.pdf`, content: letter.pdf }],
    });
    return this.tenantPrisma.forTenant(context, async (tx) => {
      if (!result.success) {
        await this.audit.record(context, { actorUserId, action: 'offer.send_failed', entityType: 'offer', entityId: prep.offer.id, metadata: { to: prep.candidate.email, letterId: letter.id } });
        return prep.offer;
      }
      const n = await tx.offer.updateMany({ where: { id: prep.offer.id, organizationId: orgId, status: 'approved' }, data: { status: 'sent', pdfPath: null, sentAt: new Date(), sentByUserId: actorUserId, esign: prep.esign } });
      if (!n.count) throw new ConflictException('This offer changed meanwhile. Reload it.');
      await this.audit.record(context, { actorUserId, action: 'offer.sent', entityType: 'offer', entityId: prep.offer.id, metadata: { to: prep.candidate.email, esign: prep.esign, letterId: letter.id, referenceNo: letter.referenceNo } });
      return tx.offer.findUniqueOrThrow({ where: { id: prep.offer.id } });
    });
  }

  async withdraw(context: TenantContext, actorUserId: string, offerId: string): Promise<Offer> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const orgId = context.organizationId as string;
      const offer = await tx.offer.findFirst({ where: { id: offerId, organizationId: orgId } });
      if (!offer) throw new NotFoundException(`Offer ${offerId} not found`);
      if (offer.status !== 'sent') throw new BadRequestException('Only a sent offer can be withdrawn');

      const updated = await tx.offer.update({ where: { id: offerId }, data: { status: 'withdrawn' } });
      await this.audit.record(context, {
        actorUserId,
        action: 'offer.withdrawn',
        entityType: 'offer',
        entityId: offerId,
      });
      return updated;
    });
  }

  private async resolveOfferByToken(token: string) {
    const offer = await this.tenantPrisma.forTenant(
      { organizationId: this.LOOKUP_ORG, isSuperAdmin: true },
      (tx) =>
        tx.offer.findUnique({
          where: { offerToken: token },
          select: {
            id: true,
            organizationId: true,
            pipelineEntryId: true,
            compensation: true,
            startDate: true,
            expiresAt: true,
            status: true,
            pdfPath: true,
            sentByUserId: true,
            esign: true,
            letterBody: true,
          },
        }),
    );
    // Generic message regardless of which condition failed later (expired, already responded)
    // -- distinguishing "no such token" from a state failure would give an outsider an oracle.
    if (!offer) throw new NotFoundException('Offer not found');
    return offer;
  }

  async getPublicOffer(token: string) {
    const offer = await this.resolveOfferByToken(token);

    const details = await this.tenantPrisma.forTenant(
      { organizationId: offer.organizationId, isSuperAdmin: true },
      async (tx) => {
        const entry = await tx.pipelineEntry.findUnique({
          where: { id: offer.pipelineEntryId },
          select: { job: { select: { title: true } } },
        });
        const org = await tx.organization.findUnique({ where: { id: offer.organizationId }, select: { name: true } });
        return { jobTitle: entry?.job.title ?? '', orgName: org?.name ?? '' };
      },
    );

    const pdfUrl = offer.pdfPath ? ((await this.blobStorage.signIfOurs(offer.pdfPath, PDF_SIGN_TTL_MS)) as string | null) : null;
    // M10 D4: a P05 letter is downloaded from GET /public/offers/:token/letter (the page builds the address).
    const letter = await this.tenantPrisma.forTenant({ organizationId: offer.organizationId, isSuperAdmin: false }, (tx) => this.offerLetter(tx, offer.organizationId, offer.id));

    return {
      jobTitle: details.jobTitle,
      orgName: details.orgName,
      // Careers answer 362: the company's logo, colour, careers link and white-label on the offer page.
      brand: await publicBrand(this.tenantPrisma, this.blobStorage, offer.organizationId),
      compensation: offer.compensation,
      startDate: offer.startDate,
      expiresAt: offer.expiresAt,
      status: offer.status,
      pdfUrl,
      // HIR-09: the candidate signs with a one-time code only when the company's template asks for it.
      esign: offer.esign,
      letter: letter ? { referenceNo: letter.referenceNo } : null,
    };
  }

  /** M10 D4: the offer's issued P05 letter for the candidate, by the offer's link (while the link is live). */
  async publicLetter(token: string): Promise<{ file: Buffer; name: string }> {
    const offer = await this.resolveOfferByToken(token);
    if (!['sent', 'accepted', 'declined'].includes(offer.status) || !this.letters) throw new NotFoundException('Offer not found');
    const l = await this.tenantPrisma.forTenant({ organizationId: offer.organizationId, isSuperAdmin: false }, (tx) => this.offerLetter(tx, offer.organizationId, offer.id));
    if (!l) throw new NotFoundException('Offer not found');
    const p = await this.letters.offerLetterPdf(offer.organizationId, l.id);
    return { file: p.pdf, name: `${p.referenceNo.replace(/[^A-Za-z0-9]+/g, '-')}.pdf` };
  }

  private esignKey = (offerId: string) => `offer-esign:${offerId}`;

  /** HIR-09 e-sign, step 1: a one-time code to the candidate's email (rate-limited per offer and per address). */
  async sendEsignCode(token: string, ip: string | null) {
    const offer = await this.resolveOfferByToken(token);
    if (!offer.esign || offer.status !== 'sent' || offer.expiresAt < new Date()) throw new ConflictException('This offer is no longer available');
    if (!this.otp) throw new ConflictException('Signing is not available right now. Try again later.');
    const email = await this.tenantPrisma.forTenant({ organizationId: offer.organizationId, isSuperAdmin: true }, async (tx) => {
      const entry = await tx.pipelineEntry.findUnique({ where: { id: offer.pipelineEntryId }, select: { candidate: { select: { email: true } } } });
      return entry?.candidate.email ?? null;
    });
    if (!email) throw new ConflictException('This offer is no longer available');
    await this.otp.reserveSend(this.esignKey(offer.id), ip);
    const code = await this.otp.issue(this.esignKey(offer.id), { email });
    this.otp.deliver('email', email, code, 'mfa', offer.organizationId, { userId: '' });
    return { sent: true, to: email.replace(/^(.).*(@.*)$/, '$1•••$2') };
  }

  async respondPublic(token: string, action: 'accept' | 'decline', sign: { code?: string; disclosureAccepted?: boolean; ip?: string | null; device?: string | null } = {}): Promise<Offer> {
    const offer = await this.resolveOfferByToken(token);
    // Generic conflict messages -- same anti-oracle reasoning as the NotFound above, just
    // surfaced as 409s once the token itself is known-good.
    if (offer.status !== 'sent') throw new ConflictException('This offer is no longer available');
    if (offer.expiresAt < new Date()) throw new ConflictException('This offer has expired');

    const context = { organizationId: offer.organizationId, isSuperAdmin: true };
    const letter = await this.tenantPrisma.forTenant({ organizationId: offer.organizationId, isSuperAdmin: false }, (tx) => this.offerLetter(tx, offer.organizationId, offer.id));
    const newStatus = action === 'accept' ? 'accepted' : 'declined';
    // HIR-09 e-sign (the template switched it on): accepting needs the disclosure read and the emailed one-time code;
    // the evidence (when, from where, the letter's fingerprint) is kept on the offer. Declining never needs a code.
    let esignEvidence: Record<string, unknown> | null = null;
    if (action === 'accept' && offer.esign) {
      if (!sign.disclosureAccepted) throw new BadRequestException({ statusCode: 400, code: 'ESIGN_DISCLOSURE', message: 'Read and accept how electronic signing works first.' });
      if (!sign.code || !this.otp) throw new BadRequestException({ statusCode: 400, code: 'ESIGN_CODE', message: 'Enter the code we emailed you to sign the offer.' });
      if (!(await this.otp.check(this.esignKey(offer.id), sign.code))) throw new UnauthorizedException('That code is not right or has expired. Ask for a new one.');
      esignEvidence = { at: new Date().toISOString(), ip: sign.ip ?? null, device: sign.device?.slice(0, 300) ?? null, channel: 'email', assurance: 'one-time code', letterSha256: letter?.sha256 ?? createHash('sha256').update(offer.letterBody).digest('hex'), ...(letter ? { referenceNo: letter.referenceNo } : {}) };
    }

    const updated = await this.tenantPrisma.forTenant(context, async (tx) => {
      // Compound-precondition write, not a pre-tx-guarded update: two concurrent public
      // requests (double-click, retry) can both pass the reads above, but only one can
      // flip status:'sent' -> newStatus here. The loser gets count:0 and must not write
      // an audit row or trigger a recruiter email -- same generic message, no oracle.
      const respondedAt = new Date();
      const result = await tx.offer.updateMany({
        where: { id: offer.id, organizationId: offer.organizationId, status: 'sent' },
        data: { status: newStatus, respondedAt, ...(esignEvidence ? { esignEvidence: esignEvidence as Prisma.InputJsonValue } : {}) },
      });
      if (result.count === 0) {
        throw new ConflictException('This offer is no longer available');
      }
      // A P05 letter accepted by the link records when (the sealed copy records an e-signed one).
      if (letter && action === 'accept' && !esignEvidence) await tx.letterIssue.updateMany({ where: { organizationId: offer.organizationId, id: letter.id, acceptedAt: null }, data: { acceptedAt: respondedAt } });
      await this.audit.record(context, {
        actorUserId: null,
        action: action === 'accept' ? 'offer.accepted' : 'offer.declined',
        entityType: 'offer',
        entityId: offer.id,
        ...(esignEvidence || letter ? { metadata: { ...(esignEvidence ? { esign: true } : {}), ...(letter ? { letterId: letter.id, referenceNo: letter.referenceNo } : {}) } } : {}),
      });
      return { ...offer, status: newStatus, respondedAt } as Offer;
    });
    // Answer 377: the sealed copy, after the acceptance is recorded (it never undoes it). A copy that cannot be made is
    // audited and shown on the offer with "Make the sealed copy"; never silently missing.
    if (esignEvidence) await this.sealCopy(offer.organizationId, offer.id).catch(() => undefined);

    // Recruiter notification + fit-scored candidate lookup: OUTSIDE the tx above --
    // emailService.send is a network call and must never run inside a forTenant callback
    // (same three-phase reasoning as sendOffer). Fetched unconditionally (not gated on
    // sentByUserId) since offer.accepted must emit regardless of whether a recruiter email
    // goes out.
    const notify = await this.tenantPrisma.forTenant(context, async (tx) => {
      const recruiter = offer.sentByUserId
        ? await tx.user.findUnique({ where: { id: offer.sentByUserId as string }, select: { email: true } })
        : null;
      const entry = await tx.pipelineEntry.findUnique({
        where: { id: offer.pipelineEntryId },
        select: { candidateId: true, candidate: { select: { name: true } }, job: { select: { title: true } } },
      });
      return {
        recruiterEmail: recruiter?.email,
        candidateName: entry?.candidate.name ?? '',
        candidateId: entry?.candidateId,
        jobTitle: entry?.job.title ?? '',
      };
    });
    if (notify.recruiterEmail) {
      const verb = action === 'accept' ? 'accepted' : 'declined';
      const html = buildCandidateEmailHtml({
        logoUrl: null,
        orgName: null,
        bodyText: `Candidate ${notify.candidateName} has ${verb} the offer for ${notify.jobTitle}.`,
      });
      await this.emailService.send({
        to: notify.recruiterEmail,
        subject: `Offer ${verb}: ${notify.candidateName}`,
        html,
        organizationId: offer.organizationId,
      });
    }

    if (action === 'accept') {
      await this.integrationEvents.emit(offer.organizationId, 'offer.accepted', {
        subject: notify.candidateName,
        roleTitle: notify.jobTitle || undefined,
        linkPath: `/candidates/${notify.candidateId}`,
      });
    }

    return updated;
  }
}
