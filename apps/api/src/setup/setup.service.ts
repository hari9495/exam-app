import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'crypto';
import { PrismaService, TenantPrismaService, AuditService } from '@exam-platform/shared';
import { CompleteSetupDto } from './dto/complete-setup.dto';

// A generous window compared to the 15-minute PASSWORD_RESET_EXPIRY_MINUTES used elsewhere --
// this token is for a one-time operator/deploy action, not an end-user flow, and the operator
// may not act on it immediately after boot. Every restart while setup is pending regenerates it
// anyway, so this expiry is a defense-in-depth bound, not the primary control.
const SETUP_TOKEN_EXPIRY_HOURS = 24;

@Injectable()
export class SetupService implements OnModuleInit {
  private readonly logger = new Logger(SetupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!(await this.needsSetup())) {
      return;
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + SETUP_TOKEN_EXPIRY_HOURS);

    await this.prisma.setupToken.deleteMany({});
    await this.prisma.setupToken.create({ data: { tokenHash, expiresAt } });

    const setupUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/setup`;
    this.logger.warn(
      `No super_admin account exists yet. Visit ${setupUrl} and complete setup with this one-time token: ${rawToken}`,
    );
  }

  async needsSetup(): Promise<boolean> {
    // dbo.users carries an RLS filter predicate -- a plain unscoped query would silently see
    // zero rows regardless of the table's real contents, permanently reporting "needs setup"
    // even after a real super_admin exists. This bypass context is required, not optional.
    const count = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.user.count({ where: { role: 'super_admin' } }),
    );
    return count === 0;
  }

  async completeSetup(dto: CompleteSetupDto): Promise<void> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const context = { organizationId: null, isSuperAdmin: true };

    const admin = await this.tenantPrisma.forTenant(context, async (tx) => {
      // Re-check at write time, not just trusting the boot-time snapshot -- closes the race
      // window between two concurrent submissions.
      const stillNeedsSetup = (await tx.user.count({ where: { role: 'super_admin' } })) === 0;
      if (!stillNeedsSetup) {
        throw new BadRequestException('Setup has already been completed');
      }

      const setupToken = await tx.setupToken.findUnique({ where: { tokenHash } });
      if (!setupToken || setupToken.expiresAt < new Date()) {
        throw new BadRequestException('This setup token is invalid or has expired');
      }

      const passwordHash = await argon2.hash(dto.password);
      const created = await tx.user.create({
        data: { organizationId: null, email: dto.email, passwordHash, role: 'super_admin' },
      });

      await tx.setupToken.deleteMany({});
      return created;
    });

    await this.audit.record(context, {
      actorUserId: admin.id,
      action: 'user.setup_wizard_completed',
      entityType: 'user',
      entityId: admin.id,
    });
  }
}
