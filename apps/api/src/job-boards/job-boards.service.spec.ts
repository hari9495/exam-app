import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JobBoardsService } from './job-boards.service';
import { TenantPrismaService, AuditService, OrgSecretsCryptoService } from '@exam-platform/shared';

describe('JobBoardsService', () => {
  let service: JobBoardsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let crypto: { encrypt: jest.Mock; decrypt: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    crypto = {
      encrypt: jest.fn().mockImplementation((s: string) => `enc(${s})`),
      decrypt: jest.fn().mockImplementation((s: string) => s.replace(/^enc\((.*)\)$/, '$1')),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        JobBoardsService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
        { provide: OrgSecretsCryptoService, useValue: crypto },
      ],
    }).compile();
    service = moduleRef.get(JobBoardsService);
    process.env.API_ORIGIN = 'https://api.example.com';
  });

  function knownRequestError(code: string) {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code, clientVersion: 'test' });
  }

  describe('list', () => {
    it('returns each board with its feedUrl and publishedJobCount', async () => {
      const tx = {
        jobBoard: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'board-1', name: 'LinkedIn', feedToken: 'tok-1', organizationId: 'org-1', provider: 'xml_feed', configEncrypted: null },
            { id: 'board-2', name: 'Indeed', feedToken: 'tok-2', organizationId: 'org-1', provider: 'xml_feed', configEncrypted: null },
          ]),
        },
        jobBoardPublication: {
          groupBy: jest.fn().mockResolvedValue([{ jobBoardId: 'board-1', _count: { _all: 3 } }]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.list(context);

      expect(tx.jobBoard.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org-1' } }));
      expect(result).toEqual([
        { id: 'board-1', name: 'LinkedIn', feedToken: 'tok-1', organizationId: 'org-1', provider: 'xml_feed', feedUrl: 'https://api.example.com/api/v1/public/job-boards/tok-1/feed.xml', publishedJobCount: 3, configured: true },
        { id: 'board-2', name: 'Indeed', feedToken: 'tok-2', organizationId: 'org-1', provider: 'xml_feed', feedUrl: 'https://api.example.com/api/v1/public/job-boards/tok-2/feed.xml', publishedJobCount: 0, configured: true },
      ]);
    });

    it('returns an empty list without querying publication counts', async () => {
      const tx = { jobBoard: { findMany: jest.fn().mockResolvedValue([]) }, jobBoardPublication: { groupBy: jest.fn() } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.list(context);

      expect(result).toEqual([]);
      expect(tx.jobBoardPublication.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('mints a unique feedToken and audits the creation', async () => {
      const tx = { jobBoard: { create: jest.fn().mockResolvedValue({ id: 'board-1', name: 'LinkedIn', feedToken: 'tok-1', organizationId: 'org-1' }) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.create(context, 'user-1', { name: 'LinkedIn' });

      expect(tx.jobBoard.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', name: 'LinkedIn', feedToken: expect.any(String) },
      });
      expect(result).toEqual(
        expect.objectContaining({ id: 'board-1', name: 'LinkedIn', feedUrl: 'https://api.example.com/api/v1/public/job-boards/tok-1/feed.xml', publishedJobCount: 0 }),
      );
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'job_board.created', entityId: 'board-1' }));
    });

    it('rejects a blank name without hitting the database', async () => {
      await expect(service.create(context, 'user-1', { name: '   ' })).rejects.toThrow(BadRequestException);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });

    it('surfaces a duplicate name as a conflict', async () => {
      const tx = { jobBoard: { create: jest.fn().mockRejectedValue(knownRequestError('P2002')) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.create(context, 'user-1', { name: 'LinkedIn' })).rejects.toThrow(ConflictException);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('renames an existing board and audits the update', async () => {
      const tx = {
        jobBoard: {
          findFirst: jest.fn().mockResolvedValue({ id: 'board-1', name: 'Old Name', feedToken: 'tok-1', organizationId: 'org-1' }),
          update: jest.fn().mockResolvedValue({ id: 'board-1', name: 'New Name', feedToken: 'tok-1', organizationId: 'org-1' }),
        },
        jobBoardPublication: { count: jest.fn().mockResolvedValue(2) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.update(context, 'user-1', 'board-1', { name: 'New Name' });

      expect(tx.jobBoard.update).toHaveBeenCalledWith({ where: { id: 'board-1' }, data: { name: 'New Name' } });
      expect(result).toEqual(
        expect.objectContaining({ id: 'board-1', name: 'New Name', feedUrl: 'https://api.example.com/api/v1/public/job-boards/tok-1/feed.xml', publishedJobCount: 2 }),
      );
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'job_board.updated', entityId: 'board-1' }));
    });

    it('throws when the board does not exist', async () => {
      const tx = { jobBoard: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.update(context, 'user-1', 'missing', { name: 'New Name' })).rejects.toThrow(NotFoundException);
    });

    it('rejects a blank name without renaming', async () => {
      const tx = {
        jobBoard: {
          findFirst: jest.fn().mockResolvedValue({ id: 'board-1', name: 'Old Name', feedToken: 'tok-1', organizationId: 'org-1' }),
          update: jest.fn(),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.update(context, 'user-1', 'board-1', { name: '   ' })).rejects.toThrow(BadRequestException);
      expect(tx.jobBoard.update).not.toHaveBeenCalled();
    });

    it('surfaces a duplicate name as a conflict', async () => {
      const tx = {
        jobBoard: {
          findFirst: jest.fn().mockResolvedValue({ id: 'board-1', name: 'Old Name', feedToken: 'tok-1', organizationId: 'org-1' }),
          update: jest.fn().mockRejectedValue(knownRequestError('P2002')),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.update(context, 'user-1', 'board-1', { name: 'Taken Name' })).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('deletes an existing board and audits the deletion', async () => {
      const tx = {
        jobBoard: {
          findFirst: jest.fn().mockResolvedValue({ id: 'board-1', name: 'LinkedIn', feedToken: 'tok-1', organizationId: 'org-1' }),
          delete: jest.fn().mockResolvedValue({ id: 'board-1' }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.remove(context, 'user-1', 'board-1');

      expect(tx.jobBoard.delete).toHaveBeenCalledWith({ where: { id: 'board-1' } });
      expect(result).toEqual({ id: 'board-1' });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'job_board.deleted', entityId: 'board-1' }));
    });

    it('throws when the board does not exist', async () => {
      const tx = { jobBoard: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.remove(context, 'user-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listProviders', () => {
    it('returns the paid providers with their config field metadata', () => {
      const out = service.listProviders();
      expect(out.map((p) => p.id)).toEqual(['linkedin', 'indeed', 'http']);
      const http = out.find((p) => p.id === 'http')!;
      expect(http.configFields.some((f) => f.key === 'postUrl')).toBe(true);
    });
  });

  describe('putBoardConfig', () => {
    it('encrypts a valid http config and marks the board configured', async () => {
      tenantPrisma.forTenant.mockImplementation((_c, fn) =>
        fn({ jobBoard: { findFirst: jest.fn().mockResolvedValue({ id: 'b1', organizationId: 'org-1', provider: 'xml_feed', configEncrypted: null }), update: jest.fn().mockResolvedValue({}) } }),
      );
      const out = await service.putBoardConfig(context as any, 'user-1', 'b1', {
        provider: 'http',
        config: { postUrl: 'https://boards.example.com', bodyTemplate: '{"t":"{{title}}"}', authHeader: 'Bearer k' },
      });
      expect(crypto.encrypt).toHaveBeenCalled();
      // The stored blob is what got encrypted; the secret authHeader is present in it.
      expect(JSON.parse(crypto.encrypt.mock.calls[0][0])).toMatchObject({ postUrl: 'https://boards.example.com', authHeader: 'Bearer k' });
      expect(out.provider).toBe('http');
    });

    it('keeps an unchanged secret (blank-on-PUT) by merging onto the existing blob', async () => {
      const existing = 'enc(' + JSON.stringify({ postUrl: 'https://boards.example.com', bodyTemplate: '{}', authHeader: 'Bearer OLD' }) + ')';
      tenantPrisma.forTenant.mockImplementation((_c, fn) =>
        fn({ jobBoard: { findFirst: jest.fn().mockResolvedValue({ id: 'b1', organizationId: 'org-1', provider: 'http', configEncrypted: existing }), update: jest.fn().mockResolvedValue({}) } }),
      );
      // authHeader omitted -> keep 'Bearer OLD'; bodyTemplate changed.
      await service.putBoardConfig(context as any, 'user-1', 'b1', { provider: 'http', config: { postUrl: 'https://boards.example.com', bodyTemplate: '{"t":"{{title}}"}' } });
      expect(JSON.parse(crypto.encrypt.mock.calls[0][0]).authHeader).toBe('Bearer OLD');
    });

    it('rejects an invalid config (SSRF-guarded url) without writing', async () => {
      const update = jest.fn();
      tenantPrisma.forTenant.mockImplementation((_c, fn) =>
        fn({ jobBoard: { findFirst: jest.fn().mockResolvedValue({ id: 'b1', organizationId: 'org-1', provider: 'xml_feed', configEncrypted: null }), update } }),
      );
      await expect(
        service.putBoardConfig(context as any, 'user-1', 'b1', { provider: 'http', config: { postUrl: 'http://localhost/x', bodyTemplate: '{}' } }),
      ).rejects.toThrow(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });

    it('reverting to xml_feed clears the stored config', async () => {
      const update = jest.fn().mockResolvedValue({});
      tenantPrisma.forTenant.mockImplementation((_c, fn) =>
        fn({ jobBoard: { findFirst: jest.fn().mockResolvedValue({ id: 'b1', organizationId: 'org-1', provider: 'http', configEncrypted: 'enc({})' }), update } }),
      );
      const out = await service.putBoardConfig(context as any, 'user-1', 'b1', { provider: 'xml_feed' });
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { provider: 'xml_feed', configEncrypted: null } }));
      expect(out).toEqual({ provider: 'xml_feed', configured: true, config: {} });
    });
  });

  describe('getBoardConfig', () => {
    it('returns non-secret fields only and never the secret', async () => {
      const stored = 'enc(' + JSON.stringify({ postUrl: 'https://boards.example.com', bodyTemplate: '{}', authHeader: 'Bearer SECRET' }) + ')';
      tenantPrisma.forTenant.mockImplementation((_c, fn) =>
        fn({ jobBoard: { findFirst: jest.fn().mockResolvedValue({ id: 'b1', organizationId: 'org-1', provider: 'http', configEncrypted: stored }) } }),
      );
      const out = await service.getBoardConfig(context as any, 'b1');
      expect(out.config.postUrl).toBe('https://boards.example.com');
      expect(out.config.authHeader).toBeUndefined(); // secret stripped
      expect(out.configured).toBe(true);
    });
  });
});
