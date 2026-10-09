import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID, createHmac } from 'crypto';
import * as http from 'http';
import { AppModule } from '../src/app.module';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';

// The org webhook must be a public https endpoint (checked at save time), and the worker re-checks the
// resolved address before every delivery (SSRF guard). The test receiver is a local http server, so:
// the org is configured with a reserved, never-resolving public-looking https host; the delivery-time
// guard treats exactly that host as public (a stand-in for DNS -- every other target still goes through
// the real guard); and fetch() to exactly that URL is forwarded, unchanged, to the local receiver.
const PUBLIC_WEBHOOK_URL = 'https://webhooks.example.test/exam-events';
jest.mock('../src/integrations/webhook-url-allowlist', () => {
  const actual = jest.requireActual('../src/integrations/webhook-url-allowlist');
  return {
    ...actual,
    assertPublicWebhookTarget: (url: string) =>
      url === 'https://webhooks.example.test/exam-events' ? Promise.resolve() : actual.assertPublicWebhookTarget(url),
  };
});

// Exercises the real enqueue -> BullMQ worker -> signed HTTP POST flow end to end
// (Task 10's public-api.e2e-spec.ts never configures a webhookUrl, so that path has
// only ever been unit-tested with mocks). Requires live Redis (WebhookDeliveryWorkerService
// runs a real BullMQ Worker against REDIS_URL, same as every other e2e spec that boots
// AppModule) and a live DB, both already required by the rest of this e2e suite.
describe('Webhook delivery HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let orgSlug: string;
  let recruiterAccessToken: string;
  let orgAdminAccessToken: string;
  let webhookSecret: string;
  let candidateId: string;
  let examId: string;
  let invitationId: string;

  let receiverServer: http.Server;
  let fetchSpy: jest.SpyInstance;
  let receiverPort: number;
  const receivedRequests: Array<{ rawBody: string; signature: string | undefined }> = [];

  const fakeEmailService = {
    send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/fake' }),
  };

  beforeAll(async () => {
    receiverServer = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        receivedRequests.push({
          rawBody: Buffer.concat(chunks).toString('utf8'),
          signature: req.headers['x-webhook-signature'] as string | undefined,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true }));
      });
    });
    await new Promise<void>((resolve) => receiverServer.listen(0, '127.0.0.1', () => resolve()));
    receiverPort = (receiverServer.address() as { port: number }).port;
    const realFetch = global.fetch;
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation((input, init) =>
        String(input) === PUBLIC_WEBHOOK_URL ? realFetch(`http://127.0.0.1:${receiverPort}`, init) : realFetch(input, init),
      );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue(fakeEmailService)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-webhook-delivery-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    orgSlug = `ci-webhook-delivery-org-${randomUUID()}`;
    const org = await prisma.organization.create({ data: { name: 'CI Webhook Delivery Org', slug: orgSlug, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-webhook-delivery.test', passwordHash: recruiterHash, role: 'recruiter' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@ci-webhook-delivery.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
      ]),
    );

    recruiterAccessToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: orgSlug, email: 'recruiter@ci-webhook-delivery.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    orgAdminAccessToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: orgSlug, email: 'orgadmin@ci-webhook-delivery.test', password: 'OrgAdminPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    // Configure the webhook URL + secret via the same org-admin endpoints apps/web's
    // Integrations page uses, exactly like a real customer would. A plain-http / loopback target is
    // refused outright.
    await request(app.getHttpServer())
      .patch('/api/v1/organizations/integrations/webhook')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .send({ url: `http://127.0.0.1:${receiverPort}` })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/v1/organizations/integrations/webhook')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .send({ url: PUBLIC_WEBHOOK_URL })
      .expect(200);

    const secretResponse = await request(app.getHttpServer())
      .post('/api/v1/organizations/integrations/webhook-secret')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(201);
    webhookSecret = secretResponse.body.webhookSecret;
    expect(webhookSecret).toMatch(/^[0-9a-f]{64}$/);

    // Seed a candidate + published exam, then invite -- the invite is what fires the
    // real invitation.created webhook enqueue (invitations.service.ts).
    const candidateResponse = await request(app.getHttpServer())
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email: 'bob@ci-webhook-delivery.test', name: 'Bob Example' })
      .expect(201);
    candidateId = candidateResponse.body.id;

    const examResponse = await request(app.getHttpServer())
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Webhook Delivery Screening' })
      .expect(201);
    examId = examResponse.body.id;

    const sectionResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);
    const sectionId = sectionResponse.body.id;

    const questionResponse = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'true_false',
        text: 'Is this a webhook delivery test question?',
        difficulty: 'easy',
        marks: 1,
        options: [
          { text: 'True', isCorrect: true },
          { text: 'False', isCorrect: false },
        ],
      })
      .expect(201);
    const questionId = questionResponse.body.id;

    await request(app.getHttpServer())
      .put(`/api/v1/exams/${examId}/sections/${sectionId}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionId] })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    const inviteResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [candidateId] })
      .expect(201);
    invitationId = inviteResponse.body.created[0].id;
  }, 30000);

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.webhookDelivery.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.invitation.deleteMany({ where: { examId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.exam.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.question.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.candidate.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } }));
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
    await new Promise<void>((resolve) => receiverServer.close(() => resolve()));
    fetchSpy.mockRestore();
  });

  it('delivers invitation.created to the configured webhook URL with a verifiable signature', async () => {
    // The worker picks the job up asynchronously via BullMQ -- poll the delivery row
    // until it settles instead of assuming a fixed delay.
    const deadline = Date.now() + 20000;
    let delivery: { status: string; eventType: string; payloadJson: string } | null = null;
    while (Date.now() < deadline) {
      delivery = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
        tx.webhookDelivery.findFirst({ where: { organizationId: orgId, eventType: 'invitation.created' } }),
      );
      if (delivery && delivery.status === 'delivered') {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const expectedPayload = {
      id: invitationId,
      examId,
      candidateId,
      status: 'invited',
      subject: 'bob@ci-webhook-delivery.test',
      examTitle: 'Webhook Delivery Screening',
      linkPath: '/candidates',
    };
    expect(delivery).not.toBeNull();
    expect(delivery!.status).toBe('delivered');
    expect(JSON.parse(delivery!.payloadJson)).toEqual(expectedPayload);

    expect(receivedRequests).toHaveLength(1);
    const received = receivedRequests[0];
    expect(received.rawBody).toBe(delivery!.payloadJson);
    expect(JSON.parse(received.rawBody)).toEqual(expectedPayload);

    const expectedSignature = createHmac('sha256', webhookSecret).update(received.rawBody).digest('hex');
    expect(received.signature).toBe(expectedSignature);
  }, 25000);
});
