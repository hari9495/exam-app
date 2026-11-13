import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { CandidateJwtStrategy } from './candidate-jwt.strategy';
import { TenantPrismaService } from '@exam-platform/shared';

describe('CandidateJwtStrategy', () => {
  let strategy: CandidateJwtStrategy;
  let prisma: { invitation: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { invitation: { findUnique: jest.fn() } };
    process.env.CANDIDATE_JWT_ACCESS_SECRET = 'test-candidate-access-secret';

    const moduleRef = await Test.createTestingModule({
      // AS-0: invitations are under forced RLS; the strategy reads them as system work.
      providers: [CandidateJwtStrategy, { provide: TenantPrismaService, useValue: { forTenant: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn(prisma) } }],
    }).compile();
    strategy = moduleRef.get(CandidateJwtStrategy);
  });

  it('throws UnauthorizedException when subjectType is not candidate', async () => {
    await expect(
      strategy.validate({ sub: 'inv-1', subjectType: 'staff' as never, familyId: 'family-1' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when the invitation no longer exists', async () => {
    prisma.invitation.findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'inv-1', subjectType: 'candidate', familyId: 'family-1' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when the token family no longer matches the invitation active session', async () => {
    prisma.invitation.findUnique.mockResolvedValue({ activeSessionFamilyId: 'family-old' });

    await expect(
      strategy.validate({ sub: 'inv-1', subjectType: 'candidate', familyId: 'family-new' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('returns the invitation id when the family matches the current active session', async () => {
    prisma.invitation.findUnique.mockResolvedValue({ activeSessionFamilyId: 'family-1' });

    const result = await strategy.validate({ sub: 'inv-1', subjectType: 'candidate', familyId: 'family-1' });

    expect(result).toEqual({ invitationId: 'inv-1' });
    expect(prisma.invitation.findUnique).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      select: { activeSessionFamilyId: true },
    });
  });
});
