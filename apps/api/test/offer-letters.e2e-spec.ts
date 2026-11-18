import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { FilesService } from '../src/documents/files.service';
import { docxBlocks } from '../src/documents/letters/docx';
import { OfferTemplatesToLetters } from '../src/offers/offer-letters';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Answer 2515: each older offer template becomes a P05 'offer' letter template once (the one-off command): the same text
// as a .docx, merge fields mapped, e-sign → "person signs", switched on; a name HR already uses waits as a draft; running
// it again makes nothing; one company never touches another; the older routes send people to Letters.
describe('Offer templates move into Letters (answer 2515)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const token: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const at = <T>(k: 'A' | 'B', fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, fn);
  const move = () => app.get(OfferTemplatesToLetters).run();
  const letterOf = async (k: 'A' | 'B', offerTemplateId: string) => {
    const o = await at(k, (tx) => tx.offerTemplate.findFirstOrThrow({ where: { id: offerTemplateId } }));
    return o.letterTemplateId ? at(k, (tx) => tx.letterTemplate.findFirst({ where: { id: o.letterTemplateId! } })) : null;
  };
  const textOf = async (k: 'A' | 'B', fileId: string) => {
    const f = await at(k, (tx) => tx.file.findFirstOrThrow({ where: { id: fileId } }));
    return docxBlocks(await app.get(FilesService).bytes(f)).map((b) => b.runs.map((r) => r.text).join(''));
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).overrideProvider(BlobStorageService).useValue(createFakeBlobStorage()).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    planId = (await prisma.plan.create({ data: { name: `offer-letters-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const passwordHash = await argon2.hash(PASSWORD);
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Offer letters ${k}`, slug: `offer-letters-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
      await at(k, (tx) => tx.user.create({ data: { organizationId: org[k].id, email: `admin@ol-${k.toLowerCase()}-${run}.test`, name: `Admin ${k}`, passwordHash, role: 'org_admin' } }));
      token[k] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `admin@ol-${k.toLowerCase()}-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
      ids[`std${k}`] = (await at(k, (tx) => tx.offerTemplate.create({ data: { organizationId: org[k].id, name: 'Standard offer', isDefault: true, subject: 'Your offer from {{orgName}} for {{jobTitle}}', body: 'Dear {{candidateName}},\n\nCompensation: {{compensation}}\nStart: {{startDate}}\nReply by {{offerExpiry}}: {{offerLink}}\n\nRegards,\n{{recruiterName}} {{unknownThing}}', esign: k === 'A' } }))).id;
    }
    // HR already switched on a Letters offer template called "Campus offer": the moved one of that name waits as a draft.
    const std = await at('A', (tx) => tx.letterTemplate.findFirst({ where: { organizationId: org.A.id } }));
    expect(std).toBeNull();
    ids.campus = (await at('A', (tx) => tx.offerTemplate.create({ data: { organizationId: org.A.id, name: 'Campus offer', subject: 'Campus', body: 'Dear {{candidateName}}', esign: false } }))).id;
    const file = await at('A', (tx) => tx.file.create({ data: { organizationId: org.A.id, area: 'letter-templates', storageRef: `x/${run}`, fileName: 'offer.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 1, sha256: '0'.repeat(64), uploadedVia: 'staff' } }));
    await at('A', (tx) => tx.letterTemplate.create({ data: { organizationId: org.A.id, letterType: 'offer', name: 'Campus offer', source: 'upload', fileId: file.id, fields: [], requiresApproval: false, personSigns: false, status: 'active', previewViewedAt: new Date() } }));
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('each offer template becomes a switched-on offer letter: same text, fields mapped, e-sign as "person signs"', async () => {
    const { failed } = await move();
    expect(failed).toBe(0);
    const t = (await letterOf('A', ids.stdA))!;
    expect(t).toMatchObject({ letterType: 'offer', name: 'Standard offer', source: 'editor', status: 'active', personSigns: true, requiresApproval: false, legalEntityId: null, version: 1, previewViewedBy: null });
    expect(t.previewViewedAt).toBeTruthy();
    expect([...t.fields].sort()).toEqual(['company_name', 'designation', 'employee_name', 'joining_date', 'offer_ctc', 'offer_expiry', 'offer_link', 'signatory_name']);
    expect(await textOf('A', t.fileId)).toEqual([
      'Subject: Your offer from {{company_name}} for {{designation}}',
      '',
      'Dear {{employee_name}},',
      '',
      'Compensation: {{offer_ctc}}',
      'Start: {{joining_date}}',
      'Reply by {{offer_expiry}}: {{offer_link}}',
      '',
      'Regards,',
      // An unknown {{name}} was plain text to the old renderer; it stays text, never a letter field.
      '{{signatory_name}} {unknownThing}',
    ]);
    // e-sign off stays off; each move is audited once.
    expect((await letterOf('B', ids.stdB))!.personSigns).toBe(false);
    expect(await at('A', (tx) => tx.auditLog.count({ where: { action: 'offer_template.moved_to_letters', entityId: ids.stdA } }))).toBe(1);
  });

  it('a name HR already switched on in Letters: the moved one waits as a draft, the active one is untouched', async () => {
    const moved = (await letterOf('A', ids.campus))!;
    expect(moved).toMatchObject({ status: 'draft', version: 2 });
    expect(await at('A', (tx) => tx.letterTemplate.count({ where: { name: 'Campus offer', status: 'active', source: 'upload' } }))).toBe(1);
  });

  it('running it again makes nothing new', async () => {
    const before = await at('A', (tx) => tx.letterTemplate.count());
    expect(await move()).toMatchObject({ failed: 0 });
    expect(await at('A', (tx) => tx.letterTemplate.count())).toBe(before);
    expect(await at('A', (tx) => tx.auditLog.count({ where: { action: 'offer_template.moved_to_letters', entityId: ids.stdA } }))).toBe(1);
  });

  it('each company sees only its own offer letters', async () => {
    const b = (await letterOf('B', ids.stdB))!;
    expect(await at('A', (tx) => tx.letterTemplate.count({ where: { id: b.id } }))).toBe(0);
    expect(await at('B', (tx) => tx.letterTemplate.count({ where: { letterType: 'offer' } }))).toBe(1);
  });

  it('the older offer-template routes send people to Letters; writes are gone; signed-out is refused', async () => {
    for (const path of ['/api/v1/offer-template', '/api/v1/offer-template/default']) {
      const res = await request(server()).get(path).set('Authorization', `Bearer ${token.A}`).expect(301);
      expect(res.headers.location).toBe('/yx/settings/letters');
    }
    expect((await request(server()).post('/api/v1/offer-template').set('Authorization', `Bearer ${token.A}`).send({ name: 'x', subject: 's', body: 'b' }).expect(410)).body.message).toMatch(/Settings › Letter templates/);
    await request(server()).patch(`/api/v1/offer-template/${ids.stdA}`).set('Authorization', `Bearer ${token.A}`).send({ subject: 's' }).expect(410);
    await request(server()).delete(`/api/v1/offer-template/${ids.stdA}`).set('Authorization', `Bearer ${token.A}`).expect(410);
    await request(server()).get('/api/v1/offer-template').expect(401);
    // Nothing was changed through the old routes.
    expect(await at('A', (tx) => tx.offerTemplate.count({ where: { id: ids.stdA } }))).toBe(1);
  });
});
