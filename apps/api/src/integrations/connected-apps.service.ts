import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext, TenantPrismaService, AuditService, OrgSecretsCryptoService } from '@exam-platform/shared';
import { assertAllowedWebhookUrl, IntegrationType } from './webhook-url-allowlist';
import { IntegrationEventsService } from './integration-events.service';
import { CreateConnectedAppDto } from './dto/create-connected-app.dto';
import { UpdateConnectedAppDto } from './dto/update-connected-app.dto';

export interface ConnectedAppView {
  id: string;
  type: string;
  label: string;
  events: string[];
  status: string;
  lastDeliveryAt: Date | null;
  lastError: string | null;
  urlHint: string;
}

interface ConnectedAppRow {
  id: string;
  type: string;
  label: string;
  events: string;
  status: string;
  lastDeliveryAt: Date | null;
  lastError: string | null;
}

@Injectable()
export class ConnectedAppsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly audit: AuditService,
    private readonly integrationEvents: IntegrationEventsService,
  ) {}

  async list(context: TenantContext): Promise<ConnectedAppView[]> {
    const rows = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.orgIntegration.findMany({ orderBy: { createdAt: 'desc' } }),
    );
    return rows.map(toView);
  }

  async create(context: TenantContext, actorUserId: string, dto: CreateConnectedAppDto): Promise<ConnectedAppView> {
    assertAllowedWebhookUrl(dto.type, dto.targetUrl);
    const organizationId = requireOrganizationId(context);
    const row = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.orgIntegration.create({
        data: {
          organizationId,
          type: dto.type,
          label: dto.label,
          targetUrlEncrypted: this.crypto.encrypt(dto.targetUrl),
          events: JSON.stringify(dto.events),
          status: 'active',
        },
      }),
    );
    await this.audit.record(context, { actorUserId, action: 'integration.connected', entityType: 'org_integration', entityId: row.id });
    return toView(row);
  }

  async update(context: TenantContext, actorUserId: string, id: string, dto: UpdateConnectedAppDto): Promise<ConnectedAppView> {
    const data: Record<string, unknown> = {};
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.events !== undefined) data.events = JSON.stringify(dto.events);
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.targetUrl !== undefined) {
      const existing = await this.tenantPrisma.forTenant(context, (tx) => tx.orgIntegration.findUnique({ where: { id } }));
      if (!existing) throw new NotFoundException('Connected app not found');
      assertAllowedWebhookUrl(existing.type as IntegrationType, dto.targetUrl);
      data.targetUrlEncrypted = this.crypto.encrypt(dto.targetUrl);
    }
    const row = await this.tenantPrisma.forTenant(context, (tx) => tx.orgIntegration.update({ where: { id }, data }));
    await this.audit.record(context, { actorUserId, action: 'integration.updated', entityType: 'org_integration', entityId: id });
    return toView(row);
  }

  async remove(context: TenantContext, actorUserId: string, id: string): Promise<{ ok: true }> {
    await this.tenantPrisma.forTenant(context, (tx) => tx.orgIntegration.delete({ where: { id } }));
    await this.audit.record(context, { actorUserId, action: 'integration.removed', entityType: 'org_integration', entityId: id });
    return { ok: true };
  }

  async test(context: TenantContext, id: string): Promise<{ queued: true }> {
    const organizationId = requireOrganizationId(context);
    await this.integrationEvents.enqueueTest(organizationId, id);
    return { queued: true };
  }

  async deliveries(context: TenantContext, id: string): Promise<unknown[]> {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.integrationDelivery.findMany({ where: { integrationId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    );
  }
}

function requireOrganizationId(context: TenantContext): string {
  if (!context.organizationId) throw new NotFoundException('No organization context for this account');
  return context.organizationId;
}

function parseEvents(raw: string): string[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

// ponytail: static mask -- avoids decrypting on every list just to reveal a URL
// suffix. Add a real last-4-chars hint (via crypto.decrypt) if product asks for it.
function toView(row: ConnectedAppRow): ConnectedAppView {
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    events: parseEvents(row.events),
    status: row.status,
    lastDeliveryAt: row.lastDeliveryAt,
    lastError: row.lastError,
    urlHint: '****',
  };
}
