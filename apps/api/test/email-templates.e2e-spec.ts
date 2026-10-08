import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService, SendEmailInput } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';

// P04 Q5 / §4 Editing & Branding end to end, against the real database (forced RLS, app role): a company brands and
// re-words its account emails; the locked parts stay; placeholders are whitelisted; nothing a company types is ever
// markup or a link; one company never sees or changes another's; every change is audited with before / after.
describe('Company email branding and wording (P04 Q5)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const sent: SendEmailInput[] = [];
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  const org = { A: '', B: '' };
  let planId: string;
  const api = (who: string, method: 'get' | 'post' | 'put' | 'delete', path: string) =>
    request(app.getHttpServer())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const email = (who: string) => `${who.toLowerCase()}-${runId}@et.test`;
  const audit = (organizationId: string, action: string) =>
    tenantPrisma
      .forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId, action }, orderBy: { createdAt: 'asc' } }))
      .then((rows) => rows.map((r) => ({ ...r, metadata: JSON.parse(r.metadataJson ?? 'null') })));
  const settle = () => new Promise((r) => setTimeout(r, 300));
  const WORDING = { subject: 'Reset your {{companyName}} password, {{firstName}}', heading: 'New password for {{firstName}}', intro: 'Hi {{firstName}}, the HR team at {{companyName}} here.', buttonLabel: 'Choose a password', footer: 'Kaveri People Team' };

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async (m: SendEmailInput) => (sent.push(m), { success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    planId = (await prisma.plan.create({ data: { name: `et-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const [key, name] of [['A', `Kaveri Foods ${runId}`], ['B', `Godavari Agro ${runId}`]] as const) {
      org[key] = (await prisma.organization.create({ data: { name, slug: `et-${key.toLowerCase()}-${runId}`, planId } })).id;
    }
    for (const [who, o, role, name] of [['adminA', 'A', 'org_admin', 'Asha Rao'], ['panelA', 'A', 'panel', 'Pavan K'], ['adminB', 'B', 'org_admin', 'Bala S']] as const) {
      users[who] = (await tenantPrisma.forTenant({ organizationId: org[o], isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: org[o], email: email(who), name, passwordHash, role } }))).id;
      token[who] = (await request(app.getHttpServer()).post('/api/v1/auth/staff/login').send({ organizationSlug: `et-${o.toLowerCase()}-${runId}`, email: email(who), password: PASSWORD }).expect(200)).body.accessToken;
      await markSteppedUp(tenantPrisma, token[who]);
    }
  }, 120_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const ids = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: ids } } });
        await tx.session.deleteMany({ where: { userId: { in: ids } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A, org.B] } } });
        await tx.user.deleteMany({ where: { id: { in: ids } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('only people with notification.template.manage (System Admin by default) reach the settings', async () => {
    await api('panelA', 'get', '/notifications/email').expect(403);
    await api('panelA', 'put', '/notifications/email/templates/password_reset').send(WORDING).expect(403);
    await request(app.getHttpServer()).get('/api/v1/notifications/email').expect(401);
    const overview = (await api('adminA', 'get', '/notifications/email').expect(200)).body;
    expect(overview.companyName).toBe(`Kaveri Foods ${runId}`);
    expect(overview.branding).toEqual({ showLogo: true, accentColor: null, senderName: null, replyTo: null });
    const reset = overview.emails.find((e: { type: string }) => e.type === 'password_reset');
    expect(reset).toMatchObject({ group: 'Your account', button: true, custom: null, variables: ['firstName', 'companyName', 'minutes'] });
    expect(reset.locked).toContain('Where the button goes');
  });

  it('refuses unknown placeholders, logic, markup, links and a missing button label; names each field', async () => {
    const bad = await api('adminA', 'put', '/notifications/email/templates/password_reset')
      .send({ ...WORDING, subject: 'Code {{code}}', heading: '{{#if firstName}}Hi{{/if}}', intro: 'Go to https://evil.test', buttonLabel: '', footer: '<b>HR</b>' })
      .expect(400);
    expect(Object.keys(bad.body.errors).sort()).toEqual(['buttonLabel', 'footer', 'heading', 'intro', 'subject']);
    await api('adminA', 'put', '/notifications/email/templates/sms_limit_reached').send({ ...WORDING, subject: 'Limit', heading: 'Limit' }).expect(400); // no button there
    await api('adminA', 'put', '/notifications/email/templates/not_a_type').send(WORDING).expect(404);
    await api('adminA', 'put', '/notifications/email/templates/password_reset').send({ ...WORDING, html: '<p>x</p>' }).expect(400);
    await api('adminA', 'put', '/notifications/email/templates/password_reset').send({ ...WORDING, subject: 'x'.repeat(151) }).expect(400);
  });

  it('saves the wording, audited with before and after; the real email uses it and keeps every locked part', async () => {
    const overview = (await api('adminA', 'put', '/notifications/email/templates/password_reset').send(WORDING).expect(200)).body;
    expect(overview.emails.find((e: { type: string }) => e.type === 'password_reset').custom).toEqual(WORDING);
    await api('adminA', 'put', '/notifications/email/templates/password_reset').send({ ...WORDING, footer: '' }).expect(200);
    const rows = await audit(org.A, 'notification.email_template.updated');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ actorUserId: users.adminA, metadata: { type: 'password_reset', language: 'en', before: null, after: WORDING } });
    expect(rows[1].metadata).toMatchObject({ before: WORDING, after: { ...WORDING, footer: '' } });

    sent.length = 0;
    await request(app.getHttpServer()).post('/api/v1/auth/forgot-password').send({ email: email('adminA') }).expect(200);
    await settle();
    const mail = sent.find((m) => m.to === email('adminA'))!;
    expect(mail.subject).toBe(`Reset your Kaveri Foods ${runId} password, Asha`);
    expect(mail.html).toContain('Hi Asha, the HR team at Kaveri Foods');
    expect(mail.html).toContain('Choose a password');
    expect(mail.html).toMatch(/href="[^"]*\/yx\/reset-password\/[0-9a-f]{64}"/);
    expect(mail.text).toContain('The link works once and expires in 15 minutes.');
    expect(mail.text).toContain("Didn't ask for this? Ignore this email; your password stays the same.");
    expect(mail.text).toContain('Button not working? Paste this link into your browser:');
    expect(mail.fromName).toBe(`Kaveri Foods ${runId} via YukthiX`);
  });

  it('one company never sees, changes or plants another company’s wording or branding (forced RLS)', async () => {
    const seenByB = (await api('adminB', 'get', '/notifications/email').expect(200)).body;
    expect(seenByB.emails.find((e: { type: string }) => e.type === 'password_reset').custom).toBeNull();
    const asB = { organizationId: org.B, isSuperAdmin: false };
    const tried = await tenantPrisma.forTenant(asB, async (tx) => ({
      read: await tx.emailTemplateOverride.count({ where: { organizationId: org.A } }),
      changed: await tx.$executeRaw`UPDATE email_template_overrides SET subject = 'pwned' WHERE organization_id = ${org.A}::uuid`,
      deleted: await tx.$executeRaw`DELETE FROM email_template_overrides WHERE organization_id = ${org.A}::uuid`,
    }));
    expect(tried).toEqual({ read: 0, changed: 0, deleted: 0 });
    await expect(tenantPrisma.forTenant(asB, (tx) => tx.emailBranding.create({ data: { organizationId: org.A, senderName: 'Evil' } }))).rejects.toThrow();
    // B's people still get YukthiX's wording.
    sent.length = 0;
    await request(app.getHttpServer()).post('/api/v1/auth/forgot-password').send({ email: email('adminB') }).expect(200);
    await settle();
    expect(sent.find((m) => m.to === email('adminB'))!.subject).toBe(`Reset your Godavari Agro ${runId} password`);
  });

  it('the database refuses markup and an unreadable or spoofing branding even if the API were bypassed', async () => {
    const asA = { organizationId: org.A, isSuperAdmin: false };
    await expect(tenantPrisma.forTenant(asA, (tx) => tx.emailTemplateOverride.create({ data: { organizationId: org.A, type: 'invite', subject: 'Hi', heading: '<script>', intro: '' } }))).rejects.toThrow();
    await expect(tenantPrisma.forTenant(asA, (tx) => tx.emailBranding.create({ data: { organizationId: org.A, senderName: 'x <a@b.c>' } }))).rejects.toThrow();
    await expect(tenantPrisma.forTenant(asA, (tx) => tx.emailBranding.create({ data: { organizationId: org.A, accentColor: 'red' } }))).rejects.toThrow();
  });

  it('branding: readable accent, a sender name that can’t pass as YukthiX, a valid reply-to; used on the next email', async () => {
    const good = { showLogo: true, accentColor: '#0b6e4f', senderName: 'Kaveri Foods HR', replyTo: 'HR@Kaveri.example' };
    const bad = await api('adminA', 'put', '/notifications/email/branding').send({ ...good, accentColor: '#FFD966', senderName: 'YukthiX Security' }).expect(400);
    expect(Object.keys(bad.body.errors).sort()).toEqual(['accentColor', 'senderName']);
    await api('adminA', 'put', '/notifications/email/branding').send({ ...good, senderName: 'Boss <ceo@evil.test>' }).expect(400);
    await api('adminA', 'put', '/notifications/email/branding').send({ ...good, replyTo: 'not an email' }).expect(400);
    const saved = (await api('adminA', 'put', '/notifications/email/branding').send(good).expect(200)).body;
    expect(saved.branding).toEqual({ ...good, accentColor: '#0B6E4F', replyTo: 'hr@kaveri.example' });
    const [row] = await audit(org.A, 'notification.email_branding.updated');
    expect(row.metadata).toMatchObject({ before: { senderName: null }, after: { senderName: 'Kaveri Foods HR' } });

    sent.length = 0;
    await request(app.getHttpServer()).post('/api/v1/auth/forgot-password').send({ email: email('adminA') }).expect(200);
    await settle();
    const mail = sent.find((m) => m.to === email('adminA'))!;
    expect(mail).toMatchObject({ fromName: 'Kaveri Foods HR via YukthiX', replyTo: 'hr@kaveri.example' });
    expect(mail.html).toContain('#0B6E4F');
  });

  it('preview shows the real email with the draft; a test goes only to the signed-in admin', async () => {
    const draft = { wording: { ...WORDING, intro: 'Draft intro for {{firstName}}.' }, branding: { showLogo: false, accentColor: '#7A1F5C', senderName: 'Kaveri People', replyTo: null } };
    const preview = (await api('adminA', 'post', '/notifications/email/templates/new_sign_in/preview').send({ wording: { subject: 'New sign-in', heading: 'Was it you, {{firstName}}?', intro: 'Seen on {{device}}.', buttonLabel: 'Not me', footer: '' } }).expect(200)).body;
    expect(preview.html).toContain('Was it you, Asha?');
    expect(preview.html).toContain('Seen on Chrome on Windows.');
    expect(preview.text).toContain('IP address: 203.0.113.9');
    expect(preview.text).toContain("If it wasn't, open My security");
    await api('adminA', 'post', '/notifications/email/templates/password_reset/preview').send({ wording: { ...WORDING, intro: '{{code}}' } }).expect(400);
    await api('panelA', 'post', '/notifications/email/templates/password_reset/preview').send(draft).expect(403);

    sent.length = 0;
    const test = (await api('adminA', 'post', '/notifications/email/templates/password_reset/test').send({ ...draft, to: 'someone@else.test' }).expect(400)).body;
    expect(test.message).toBeDefined(); // `to` is not accepted at all
    expect((await api('adminA', 'post', '/notifications/email/templates/password_reset/test').send(draft).expect(200)).body).toEqual({ to: email('adminA') });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: email('adminA'), subject: `Test: Reset your Kaveri Foods ${runId} password, Asha`, fromName: 'Kaveri People via YukthiX' });
    expect(sent[0].html).toContain('Draft intro for Asha.');
    expect(sent[0].html).toContain('#7A1F5C');
    // Nothing was saved by previewing or testing.
    const overview = (await api('adminA', 'get', '/notifications/email').expect(200)).body;
    expect(overview.branding.senderName).toBe('Kaveri Foods HR');
  });

  it('reset to the YukthiX wording, audited', async () => {
    const overview = (await api('adminA', 'delete', '/notifications/email/templates/password_reset').expect(200)).body;
    expect(overview.emails.find((e: { type: string }) => e.type === 'password_reset').custom).toBeNull();
    const [row] = await audit(org.A, 'notification.email_template.reset');
    expect(row.metadata).toMatchObject({ type: 'password_reset', before: { subject: WORDING.subject } });
    await api('adminA', 'delete', '/notifications/email/templates/password_reset').expect(200); // nothing to reset is fine
  });
});
