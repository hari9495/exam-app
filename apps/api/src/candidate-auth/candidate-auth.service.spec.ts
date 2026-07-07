import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { CandidateAuthService } from './candidate-auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

describe('CandidateAuthService', () => {
  let service: CandidateAuthService;
  let prisma: {
    invitation: { findUnique: jest.Mock };
    candidateRefreshToken: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
  };
  let tenantPrisma: { forTenant: jest.Mock };
  let jwt: JwtService;

  beforeEach(async () => {
    prisma = {
      invitation: { findUnique: jest.fn() },
      candidateRefreshToken: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    };
    tenantPrisma = { forTenant: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CandidateAuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        JwtService,
      ],
    }).compile();

    service = moduleRef.get(CandidateAuthService);
    jwt = moduleRef.get(JwtService);
    process.env.CANDIDATE_JWT_ACCESS_SECRET = 'test-candidate-access-secret';
    process.env.CANDIDATE_JWT_REFRESH_SECRET = 'test-candidate-refresh-secret';
  });

  describe('redeem', () => {
    it('throws NotFoundException when the token does not resolve to an invitation', async () => {
      prisma.invitation.findUnique.mockResolvedValue(null);

      await expect(service.redeem('bad-token')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when the invitation was revoked', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-1', status: 'revoked', expiresAt: new Date(Date.now() + 86_400_000), examId: 'exam-1',
      });

      await expect(service.redeem('token')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the invitation has expired', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-1', status: 'invited', expiresAt: new Date(Date.now() - 1000), examId: 'exam-1',
      });

      await expect(service.redeem('token')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the exam is not published', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-1', status: 'invited', expiresAt: new Date(Date.now() + 86_400_000), examId: 'exam-1',
      });
      tenantPrisma.forTenant.mockResolvedValue({ id: 'exam-1', status: 'draft' });

      await expect(service.redeem('token')).rejects.toThrow(BadRequestException);
    });

    it('issues a candidate access and refresh token pair for a valid, live invitation to a published exam', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-1', status: 'invited', expiresAt: new Date(Date.now() + 86_400_000), examId: 'exam-1',
      });
      tenantPrisma.forTenant.mockResolvedValue({ id: 'exam-1', status: 'published' });
      prisma.candidateRefreshToken.create.mockResolvedValue({});

      const result = await service.redeem('token');

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      const decoded = jwt.decode(result.accessToken) as { sub: string; subjectType: string };
      expect(decoded.sub).toBe('inv-1');
      expect(decoded.subjectType).toBe('candidate');
    });
  });

  describe('refresh', () => {
    it('throws UnauthorizedException for a refresh token that fails signature verification', async () => {
      await expect(service.refresh('not-a-real-jwt')).rejects.toThrow(UnauthorizedException);
    });

    it('rotates and revokes the whole family on reuse of an already-rotated/unknown token', async () => {
      const refreshToken = jwt.sign({ sub: 'inv-1', familyId: 'family-1' }, { secret: process.env.CANDIDATE_JWT_REFRESH_SECRET });
      prisma.candidateRefreshToken.findFirst.mockResolvedValue(null);

      await expect(service.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);
      expect(prisma.candidateRefreshToken.updateMany).toHaveBeenCalledWith({
        where: { invitationId: 'inv-1', familyId: 'family-1' },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('issues a new token pair on a valid, unrevoked refresh token', async () => {
      const refreshToken = jwt.sign({ sub: 'inv-1', familyId: 'family-1' }, { secret: process.env.CANDIDATE_JWT_REFRESH_SECRET });
      const tokenHash = await argon2.hash(refreshToken);
      prisma.candidateRefreshToken.findFirst.mockResolvedValue({ id: 'crt-1', tokenHash, revokedAt: null });
      prisma.candidateRefreshToken.update.mockResolvedValue({});
      prisma.candidateRefreshToken.create.mockResolvedValue({});
      prisma.invitation.findUnique.mockResolvedValue({ id: 'inv-1', status: 'invited' });

      const result = await service.refresh(refreshToken);

      expect(result.accessToken).toEqual(expect.any(String));
      expect(prisma.candidateRefreshToken.update).toHaveBeenCalledWith({
        where: { id: 'crt-1' },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('revokes the token family and throws UnauthorizedException when the underlying invitation was revoked', async () => {
      const refreshToken = jwt.sign({ sub: 'inv-1', familyId: 'family-1' }, { secret: process.env.CANDIDATE_JWT_REFRESH_SECRET });
      const tokenHash = await argon2.hash(refreshToken);
      prisma.candidateRefreshToken.findFirst.mockResolvedValue({ id: 'crt-1', tokenHash, revokedAt: null });
      prisma.candidateRefreshToken.update.mockResolvedValue({});
      prisma.invitation.findUnique.mockResolvedValue({ id: 'inv-1', status: 'revoked' });

      await expect(service.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);
      expect(prisma.candidateRefreshToken.updateMany).toHaveBeenCalledWith({
        where: { invitationId: 'inv-1', familyId: 'family-1' },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('logout', () => {
    it('revokes the refresh token family', async () => {
      const refreshToken = jwt.sign({ sub: 'inv-1', familyId: 'family-1' }, { secret: process.env.CANDIDATE_JWT_REFRESH_SECRET });

      await service.logout(refreshToken);

      expect(prisma.candidateRefreshToken.updateMany).toHaveBeenCalledWith({
        where: { invitationId: 'inv-1', familyId: 'family-1' },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('does nothing when given an invalid refresh token', async () => {
      await service.logout('not-a-real-jwt');

      expect(prisma.candidateRefreshToken.updateMany).not.toHaveBeenCalled();
    });
  });
});
