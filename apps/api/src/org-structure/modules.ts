import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { Observable, from, switchMap } from 'rxjs';
import { TenantPrismaService } from '@exam-platform/shared';

type Tx = Prisma.TransactionClient;

// T2-G 41 (answer 2746): the company switches modules on and off and orders them on the rail. A module that is off has
// its menus and pages hidden (web) and its API answers 403 (ModuleGateInterceptor, below); its data stays. People and
// Payroll (with Compliance, whose pages are Payroll's statutory pages) cannot be switched off. The web keeps the same
// list in apps/web/lib/yx-modules.ts.

export interface ModuleDef {
  id: string;
  label: string;
  /** Cannot be switched off. */
  locked?: true;
  /** The API paths (after /api/v1) that belong to the module. */
  api?: RegExp;
}

// Helpdesk off keeps the legal duties that live under /desk: speak-up and the Internal Committee, cases, ethics,
// accidents and company policies (and the desk's own sign-in-free routes, which carry no company user).
const DESK_KEPT = '(accidents|cases|ethics|speakup|policies|policy-writer|disputes|support|scim|inbound|signup|widget|wall|reply-link|rate|portal|my/cases|my/misconduct-reports|my/policies)';

/** The rail's modules in the designed order (Home first and Settings last are not modules). */
export const MODULES: readonly ModuleDef[] = [
  { id: 'people', label: 'People', locked: true },
  { id: 'time', label: 'Time & Leave', api: /^\/(time|kiosk)(\/|$)/ },
  { id: 'pay', label: 'Payroll', locked: true },
  { id: 'compliance', label: 'Compliance', locked: true },
  { id: 'contract', label: 'Contract labour', api: /^\/contract-labour(\/|$)/ },
  { id: 'hire', label: 'Hiring', api: /^\/(hiring|candidates|pipelines|referrals|agencies|agency-submissions|staffing|leads|internal-applications|walk-in-groups|surveys|interview-email-templates|bulk-candidate-email|candidate-[a-z-]+)(\/|$)/ },
  { id: 'projects', label: 'Projects', api: /^\/projects(\/|$)/ },
  { id: 'performance', label: 'Performance', api: /^\/performance(\/|$)/ },
  { id: 'learning', label: 'Learning', api: /^\/(learning|scorm)(\/|$)/ },
  { id: 'helpdesk', label: 'Helpdesk', api: new RegExp(`^/desk(/(?!${DESK_KEPT}(/|$))|$)`) },
  { id: 'engage', label: 'Engage', api: /^\/engage(\/|$)/ },
  { id: 'visitors', label: 'Visitors', api: /^\/(visitors|visitor-kiosk)(\/|$)/ },
  { id: 'analytics', label: 'Analytics', api: /^\/library(\/|$)/ },
];
export const MODULE_IDS = MODULES.map((m) => m.id);
export const SWITCHABLE_IDS = MODULES.filter((m) => !m.locked).map((m) => m.id);
export const MODULES_OFF_KEY = 'org.modules.off';
export const MODULES_ORDER_KEY = 'org.modules.order';
export const MODULE_KEYS: readonly string[] = [MODULES_OFF_KEY, MODULES_ORDER_KEY];

/** The module an API path belongs to, or null (shared or always-on routes). */
export const moduleOfPath = (path: string): string | null => MODULES.find((m) => m.api?.test(path))?.id ?? null;

/** A saved comma list, keeping only known ids (a module added later is simply not in an old list). */
const list = (v: unknown, allowed: readonly string[]): string[] => (typeof v === 'string' && v ? v.split(',').filter((x) => allowed.includes(x)) : []);

/** The company's order: its saved order, then any module it has not placed, in the designed order. */
export function moduleOrder(saved: unknown): string[] {
  const mine = list(saved, MODULE_IDS);
  return [...mine, ...MODULE_IDS.filter((id) => !mine.includes(id))];
}

export async function modulesOff(tx: Tx, organizationId: string): Promise<string[]> {
  const row = await tx.setting.findFirst({ where: { organizationId, key: MODULES_OFF_KEY, scopeType: 'tenant' }, select: { value: true } });
  return list(row?.value, SWITCHABLE_IDS);
}

// Read on every gated call, so kept for a short while per company; a change made here clears it at once.
const CACHE_MS = 15_000;
const cache = new Map<string, { off: string[]; at: number }>();
export const forgetModules = (organizationId: string) => cache.delete(organizationId);

export const moduleOffError = (label: string) => new ForbiddenException({ statusCode: 403, code: 'MODULE_OFF', message: `${label} is switched off for your company. Your System Admin can switch it on in Settings › Modules.` });

/** Global: a request to a switched-off module's routes is refused (403, code MODULE_OFF). Data is never touched. */
@Injectable()
export class ModuleGateInterceptor implements NestInterceptor {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    const id = moduleOfPath(req.path.replace(/^\/api\/v1/, ''));
    const organizationId = (req.user as { organizationId?: string | null } | undefined)?.organizationId;
    if (!id || !organizationId) return next.handle();
    const hit = cache.get(organizationId);
    const read = hit && Date.now() - hit.at < CACHE_MS ? Promise.resolve(hit.off) : this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) => modulesOff(tx, organizationId)).then((off) => (cache.set(organizationId, { off, at: Date.now() }), off));
    return from(read).pipe(
      switchMap((off) => {
        if (off.includes(id)) throw moduleOffError(MODULES.find((m) => m.id === id)!.label);
        return next.handle();
      }),
    );
  }
}
