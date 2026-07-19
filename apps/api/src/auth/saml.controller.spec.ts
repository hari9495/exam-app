import { Test } from '@nestjs/testing';
import { SamlController } from './saml.controller';
import { PrismaService } from '@exam-platform/shared';
import { randomBytes, createHash } from 'crypto';

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomBytes: jest.fn(),
}));

describe('SamlController', () => {
  let controller: SamlController;
  let prisma: { organization: { findUnique: jest.Mock }; ssoLoginCode: { create: jest.Mock } };

  beforeEach(async () => {
    prisma = { organization: { findUnique: jest.fn() }, ssoLoginCode: { create: jest.fn() } };
    const moduleRef = await Test.createTestingModule({
      controllers: [SamlController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();
    controller = moduleRef.get(SamlController);
  });

  describe('status', () => {
    it('returns enabled:true when the org has SSO configured', async () => {
      prisma.organization.findUnique.mockResolvedValue({ samlEnabled: true });

      const result = await controller.status('acme');

      expect(result).toEqual({ enabled: true });
      expect(prisma.organization.findUnique).toHaveBeenCalledWith({ where: { slug: 'acme' }, select: { samlEnabled: true } });
    });

    it('returns enabled:false when the org does not exist', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      const result = await controller.status('unknown');

      expect(result).toEqual({ enabled: false });
    });
  });

  describe('handleAuthCallback (the passport.authenticate callback body)', () => {
    it('mints a hashed SsoLoginCode and redirects with the raw code on a successful match', async () => {
      (randomBytes as jest.Mock).mockReturnValue(Buffer.from('a'.repeat(32)));
      prisma.ssoLoginCode.create.mockResolvedValue({ id: 'code-row-1' });
      const res = { redirect: jest.fn() };

      await controller.handleAuthCallback(null, { id: 'user-1', email: 'alice@acme.test', role: 'recruiter', organizationId: 'org-1' }, undefined, res as any);

      const expectedRawCode = Buffer.from('a'.repeat(32)).toString('hex');
      const expectedHash = createHash('sha256').update(expectedRawCode).digest('hex');
      expect(prisma.ssoLoginCode.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1', codeHash: expectedHash }) }),
      );
      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining(`code=${expectedRawCode}`));
    });

    it('redirects with ssoError=not_provisioned when no user matched', async () => {
      const res = { redirect: jest.fn() };

      await controller.handleAuthCallback(null, false, { message: 'not_provisioned' }, res as any);

      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('ssoError=not_provisioned'));
      expect(prisma.ssoLoginCode.create).not.toHaveBeenCalled();
    });

    it('hardcodes not_provisioned and ignores whatever info.message actually contains', async () => {
      const res = { redirect: jest.fn() };

      await controller.handleAuthCallback(null, false, { message: 'user is a member of the wrong department' }, res as any);

      const redirectUrl = res.redirect.mock.calls[0][0] as string;
      expect(redirectUrl).toContain('ssoError=not_provisioned');
      expect(redirectUrl).not.toContain('wrong department');
    });

    it('redirects with ssoError=invalid_response when passport itself errors', async () => {
      const res = { redirect: jest.fn() };

      await controller.handleAuthCallback(new Error('signature validation failed'), undefined, undefined, res as any);

      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('ssoError=invalid_response'));
      expect(prisma.ssoLoginCode.create).not.toHaveBeenCalled();
    });

    it('redirects with ssoError=invalid_response instead of rejecting when ssoLoginCode.create fails', async () => {
      (randomBytes as jest.Mock).mockReturnValue(Buffer.from('a'.repeat(32)));
      prisma.ssoLoginCode.create.mockRejectedValue(new Error('connection terminated'));
      const res = { redirect: jest.fn() };

      await expect(
        controller.handleAuthCallback(null, { id: 'user-1', email: 'alice@acme.test', role: 'recruiter', organizationId: 'org-1' }, undefined, res as any),
      ).resolves.toBeUndefined();

      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('ssoError=invalid_response'));
    });
  });
});
