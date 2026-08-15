const mockVerify = jest.fn();
const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn((..._args: unknown[]) => ({ verify: mockVerify, sendMail: mockSendMail }));
const mockCreateTestAccount = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: (...args: unknown[]) => mockCreateTransport(...args),
  createTestAccount: (...args: unknown[]) => mockCreateTestAccount(...args),
  getTestMessageUrl: jest.fn(() => undefined),
}));

import { EmailService } from './email.service';
import { PrismaService, OrgSecretsCryptoService } from '@exam-platform/shared';

describe('EmailService', () => {
  let service: EmailService;
  let prisma: { organization: { findUnique: jest.Mock } };
  let cryptoService: { decrypt: jest.Mock };

  // resolvePlatformFrom() reads SMTP_FROM_ADDRESS || SMTP_USER || the .test fallback, and
  // ConfigModule loads apps/api/.env into process.env before the suite runs. A developer with
  // real SMTP credentials in their .env therefore had SMTP_USER shadow the fallback, failing
  // the platform-From assertions on their machine but not in CI. Clearing all three per test
  // makes every case state the environment it is actually asserting about.
  const savedEnv = {
    host: process.env.SMTP_HOST,
    user: process.env.SMTP_USER,
    from: process.env.SMTP_FROM_ADDRESS,
  };
  function restoreEnvVar(name: 'SMTP_HOST' | 'SMTP_USER' | 'SMTP_FROM_ADDRESS', value: string | undefined) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  afterAll(() => {
    restoreEnvVar('SMTP_HOST', savedEnv.host);
    restoreEnvVar('SMTP_USER', savedEnv.user);
    restoreEnvVar('SMTP_FROM_ADDRESS', savedEnv.from);
  });

  beforeEach(() => {
    mockCreateTransport.mockClear();
    mockSendMail.mockReset().mockResolvedValue({});
    mockVerify.mockReset();
    mockCreateTestAccount.mockReset().mockResolvedValue({
      user: 'ethereal-user',
      pass: 'ethereal-pass',
      smtp: { host: 'smtp.ethereal.email', port: 587, secure: false },
    });
    prisma = { organization: { findUnique: jest.fn() } };
    cryptoService = { decrypt: jest.fn() };
    service = new EmailService(prisma as never, cryptoService as never);
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_FROM_ADDRESS;
  });

  it('uses the org-specific SMTP transporter and from-address when the org has one configured', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      smtpHost: 'smtp.customer.test',
      smtpPort: 465,
      smtpUser: 'customer-user',
      smtpPasswordEncrypted: 'encrypted-blob',
      emailFromAddress: 'no-reply@customer.test',
    });
    cryptoService.decrypt.mockReturnValue('customer-smtp-password');

    await service.send({ to: 'a@b.com', subject: 'Test', html: '<p>Test</p>', organizationId: 'org-1' });

    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      select: { smtpHost: true, smtpPort: true, smtpUser: true, smtpPasswordEncrypted: true, emailFromAddress: true },
    });
    expect(cryptoService.decrypt).toHaveBeenCalledWith('encrypted-blob');
    // This fixture is port 465 -- implicit TLS -- and the assertion used to omit
    // `secure`, i.e. it pinned the very bug that made 465 hang: a plaintext
    // socket to a TLS-only port, no greeting, no error, just a stall until the
    // gateway timed out. `secure: true` here is the fix, not cosmetics.
    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.customer.test',
        port: 465,
        secure: true,
        auth: { user: 'customer-user', pass: 'customer-smtp-password' },
      }),
    );
    // And the wait is bounded, so an unreachable host reports an error instead
    // of hanging until nginx returns a bare 504.
    const opts = mockCreateTransport.mock.calls[0][0] as { connectionTimeout: number; greetingTimeout: number };
    expect(opts.connectionTimeout).toBeGreaterThan(0);
    expect(opts.connectionTimeout + opts.greetingTimeout).toBeLessThan(60_000);
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ from: 'no-reply@customer.test', to: 'a@b.com' }));
  });

  // These two previously asserted `success: true` for the Ethereal fallback. That assertion IS
  // the bug: in production it let 24 emails -- including org-admin and platform-admin setup
  // links -- report success while going to a throwaway inbox nobody reads.
  it('refuses to send, and reports failure, when no organizationId is given and no platform SMTP exists', async () => {
    const result = await service.send({ to: 'a@b.com', subject: 'Test', html: '<p>Test</p>' });

    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    // Not merely "reported a failure" -- nothing was transmitted. The Ethereal fallback relays
    // the message to a third-party service whose preview URLs are readable by anyone with the
    // link, and these messages carry password-setup links.
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('refuses to send when the given organizationId has no SMTP configured', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      smtpHost: null,
      smtpPort: null,
      smtpUser: null,
      smtpPasswordEncrypted: null,
      emailFromAddress: null,
    });

    const result = await service.send({ to: 'a@b.com', subject: 'Test', html: '<p>Test</p>', organizationId: 'org-1' });

    expect(cryptoService.decrypt).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  describe('ALLOW_UNDELIVERABLE_EMAIL escape hatch', () => {
    afterEach(() => {
      delete process.env.ALLOW_UNDELIVERABLE_EMAIL;
    });

    it('sends via the Ethereal preview inbox when explicitly opted in', async () => {
      process.env.ALLOW_UNDELIVERABLE_EMAIL = 'true';

      const result = await service.send({ to: 'a@b.com', subject: 'Test', html: '<p>Test</p>' });

      expect(mockCreateTestAccount).toHaveBeenCalledTimes(1);
      expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ from: 'no-reply@exam-platform.test' }));
      expect(result.success).toBe(true);
    });

    it('is opt-in by exact value, so a stray truthy string does not enable it', async () => {
      // Guards the production case specifically: this must not be switched on by accident.
      process.env.ALLOW_UNDELIVERABLE_EMAIL = '1';

      const result = await service.send({ to: 'a@b.com', subject: 'Test', html: '<p>Test</p>' });

      expect(result.success).toBe(false);
      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });

  it('caches the platform transporter across multiple sends (built only once)', async () => {
    process.env.ALLOW_UNDELIVERABLE_EMAIL = 'true';
    try {
      await service.send({ to: 'a@b.com', subject: 'Test', html: '<p>Test</p>' });
      await service.send({ to: 'c@d.com', subject: 'Test 2', html: '<p>Test 2</p>' });

      expect(mockCreateTestAccount).toHaveBeenCalledTimes(1);
      expect(mockSendMail).toHaveBeenCalledTimes(2);
    } finally {
      delete process.env.ALLOW_UNDELIVERABLE_EMAIL;
    }
  });

  it("caches a given organization's transporter across multiple sends (built only once)", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      smtpHost: 'smtp.customer.test',
      smtpPort: 465,
      smtpUser: 'customer-user',
      smtpPasswordEncrypted: 'encrypted-blob',
      emailFromAddress: 'no-reply@customer.test',
    });
    cryptoService.decrypt.mockReturnValue('customer-smtp-password');

    await service.send({ to: 'a@b.com', subject: 'Test', html: '<p>Test</p>', organizationId: 'org-1' });
    await service.send({ to: 'c@d.com', subject: 'Test 2', html: '<p>Test 2</p>', organizationId: 'org-1' });

    expect(mockCreateTransport).toHaveBeenCalledTimes(1);
    expect(prisma.organization.findUnique).toHaveBeenCalledTimes(2);
  });

  // The outer beforeEach clears SMTP_HOST/SMTP_USER/SMTP_FROM_ADDRESS and afterAll restores
  // the developer's real values, so these cases only set what they assert on.
  describe('platform From address', () => {
    it('sends as the authenticated mailbox rather than the unroutable .test fallback', async () => {
      // Office365 rejects a From that is not the authenticated mailbox with
      // 550 5.7.60 SendAsDenied, so the hardcoded no-reply@exam-platform.test
      // would have failed every send once real SMTP credentials were set.
      process.env.SMTP_HOST = 'smtp.office365.com';
      process.env.SMTP_USER = 'prudenthire-noreply@prudentconsulting.com';
      prisma.organization.findUnique.mockResolvedValue(null);

      await service.send({ to: 'a@b.com', subject: 's', html: '<p>h</p>' });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'prudenthire-noreply@prudentconsulting.com' }),
      );
    });

    it('prefers an explicit SMTP_FROM_ADDRESS when one is set', async () => {
      process.env.SMTP_HOST = 'smtp.office365.com';
      process.env.SMTP_USER = 'prudenthire-noreply@prudentconsulting.com';
      process.env.SMTP_FROM_ADDRESS = 'careers@prudentconsulting.com';
      prisma.organization.findUnique.mockResolvedValue(null);

      await service.send({ to: 'a@b.com', subject: 's', html: '<p>h</p>' });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'careers@prudentconsulting.com' }),
      );
    });
  });

    it('falls back to the org mailbox, not the platform address, when the org set no From', async () => {
      // "From address" is optional in the settings UI, so this is the common
      // case. Sending as the platform address while authenticated as the org's
      // mailbox is rejected with 550 5.7.60 SendAsDenied.
      prisma.organization.findUnique.mockResolvedValue({
        smtpHost: 'smtp.office365.com',
        smtpPort: 587,
        smtpUser: 'org-mailbox@customer.test',
        smtpPasswordEncrypted: 'encrypted-blob',
        emailFromAddress: null,
      });

      await service.send({ to: 'a@b.com', subject: 's', html: '<p>h</p>', organizationId: 'org-1' });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'org-mailbox@customer.test' }),
      );
    });
});
