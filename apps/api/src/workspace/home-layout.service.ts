import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';

export const HOME_PERSONAS = ['employee', 'manager', 'hr', 'finance'] as const;
export type HomePersona = (typeof HOME_PERSONAS)[number];
/** Widgets that always stay first ("Needs your action", "Attendance today", the nudge): never hidden or moved. */
export const PINNED_WIDGETS = ['actions', 'clock', 'nudge'] as const;
const SIZES = [4, 6, 12];

export interface HomeLayoutInput {
  persona: HomePersona;
  order: string[];
  hidden: string[];
  sizes: Record<string, number>;
}

/** The layout as saved, checked: known shapes only, pinned widgets never hidden or ordered, no widget twice. */
export function checkLayout(input: Omit<HomeLayoutInput, 'persona'>) {
  const pinned = new Set<string>(PINNED_WIDGETS);
  if ([...input.order, ...input.hidden].some((id) => pinned.has(id))) throw new BadRequestException('"Needs your action" and the other pinned widgets always stay first; they cannot be moved or removed.');
  const all = [...input.order, ...input.hidden];
  if (new Set(all).size !== all.length) throw new BadRequestException('A widget is listed twice.');
  const sizes = Object.entries(input.sizes);
  if (sizes.length > 40 || sizes.some(([id, n]) => !/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(id) || !SIZES.includes(n))) throw new BadRequestException('Widget sizes are small (4), medium (6) or wide (12).');
  return { order: input.order, hidden: input.hidden, sizes: Object.fromEntries(sizes) };
}

// T2-F 79 (answer 2884): Edit home on the live Home. The company layout is the role default; a person whose role the
// company lets personalise (home.personalise_roles, off for everyone by default) keeps their own layout here, so it
// follows them to any device. Only ever the caller's own row.
@Injectable()
export class HomeLayoutService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private async allowed(tx: Tx, c: CompanyContext): Promise<HomePersona[]> {
    const v = await settingFor(tx, c, 'home.personalise_roles', { legalEntityId: '' });
    return v.split(',').filter((x): x is HomePersona => (HOME_PERSONAS as readonly string[]).includes(x));
  }

  get(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const own = await tx.homeLayout.findFirst({ where: { organizationId: c.organizationId, userId: c.userId! } });
      return {
        personaliseRoles: await this.allowed(tx, c),
        layout: own ? { order: own.widgetOrder, hidden: own.hidden, sizes: own.sizes as Record<string, number> } : null,
      };
    });
  }

  save(ctx: TenantContext, input: HomeLayoutInput) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if (!c.userId) throw new ForbiddenException('Sign in to keep your home layout.');
      if (!(await this.allowed(tx, c)).includes(input.persona)) throw new ForbiddenException('Your company keeps the same home for your role. Ask HR if you want to change it.');
      const layout = checkLayout(input);
      const data = { widgetOrder: layout.order, hidden: layout.hidden, sizes: layout.sizes };
      await tx.homeLayout.upsert({ where: { organizationId_userId: { organizationId: c.organizationId, userId: c.userId } }, create: { organizationId: c.organizationId, userId: c.userId, ...data }, update: data });
      await audit(tx, c, 'home.layout.saved', 'user', c.userId, { widgets: layout.order.length, hidden: layout.hidden.length });
      return { layout };
    });
  }

  /** Reset to company layout: the person's own row goes. */
  reset(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if (!c.userId) throw new ForbiddenException('Sign in to keep your home layout.');
      const { count } = await tx.homeLayout.deleteMany({ where: { organizationId: c.organizationId, userId: c.userId } });
      if (count) await audit(tx, c, 'home.layout.reset', 'user', c.userId, {});
      return { layout: null };
    });
  }
}
