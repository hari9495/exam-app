import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { organization: { findUnique: jest.Mock }; refreshToken: { create: jest.Mock } };
  let tenantPrisma: { forTenant: jest.Mock };
  let jwt: JwtService;

  beforeEach(async () => {
    prisma = {
      organization: { findUnique: jest.fn() },
      refreshToken: { create: jest.fn() },
    };
    tenantPrisma = { forTenant: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        JwtService,
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    jwt = moduleRef.get(JwtService);
    process.env.JWT_ACCESS_SECRET = 'test-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  });

  it('rejects login when the org slug does not resolve', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);

    await expect(
      service.login({ organizationSlug: 'no-such-org', email: 'a@b.com', password: 'x' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects login on a wrong password', async () => {
    const passwordHash = await argon2.hash('correct-password');
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });
    tenantPrisma.forTenant.mockResolvedValue({
      id: 'user-1', organizationId: 'org-1', role: 'org_admin', passwordHash,
    });

    await expect(
      service.login({ organizationSlug: 'demo-org', email: 'admin@demo-org.test', password: 'wrong-password' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('issues an access and refresh token on correct credentials', async () => {
    const passwordHash = await argon2.hash('correct-password');
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });
    tenantPrisma.forTenant.mockResolvedValueOnce({
      id: 'user-1', organizationId: 'org-1', role: 'org_admin', passwordHash,
    });
    tenantPrisma.forTenant.mockResolvedValueOnce(undefined);
    prisma.refreshToken.create.mockResolvedValue({});

    const result = await service.login({
      organizationSlug: 'demo-org', email: 'admin@demo-org.test', password: 'correct-password',
    });

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    const decoded = jwt.decode(result.accessToken) as { organizationId: string; role: string };
    expect(decoded.organizationId).toBe('org-1');
    expect(decoded.role).toBe('org_admin');
  });
});
