import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

export type SystemEventService = 'api' | 'exam-runtime' | 'candidate-browser';
export type SystemEventSeverity = 'error' | 'warn';

export interface SystemEventEntry {
  organizationId: string | null;
  service: SystemEventService;
  severity: SystemEventSeverity;
  message: string;
  context?: Record<string, unknown>;
}

// SQL Server column cap (NVARCHAR(2000)); truncate rather than fail the insert.
const MAX_MESSAGE_LENGTH = 2000;

@Injectable()
export class SystemEventsService {
  private readonly logger = new Logger(SystemEventsService.name);

  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  // Best-effort diagnostic write: never throws, never blocks the caller's request path.
  // Always runs as super-admin context -- this is a system writer (RLS insert-block would
  // otherwise reject NULL-org platform events), and org scoping is enforced at READ time.
  // Mirrors every event to the Nest logger so pm2 file logs keep a copy even when the DB
  // itself is the thing failing (the one failure mode a DB-backed log can't record).
  async record(entry: SystemEventEntry): Promise<void> {
    const message = entry.message.length > MAX_MESSAGE_LENGTH ? `${entry.message.slice(0, MAX_MESSAGE_LENGTH - 1)}…` : entry.message;
    this.logger.warn(`[${entry.service}] ${entry.severity}: ${message}`);
    try {
      await this.tenantPrisma.forTenant({ organizationId: entry.organizationId, isSuperAdmin: true }, async (tx) => {
        await tx.systemEvent.create({
          data: {
            organizationId: entry.organizationId,
            service: entry.service,
            severity: entry.severity,
            message,
            contextJson: entry.context ? JSON.stringify(entry.context) : null,
          },
        });
      });
    } catch (error) {
      this.logger.error(`Failed to persist system event: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
