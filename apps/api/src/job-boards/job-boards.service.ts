import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma, JobBoard } from '@prisma/client';
import { TenantPrismaService, TenantContext, AuditService, OrgSecretsCryptoService } from '@exam-platform/shared';
import { UpsertJobBoardDto } from './dto/upsert-job-board.dto';
import { PutJobBoardConfigDto } from './dto/put-job-board-config.dto';
import { getJobBoardProvider, listJobBoardProviders, JobBoardConfigField } from './providers';

// configEncrypted is a secret blob and must never leave the service -- Omit it from every response.
export type JobBoardWithStats = Omit<JobBoard, 'configEncrypted'> & { feedUrl: string; publishedJobCount: number; configured: boolean };

export interface JobBoardConfigResponse {
  provider: string;
  configured: boolean;
  config: Record<string, unknown>; // non-secret fields only
}

function buildFeedUrl(feedToken: string): string {
  // Mirrors the SAML SP URL idiom (auth/saml.strategy.ts spUrls()): the feed is
  // a NestJS route served at the API origin under the global 'api/v1' prefix,
  // not a Next.js page under FRONTEND_URL.
  return `${process.env.API_ORIGIN}/api/v1/public/job-boards/${feedToken}/feed.xml`;
}

@Injectable()
export class JobBoardsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly crypto: OrgSecretsCryptoService,
  ) {}

  // Is this board's paid-provider config present AND valid? (Free xml_feed boards are always "ready".)
  private isConfigured(board: Pick<JobBoard, 'provider' | 'configEncrypted'>): boolean {
    if (board.provider === 'xml_feed') return true;
    const adapter = getJobBoardProvider(board.provider);
    if (!adapter || !board.configEncrypted) return false;
    try {
      adapter.validateConfig(JSON.parse(this.crypto.decrypt(board.configEncrypted)) as Record<string, unknown>);
      return true;
    } catch {
      return false;
    }
  }

  private toStats(board: JobBoard, publishedJobCount: number): JobBoardWithStats {
    // Strip the secret blob; expose only whether it's configured.
    const { configEncrypted: _drop, ...rest } = board;
    return { ...rest, feedUrl: buildFeedUrl(board.feedToken), publishedJobCount, configured: this.isConfigured(board) };
  }

  async list(context: TenantContext): Promise<JobBoardWithStats[]> {
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const boards = await tx.jobBoard.findMany({ where: { organizationId: orgId }, orderBy: { name: 'asc' } });
      if (boards.length === 0) return [];
      const counts = await tx.jobBoardPublication.groupBy({ by: ['jobBoardId'], where: { organizationId: orgId }, _count: { _all: true } });
      const countByBoard = new Map(counts.map((c: { jobBoardId: string; _count: { _all: number } }) => [c.jobBoardId, c._count._all]));
      return boards.map((b: JobBoard) => this.toStats(b, countByBoard.get(b.id) ?? 0));
    });
  }

  /** Metadata for the paid providers, for the settings UI to render config forms. */
  listProviders(): { id: string; label: string; configFields: JobBoardConfigField[] }[] {
    return listJobBoardProviders().map((p) => ({ id: p.id, label: p.label, configFields: p.configFields }));
  }

  async getBoardConfig(context: TenantContext, id: string): Promise<JobBoardConfigResponse> {
    const orgId = context.organizationId as string;
    const board = await this.tenantPrisma.forTenant(context, (tx) => tx.jobBoard.findFirst({ where: { id, organizationId: orgId } }));
    if (!board) throw new NotFoundException(`Job board ${id} not found`);
    const adapter = getJobBoardProvider(board.provider);
    let config: Record<string, unknown> = {};
    if (adapter && board.configEncrypted) {
      try {
        const stored = JSON.parse(this.crypto.decrypt(board.configEncrypted)) as Record<string, unknown>;
        // Never return secret fields; the UI shows them blank and only re-sends a changed value.
        const secretKeys = new Set(adapter.configFields.filter((f) => f.secret).map((f) => f.key));
        for (const [k, v] of Object.entries(stored)) if (!secretKeys.has(k)) config[k] = v;
      } catch {
        config = {};
      }
    }
    return { provider: board.provider, configured: this.isConfigured(board), config };
  }

  async putBoardConfig(context: TenantContext, actorUserId: string, id: string, dto: PutJobBoardConfigDto): Promise<JobBoardConfigResponse> {
    const orgId = context.organizationId as string;
    const board = await this.tenantPrisma.forTenant(context, (tx) => tx.jobBoard.findFirst({ where: { id, organizationId: orgId } }));
    if (!board) throw new NotFoundException(`Job board ${id} not found`);

    const provider = dto.provider ?? board.provider;
    if (provider === 'xml_feed') {
      // Reverting to a free feed board clears any stored paid config.
      await this.tenantPrisma.forTenant(context, (tx) => tx.jobBoard.update({ where: { id }, data: { provider, configEncrypted: null } }));
      await this.audit.record(context, { actorUserId, action: 'job_board.configured', entityType: 'job_board', entityId: id, metadata: { provider } });
      return { provider, configured: true, config: {} };
    }

    const adapter = getJobBoardProvider(provider);
    if (!adapter) throw new BadRequestException(`Unknown job-board provider: ${provider}`);

    // Provider change starts from an empty blob; same-provider edit merges onto the existing one so
    // untouched secret fields (sent blank) keep their stored value -- the putSmsConfig pattern.
    const existing: Record<string, unknown> =
      board.provider === provider && board.configEncrypted
        ? (() => {
            try {
              return JSON.parse(this.crypto.decrypt(board.configEncrypted)) as Record<string, unknown>;
            } catch {
              return {};
            }
          })()
        : {};
    const merged = { ...existing, ...(dto.config ?? {}) };
    for (const field of adapter.configFields) {
      if (field.secret) {
        const incoming = (dto.config ?? {})[field.key];
        if (incoming === undefined || incoming === null || (typeof incoming === 'string' && incoming.trim() === '')) {
          if (existing[field.key] !== undefined) merged[field.key] = existing[field.key];
          else delete merged[field.key];
        }
      }
    }
    adapter.validateConfig(merged);

    await this.tenantPrisma.forTenant(context, (tx) =>
      tx.jobBoard.update({ where: { id }, data: { provider, configEncrypted: this.crypto.encrypt(JSON.stringify(merged)) } }),
    );
    await this.audit.record(context, { actorUserId, action: 'job_board.configured', entityType: 'job_board', entityId: id, metadata: { provider } });
    // Build the response from what we just wrote (no re-read); strip secret fields.
    const secretKeys = new Set(adapter.configFields.filter((f) => f.secret).map((f) => f.key));
    const publicConfig: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(merged)) if (!secretKeys.has(k)) publicConfig[k] = v;
    return { provider, configured: true, config: publicConfig };
  }

  async create(context: TenantContext, actorUserId: string, dto: UpsertJobBoardDto): Promise<JobBoardWithStats> {
    const name = dto.name?.trim();
    if (!name) {
      throw new BadRequestException('Board name is required');
    }
    const orgId = context.organizationId as string;
    const feedToken = randomUUID();
    let created: JobBoard;
    try {
      created = await this.tenantPrisma.forTenant(context, (tx) =>
        tx.jobBoard.create({ data: { organizationId: orgId, name, feedToken } }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`A job board named "${name}" already exists`);
      }
      throw error;
    }
    await this.audit.record(context, { actorUserId, action: 'job_board.created', entityType: 'job_board', entityId: created.id, metadata: { name } });
    return this.toStats(created, 0);
  }

  async update(context: TenantContext, actorUserId: string, id: string, dto: UpsertJobBoardDto): Promise<JobBoardWithStats> {
    const orgId = context.organizationId as string;
    const existing = await this.tenantPrisma.forTenant(context, (tx) => tx.jobBoard.findFirst({ where: { id, organizationId: orgId } }));
    if (!existing) {
      throw new NotFoundException(`Job board ${id} not found`);
    }
    let name: string | undefined;
    if (dto.name !== undefined) {
      name = dto.name.trim();
      if (!name) {
        throw new BadRequestException('Board name is required');
      }
    }
    let updated: JobBoard;
    try {
      updated = await this.tenantPrisma.forTenant(context, (tx) =>
        tx.jobBoard.update({ where: { id }, data: { ...(name !== undefined ? { name } : {}) } }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`A job board named "${name}" already exists`);
      }
      throw error;
    }
    await this.audit.record(context, { actorUserId, action: 'job_board.updated', entityType: 'job_board', entityId: id, metadata: { name } });
    const publishedJobCount = await this.tenantPrisma.forTenant(context, (tx) => tx.jobBoardPublication.count({ where: { jobBoardId: id } }));
    return this.toStats(updated, publishedJobCount);
  }

  async remove(context: TenantContext, actorUserId: string, id: string): Promise<{ id: string }> {
    const orgId = context.organizationId as string;
    const existing = await this.tenantPrisma.forTenant(context, (tx) => tx.jobBoard.findFirst({ where: { id, organizationId: orgId } }));
    if (!existing) {
      throw new NotFoundException(`Job board ${id} not found`);
    }
    // JobBoardPublication rows cascade via the FK (onDelete: Cascade, see T1) -- no manual cleanup.
    await this.tenantPrisma.forTenant(context, (tx) => tx.jobBoard.delete({ where: { id } }));
    await this.audit.record(context, { actorUserId, action: 'job_board.deleted', entityType: 'job_board', entityId: id, metadata: { name: existing.name } });
    return { id };
  }
}
