import { Test } from '@nestjs/testing';
import { SamlController } from './saml.controller';
import { PrismaService } from '@exam-platform/shared';
import { SamlStrategy } from './saml.strategy';
import { randomBytes, createHash } from 'crypto';
// Imported the same way saml.controller.ts imports it, to prove that import
// style actually preserves `passport.authenticate` (see the comment on that
// import in saml.controller.ts / saml.strategy.ts).
import passport = require('passport');

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomBytes: jest.fn(),
}));

describe('SamlController', () => {
  let controller: SamlController;
  let prisma: { organization: { findUnique: jest.Mock }; ssoLoginCode: { create: jest.Mock } };
  let samlStrategy: { generateMetadata: jest.Mock };

  beforeEach(async () => {
    prisma = { organization: { findUnique: jest.fn() }, ssoLoginCode: { create: jest.fn() } };
    samlStrategy = { generateMetadata: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [SamlController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: SamlStrategy, useValue: samlStrategy },
      ],
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

  describe('callback (passport.authenticate wiring)', () => {
    it('imports passport.authenticate as a real function, not undefined', () => {
      // Regression test: `import * as passport` compiles to a namespace copy
      // that drops methods living on passport's prototype (see the import
      // comment). If that regression reappears, this fails before the
      // route handler even runs.
      expect(typeof passport.authenticate).toBe('function');
    });

    it('does not throw "passport.authenticate is not a function" when the route handler runs', async () => {
      const req = { params: { organizationSlug: 'acme' } };
      const res = { redirect: jest.fn() };

      // A bare mock req/res has no registered 'saml' strategy or passport
      // session state, so this cannot complete a full SSO handshake -- the
      // point is only to prove `passport.authenticate(...)` is callable via
      // this file's import, not to exercise a successful SAML login.
      let caught: unknown;
      try {
        await controller.callback(req as any, res as any);
      } catch (err) {
        caught = err;
      }

      if (caught instanceof TypeError) {
        expect(caught.message).not.toMatch(/passport\.authenticate is not a function/);
      }
    });
  });

  describe('metadata', () => {
    it('returns the generated SP metadata XML with an XML content type', () => {
      samlStrategy.generateMetadata.mockImplementation((_req, callback) => callback(null, '<EntityDescriptor />'));
      const req = { params: { organizationSlug: 'acme' } };
      const res = { set: jest.fn(), send: jest.fn(), status: jest.fn().mockReturnThis() };

      controller.metadata(req as any, res as any);

      expect(res.set).toHaveBeenCalledWith('Content-Type', 'application/xml');
      expect(res.send).toHaveBeenCalledWith('<EntityDescriptor />');
    });

    it('responds 400 when metadata generation fails', () => {
      samlStrategy.generateMetadata.mockImplementation((_req, callback) => callback(new Error('boom')));
      const req = { params: { organizationSlug: 'acme' } };
      const res = { set: jest.fn(), send: jest.fn(), status: jest.fn().mockReturnThis() };

      controller.metadata(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith('Could not generate metadata for this organization');
    });
  });
});
