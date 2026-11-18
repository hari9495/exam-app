import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';

// Retiring /v2 (answers 2420-2438), the settings that moved into YukthiX Settings, against the real database (forced
// RLS, app role): positive and negative per gap.
describe('Retired /v2 settings in YukthiX Settings', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  const org: Record<string, string> = {};
  const stage: Record<string, string> = {};
  let planId = '';
  const call = (who: string, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => request(app.getHttpServer())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const at = <T>(k: string, fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org[k]!, isSuperAdmin: false }, fn);

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    planId = (await prisma.plan.create({ data: { name: `rv2-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B']) {
      const slug = `rv2-${k.toLowerCase()}-${run}`;
      org[k] = (await prisma.organization.create({ data: { name: `RV2 ${k} ${run}`, slug, planId } })).id;
      for (const [who, role] of (k === 'A' ? [['admin', 'org_admin'], ['plain', 'panel']] : [['admin', 'org_admin']]) as [string, string][]) {
        const email = `${who}-${k.toLowerCase()}-${run}@rv2.test`;
        users[`${who}${k}`] = (await at(k, (tx) => tx.user.create({ data: { organizationId: org[k]!, email, name: `${who} ${k}`, passwordHash, role } }))).id;
        token[`${who}${k}`] = (await request(app.getHttpServer()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
      }
      stage[k] = await at(k, async (tx) => {
        const p = await tx.pipeline.create({ data: { organizationId: org[k]!, name: 'Standard', isDefault: true } });
        return (await tx.pipelineStage.create({ data: { organizationId: org[k]!, pipelineId: p.id, name: 'interview', category: 'active', position: 1 } })).id;
      });
    }
    token.acting = (await call('adminA', 'post', `/auth/impersonate/${users.plainA}`).expect(200)).body.accessToken;
  }, 180_000);

  afterAll(async () => {
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  // Answer 2434: the stage message templates on 6.1 Hiring.
  describe('6.1 stage message templates (2434)', () => {
    it('lists the standard wording, saves the company copy for a stage and audits before and after', async () => {
      const list = (await call('adminA', 'get', '/candidate-sms-templates').expect(200)).body as { id: string | null; name: string; triggerStageId: string | null }[];
      expect(list).toContainEqual(expect.objectContaining({ id: null, name: 'Moving to interview', triggerStageId: stage.A }));
      const made = (await call('adminA', 'post', '/candidate-sms-templates').send({ name: 'Interview', triggerStageId: stage.A, triggerMode: 'auto', body: 'Hi {{candidateName}}', enabled: true }).expect(201)).body;
      await call('adminA', 'patch', `/candidate-sms-templates/${made.id}`).send({ name: 'Interview call', triggerStageId: stage.A, triggerMode: 'prompt', body: 'Hi', enabled: false }).expect(200);
      const logs = await at('A', (tx) => tx.auditLog.findMany({ where: { action: 'candidate_sms_template.saved', entityId: made.id }, orderBy: { createdAt: 'asc' } }));
      expect(logs.map((l) => JSON.parse(l.metadataJson ?? '{}'))).toEqual([
        expect.objectContaining({ before: null, after: expect.objectContaining({ name: 'Interview', triggerMode: 'auto', enabled: true }) }),
        expect.objectContaining({ before: expect.objectContaining({ name: 'Interview', triggerMode: 'auto' }), after: expect.objectContaining({ name: 'Interview call', triggerMode: 'prompt', enabled: false }) }),
      ]);
      // A repeat for the same stage updates the one row (no duplicate).
      await call('adminA', 'post', '/candidate-sms-templates').send({ name: 'Interview again', triggerStageId: stage.A, triggerMode: 'manual', body: 'Hi' }).expect(201);
      expect(await at('A', (tx) => tx.candidateSmsTemplate.count({ where: { triggerStageId: stage.A } }))).toBe(1);
      // Email and WhatsApp the same way.
      await call('adminA', 'post', '/candidate-email-templates').send({ name: 'Welcome', triggerStageId: null, triggerMode: 'manual', subject: 'Hello', body: 'Hi' }).expect(201);
      await call('adminA', 'post', '/candidate-whatsapp-templates').send({ name: 'Nudge', triggerStageId: stage.A, triggerMode: 'prompt', body: 'Hi' }).expect(201);
    });

    it('negative: another company’s stage, bad input, no pipeline key, acting for someone else, another company’s template', async () => {
      await call('adminA', 'post', '/candidate-email-templates').send({ name: 'X', triggerStageId: stage.B, triggerMode: 'auto', subject: 'S', body: 'B' }).expect(400);
      await call('adminA', 'post', '/candidate-whatsapp-templates').send({ name: 'X', triggerStageId: randomUUID(), triggerMode: 'auto', body: 'B' }).expect(400);
      await call('adminA', 'post', '/candidate-sms-templates').send({ name: 'X', triggerStageId: null, triggerMode: 'sometimes', body: 'B' }).expect(400);
      await call('adminA', 'post', '/candidate-sms-templates').send({ name: 'X', triggerStageId: null, triggerMode: 'manual', body: 'x'.repeat(1601) }).expect(400);
      await call('plainA', 'get', '/candidate-sms-templates').expect(403);
      await call('plainA', 'post', '/candidate-sms-templates').send({ name: 'X', triggerStageId: null, triggerMode: 'manual', body: 'B' }).expect(403);
      await call('acting', 'post', '/candidate-sms-templates').send({ name: 'X', triggerStageId: null, triggerMode: 'manual', body: 'B' }).expect(403);
      const mine = await at('A', (tx) => tx.candidateSmsTemplate.findFirstOrThrow({ where: { triggerStageId: stage.A } }));
      await call('adminB', 'patch', `/candidate-sms-templates/${mine.id}`).send({ name: 'Taken', triggerStageId: null, triggerMode: 'manual', body: 'B' }).expect(404);
      await call('adminB', 'delete', `/candidate-sms-templates/${mine.id}`).expect(404);
      expect((await call('adminB', 'get', '/candidate-sms-templates').expect(200)).body.some((t: { id: string | null }) => t.id === mine.id)).toBe(false);
      expect(await at('A', (tx) => tx.candidateEmailTemplate.count({ where: { triggerStageId: stage.B } }))).toBe(0);
    });
  });

  // Answers 2423 and 2510: interview hours for self-booking on 6.1 Hiring.
  describe('6.1 interview hours (2423, 2510)', () => {
    it('defaults 09:30 to 18:30, Monday to Friday; the admin changes them (audited); the other company keeps its own', async () => {
      expect((await call('adminA', 'get', '/hiring/settings').expect(200)).body.values).toMatchObject({ 'hiring.interview_hours.from': '09:30', 'hiring.interview_hours.to': '18:30', 'hiring.interview_hours.days': 'mon,tue,wed,thu,fri' });
      const after = (await call('adminA', 'put', '/hiring/settings').send({ changes: [{ key: 'hiring.interview_hours.from', value: '10:00' }, { key: 'hiring.interview_hours.days', value: 'mon,tue,wed,thu,fri,sat' }] }).expect(200)).body;
      expect(after.values).toMatchObject({ 'hiring.interview_hours.from': '10:00', 'hiring.interview_hours.to': '18:30', 'hiring.interview_hours.days': 'mon,tue,wed,thu,fri,sat' });
      const logged = await at('A', (tx) => tx.auditLog.findMany({ where: { organizationId: org.A! } }));
      expect(logged.map((l) => l.metadataJson ?? '').join(' ')).toContain('hiring.interview_hours.from');
      expect((await call('adminB', 'get', '/hiring/settings').expect(200)).body.values['hiring.interview_hours.from']).toBe('09:30');
    });

    it('negative: an end before the start (even against the stored start), an odd minute, no day, a bad day, no key, acting', async () => {
      await call('adminA', 'put', '/hiring/settings').send({ changes: [{ key: 'hiring.interview_hours.to', value: '09:30' }] }).expect(400);
      const odd = await call('adminA', 'put', '/hiring/settings').send({ changes: [{ key: 'hiring.interview_hours.from', value: '09:15' }] }).expect(400);
      expect(odd.body.message).toBe('Choose a time on the hour or half hour, like 09:30.');
      await call('adminA', 'put', '/hiring/settings').send({ changes: [{ key: 'hiring.interview_hours.days', value: '' }] }).expect(400);
      await call('adminA', 'put', '/hiring/settings').send({ changes: [{ key: 'hiring.interview_hours.days', value: 'mon,funday' }] }).expect(400);
      await call('plainA', 'put', '/hiring/settings').send({ changes: [{ key: 'hiring.interview_hours.from', value: '08:00' }] }).expect(403);
      await call('acting', 'put', '/hiring/settings').send({ changes: [{ key: 'hiring.interview_hours.from', value: '08:00' }] }).expect(403);
      expect((await call('adminA', 'get', '/hiring/settings').expect(200)).body.values).toMatchObject({ 'hiring.interview_hours.from': '10:00', 'hiring.interview_hours.to': '18:30' });
    });
  });

  // Answer 2424: the pass certificate section on 6.5 Assessments.
  describe('6.5 pass certificate (2424)', () => {
    it('reads the standard wording, saves the company copy (audited before and after); the other company keeps the standard', async () => {
      expect((await call('adminA', 'get', '/certificate-template').expect(200)).body).toMatchObject({ isDefault: true, enabled: true });
      await call('adminA', 'put', '/certificate-template').send({ title: 'Certificate of Merit', bodyText: 'Well done {{candidateName}}', signatoryName: 'Meenakshi', enabled: true }).expect(200);
      await call('adminA', 'put', '/certificate-template').send({ title: 'Certificate of Merit', bodyText: 'Well done', enabled: false }).expect(200);
      expect((await call('adminA', 'get', '/certificate-template').expect(200)).body).toEqual({ title: 'Certificate of Merit', bodyText: 'Well done', signatoryName: null, enabled: false, isDefault: false });
      const logs = await at('A', (tx) => tx.auditLog.findMany({ where: { action: 'certificate_template.saved' }, orderBy: { createdAt: 'asc' } }));
      expect(logs.map((l) => JSON.parse(l.metadataJson ?? '{}'))).toEqual([
        { before: null, after: { title: 'Certificate of Merit', bodyText: 'Well done {{candidateName}}', signatoryName: 'Meenakshi', enabled: true } },
        { before: { title: 'Certificate of Merit', bodyText: 'Well done {{candidateName}}', signatoryName: 'Meenakshi', enabled: true }, after: { title: 'Certificate of Merit', bodyText: 'Well done', signatoryName: null, enabled: false } },
      ]);
      expect((await call('adminB', 'get', '/certificate-template').expect(200)).body.isDefault).toBe(true);
    });

    it('negative: an empty title, too long a text, no key, acting for someone else', async () => {
      await call('adminA', 'put', '/certificate-template').send({ title: '', bodyText: 'x' }).expect(400);
      await call('adminA', 'put', '/certificate-template').send({ title: 'T', bodyText: 'x'.repeat(4001) }).expect(400);
      await call('plainA', 'get', '/certificate-template').expect(403);
      await call('plainA', 'put', '/certificate-template').send({ title: 'T', bodyText: 'x' }).expect(403);
      await call('acting', 'put', '/certificate-template').send({ title: 'T', bodyText: 'x' }).expect(403);
      expect((await call('adminA', 'get', '/certificate-template').expect(200)).body.title).toBe('Certificate of Merit');
    });
  });

  // Answer 2422: the logo and brand colour on Settings 1.1.
  describe('1.1 logo and brand colour (2422)', () => {
    const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
    it('uploads a real PNG and saves a colour, each audited with before and after; the other company keeps its own', async () => {
      const up = (await call('adminA', 'post', '/organizations/branding/logo').attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' }).expect(201)).body;
      expect(up.logoUrl).toBeTruthy();
      await call('adminA', 'patch', '/organizations/branding').send({ primaryColor: '#1F6F5C' }).expect(200);
      expect((await call('adminA', 'get', '/organizations/branding').expect(200)).body.primaryColor).toBe('#1F6F5C');
      const logs = await at('A', (tx) => tx.auditLog.findMany({ where: { action: { in: ['organization.logo_updated', 'organization.branding_updated'] } }, orderBy: { createdAt: 'asc' } }));
      const meta = logs.map((l) => JSON.parse(l.metadataJson ?? '{}'));
      expect(meta[0]).toMatchObject({ before: null, after: expect.stringContaining('logos/') });
      expect(meta[1]).toMatchObject({ before: { primaryColor: null }, after: { primaryColor: '#1F6F5C' } });
      expect((await call('adminB', 'get', '/organizations/branding').expect(200)).body).toMatchObject({ logoUrl: null, primaryColor: null });
    });

    it('negative: an SVG, HTML named .png, a bad colour, no key, acting for someone else', async () => {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      expect((await call('adminA', 'post', '/organizations/branding/logo').attach('file', svg, { filename: 'logo.svg', contentType: 'image/svg+xml' }).expect(400)).body.message).toBe('Logo must be a PNG or JPEG image');
      await call('adminA', 'post', '/organizations/branding/logo').attach('file', Buffer.from('<html>hi</html>'), { filename: 'logo.png', contentType: 'image/png' }).expect(400);
      await call('adminA', 'patch', '/organizations/branding').send({ primaryColor: 'blue' }).expect(400);
      await call('plainA', 'patch', '/organizations/branding').send({ primaryColor: '#000000' }).expect(403);
      await call('acting', 'patch', '/organizations/branding').send({ primaryColor: '#000000' }).expect(403);
      await call('acting', 'post', '/organizations/branding/logo').attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' }).expect(403);
      expect((await call('adminA', 'get', '/organizations/branding').expect(200)).body.primaryColor).toBe('#1F6F5C');
    });
  });

  // Answer 2434 follow-up: the board's "ask before sending" prompt, answered "Don't send".
  describe('board stage message prompt: skip (2434)', () => {
    const entry: Record<string, string> = {};
    beforeAll(async () => {
      for (const k of ['A', 'B'])
        entry[k] = await at(k, async (tx) => {
          const job = await tx.job.create({ data: { organizationId: org[k]!, title: `Prompt ${run}`, status: 'open', createdById: users[`admin${k}`]! } });
          const cand = await tx.candidate.create({ data: { organizationId: org[k]!, email: `cand-${k.toLowerCase()}-${run}@rv2.test`, name: `Cand ${k}` } });
          return (await tx.pipelineEntry.create({ data: { organizationId: org[k]!, jobId: job.id, candidateId: cand.id, enteredVia: 'manual' } })).id;
        });
    });

    it('records a skipped message with its channel and template', async () => {
      expect((await call('adminA', 'post', `/hiring/entries/${entry.A}/stage-message/skip`).send({ channel: 'sms', templateId: null }).expect(200)).body).toEqual({ skipped: true });
      const logs = await at('A', (tx) => tx.auditLog.findMany({ where: { action: 'ats.stage_message.skipped', entityId: entry.A! } }));
      expect(logs.map((l) => JSON.parse(l.metadataJson ?? '{}'))).toEqual([{ channel: 'sms', templateId: null }]);
    });

    it('negative: a bad channel, no pipeline key, acting for someone else, another company’s application', async () => {
      await call('adminA', 'post', `/hiring/entries/${entry.A}/stage-message/skip`).send({ channel: 'fax' }).expect(400);
      await call('plainA', 'post', `/hiring/entries/${entry.A}/stage-message/skip`).send({ channel: 'email' }).expect(403);
      await call('acting', 'post', `/hiring/entries/${entry.A}/stage-message/skip`).send({ channel: 'email' }).expect(403);
      await call('adminA', 'post', `/hiring/entries/${entry.B}/stage-message/skip`).send({ channel: 'email' }).expect(404);
      expect(await at('B', (tx) => tx.auditLog.count({ where: { action: 'ats.stage_message.skipped' } }))).toBe(0);
    });
  });

  // Answer 2429: the hiring emails on Settings 5.4 Notifications.
  describe('5.4 hiring emails (2429)', () => {
    it('interview email: the list carries the standard wording; the company copy is audited with before and after', async () => {
      const list = (await call('adminA', 'get', '/interview-email-templates').expect(200)).body as { eventType: string; subject: string | null; defaultSubject: string }[];
      expect(list.find((e) => e.eventType === 'invite')).toMatchObject({ subject: null, defaultSubject: expect.stringContaining('Interview invitation') });
      await call('adminA', 'put', '/interview-email-templates/invite').send({ subject: 'You are invited', body: 'Hi {{candidateName}}', enabled: true }).expect(200);
      await call('adminA', 'put', '/interview-email-templates/invite').send({ subject: 'You are invited', body: 'Hello', enabled: false }).expect(200);
      const logs = await at('A', (tx) => tx.auditLog.findMany({ where: { action: 'interview_email_template.saved' }, orderBy: { createdAt: 'asc' } }));
      expect(logs.map((l) => JSON.parse(l.metadataJson ?? '{}'))).toEqual([
        { eventType: 'invite', before: null, after: { subject: 'You are invited', body: 'Hi {{candidateName}}', enabled: true } },
        { eventType: 'invite', before: { subject: 'You are invited', body: 'Hi {{candidateName}}', enabled: true }, after: { subject: 'You are invited', body: 'Hello', enabled: false } },
      ]);
      expect((await call('adminB', 'get', '/interview-email-templates').expect(200)).body.find((e: { eventType: string }) => e.eventType === 'invite').subject).toBeNull();
    });

    it('approval email and sender address: saved by the admin; bad input, no key and acting are refused; another company cannot touch them', async () => {
      await call('adminA', 'put', '/approval-email-templates/approval.requested').send({ subject: '{{actorName}} asks you', body: 'Open {{link}}' }).expect(200);
      await call('adminA', 'put', '/approval-email-templates/approval.requested').send({ subject: '', body: 'x' }).expect(400);
      await call('adminA', 'put', '/approval-email-templates/approval.unknown').send({ subject: 'S', body: 'B' }).expect(400);
      await call('plainA', 'put', '/approval-email-templates/approval.requested').send({ subject: 'S', body: 'B' }).expect(403);
      await call('acting', 'put', '/interview-email-templates/invite').send({ subject: 'S', body: 'B' }).expect(403);
      const made = (await call('adminA', 'post', '/org-sender-addresses').send({ label: 'Careers', address: `careers-${run}@rv2.test`, isDefault: true }).expect(201)).body;
      await call('adminA', 'post', '/org-sender-addresses').send({ label: 'Bad', address: 'not-an-email' }).expect(400);
      await call('plainA', 'post', '/org-sender-addresses').send({ label: 'X', address: `x-${run}@rv2.test` }).expect(403);
      await call('acting', 'post', '/org-sender-addresses').send({ label: 'X', address: `y-${run}@rv2.test` }).expect(403);
      await call('adminB', 'patch', `/org-sender-addresses/${made.id}`).send({ label: 'Taken' }).expect(404);
      await call('adminB', 'delete', `/org-sender-addresses/${made.id}`).expect(404);
      expect((await call('adminA', 'get', '/org-sender-addresses').expect(200)).body).toEqual([expect.objectContaining({ id: made.id, label: 'Careers', isDefault: true })]);
    });
  });

  // Answer 2425: candidate and job custom fields on /yx/settings/custom-fields.
  describe('custom fields for candidates and jobs (2425)', () => {
    it('a candidate field is made, changed and archived, each audited with before and after; the other company never sees it', async () => {
      const made = (await call('adminA', 'post', '/custom-fields').send({ entityType: 'candidate', label: 'Notice period', fieldType: 'number', required: true, showOnApply: true }).expect(201)).body;
      await call('adminA', 'patch', `/custom-fields/${made.id}`).send({ label: 'Notice period (days)', required: false }).expect(200);
      await call('adminA', 'delete', `/custom-fields/${made.id}`).expect(200);
      const logs = await at('A', (tx) => tx.auditLog.findMany({ where: { entityId: made.id }, orderBy: { createdAt: 'asc' } }));
      expect(logs.map((l) => l.action)).toEqual(['custom_field.created', 'custom_field.updated', 'custom_field.archived']);
      const upd = JSON.parse(logs[1]!.metadataJson ?? '{}');
      expect(upd.before).toMatchObject({ label: 'Notice period', required: true, showOnApply: true });
      expect(upd.after).toMatchObject({ label: 'Notice period (days)', required: false });
      expect((await call('adminB', 'get', '/custom-fields?entityType=candidate').expect(200)).body).toEqual([]);
    });

    it('negative: an employee field cannot be reached here, bad input, no key, acting, another company', async () => {
      const emp = (await call('adminA', 'post', '/people/custom-fields').send({ entityType: 'employee', label: 'Shoe size', fieldType: 'text' }).expect(201)).body;
      await call('adminA', 'patch', `/custom-fields/${emp.id}`).send({ label: 'Hacked' }).expect(404);
      await call('adminA', 'post', '/custom-fields').send({ entityType: 'employee', label: 'X', fieldType: 'text' }).expect(400);
      await call('adminA', 'post', '/custom-fields').send({ entityType: 'job', label: 'Grade', fieldType: 'select', options: [] }).expect(400);
      await call('plainA', 'post', '/custom-fields').send({ entityType: 'job', label: 'Y', fieldType: 'text' }).expect(403);
      await call('acting', 'post', '/custom-fields').send({ entityType: 'job', label: 'Z', fieldType: 'text' }).expect(403);
      const job = (await call('adminA', 'post', '/custom-fields').send({ entityType: 'job', label: 'Cost centre', fieldType: 'text' }).expect(201)).body;
      await call('adminB', 'patch', `/custom-fields/${job.id}`).send({ label: 'Taken' }).expect(404);
      expect((await call('adminA', 'get', '/custom-fields?entityType=job').expect(200)).body.map((f: { label: string }) => f.label)).toEqual(['Cost centre']);
    });
  });
});
