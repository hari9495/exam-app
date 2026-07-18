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
    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: 'smtp.customer.test',
      port: 465,
      auth: { user: 'customer-user', pass: 'customer-smtp-password' },
    });
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ from: 'no-reply@customer.test', to: 'a@b.com' }));
  });

  it('falls back to the platform transporter when no organizationId is given', async () => {
    const result = await service.send({ to: 'a@b.com', subject: 'Test', html: '<p>Test</p>' });

    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    expect(mockCreateTestAccount).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ from: 'no-reply@exam-platform.test' }));
    expect(result.success).toBe(true);
  });

  it('falls back to the platform transporter when the given organizationId has no SMTP configured', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      smtpHost: null,
      smtpPort: null,
      smtpUser: null,
      smtpPasswordEncrypted: null,
      emailFromAddress: null,
    });

    const result = await service.send({ to: 'a@b.com', subject: 'Test', html: '<p>Test</p>', organizationId: 'org-1' });

    expect(cryptoService.decrypt).not.toHaveBeenCalled();
    expect(mockCreateTestAccount).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('caches the platform transporter across multiple sends (built only once)', async () => {
    await service.send({ to: 'a@b.com', subject: 'Test', html: '<p>Test</p>' });
    await service.send({ to: 'c@d.com', subject: 'Test 2', html: '<p>Test 2</p>' });

    expect(mockCreateTestAccount).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledTimes(2);
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
});
