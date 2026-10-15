import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService, resolvePermissionGrants } from '@exam-platform/shared';
import { inCompany } from '../org-structure/org-structure.service';
import { EmployeeHistoryService, type RequestUser } from '../employee-history/employee-history.service';
import { PeopleService } from '../people/people.service';

export interface SearchHit {
  id: string;
  label: string;
  secondary: string;
  href: string;
}

export interface SearchResult {
  people: SearchHit[];
  requests: SearchHit[];
  candidates: SearchHit[];
  tickets: SearchHit[];
}

const LIMIT = 5;
const like = (t: string) => `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const enc = encodeURIComponent;

/** The keys the counts and search sections need; each section shows only what its key reaches. */
const KEYS = ['candidate:view', 'candidate:manage', 'document.manage', 'lifecycle.exit.manage', 'lifecycle.exit.view', 'payroll.query.handle', 'desk.ticket.work'] as const;

// The YukthiX app frame (design audit step 1, PLT-01 / PLT-20): the global search behind Ctrl K and the counts on
// the side menu. Every section runs inside the company's RLS context and applies the same rule as the page it links
// to, so a search or a count never shows what the person could not open (P02 §4.3, YX-SEC-05).
@Injectable()
export class WorkspaceService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly history: EmployeeHistoryService,
    private readonly people: PeopleService,
  ) {}

  private granted(user: RequestUser) {
    return resolvePermissionGrants(this.prisma, this.tenantPrisma, { role: user.role, organizationId: user.organizationId ?? null, permissionProfileId: user.permissionProfileId, userId: user.userId ?? null }, [...KEYS]);
  }

  async search(ctx: TenantContext, user: RequestUser, raw: string): Promise<SearchResult> {
    const q = raw.trim().slice(0, 100);
    const empty: SearchResult = { people: [], requests: [], candidates: [], tickets: [] };
    if (q.length < 2 || !ctx.organizationId || !user.userId) return empty;
    const keys = await this.granted(user);
    // A YukthiX support session never sees hiring or tickets (D14); people stay as the directory shows them.
    const support = Boolean(user.actingSuperAdmin);
    const [people, rest] = await Promise.all([
      this.searchPeople(ctx, user, q),
      inCompany(this.tenantPrisma, ctx, async (tx, c) => {
        const me = user.userId!;
        const org = c.organizationId;
        // Requests the person raised, asked for, or holds (held) a task on: ApprovalsEngine.view's rule.
        const requests = await tx.$queryRaw<{ id: string; title: string; request_type: string; status: string }[]>`
          SELECT r.id::text, r.title, r.request_type, r.status FROM wf_requests r
          WHERE r.organization_id = ${org}::uuid
            AND (r.requester_user_id = ${me}::uuid OR r.raised_by_user_id = ${me}::uuid
              OR EXISTS (SELECT 1 FROM wf_tasks t WHERE t.request_id = r.id AND (t.assignee_user_id = ${me}::uuid OR t.on_behalf_of_user_id = ${me}::uuid)))
            AND (r.title ILIKE ${like(q)} OR r.id::text ILIKE ${`${q.toLowerCase()}%`})
          ORDER BY r.created_at DESC LIMIT ${LIMIT}`;
        const candidates = !support && (keys.has('candidate:view') || keys.has('candidate:manage'))
          ? await tx.$queryRaw<{ id: string; name: string; email: string }[]>`
              SELECT c.id::text, c.name, c.email::text FROM candidates c
              WHERE c.organization_id = ${org}::uuid AND c.erased_at IS NULL AND c.merged_into_id IS NULL AND c.deleted_at IS NULL
                AND (c.name ILIKE ${like(q)} OR c.email::text ILIKE ${like(q)})
              ORDER BY c.created_at DESC LIMIT ${LIMIT}`
          : [];
        // Tickets the person raised (as a requester): the ones their Help page shows.
        const tickets = support ? [] : await tx.$queryRaw<{ id: string; number: string; subject: string }[]>`
          SELECT t.id::text, t.number, t.subject FROM sd_tickets t
          WHERE t.organization_id = ${org}::uuid
            AND t.requester_person_id IN (SELECT pr.person_id FROM person_roles pr WHERE pr.organization_id = ${org}::uuid
              AND pr.role_type = 'login' AND pr.source_table = 'users' AND pr.source_id = ${me}::uuid AND pr.end_on IS NULL)
            AND (t.number ILIKE ${like(q)} OR t.subject ILIKE ${like(q)})
          ORDER BY t.created_at DESC LIMIT ${LIMIT}`;
        return { requests, candidates, tickets };
      }),
    ]);
    const STATUS: Record<string, string> = { pending: 'Waiting', approved: 'Approved', rejected: 'Rejected', withdrawn: 'Withdrawn', cancelled: 'Cancelled' };
    return {
      people,
      requests: rest.requests.map((r) => ({ id: r.id, label: r.title, secondary: `${r.request_type.replace(/[._]/g, ' ')} · ${STATUS[r.status] ?? r.status}`, href: '/yx/approvals' })),
      candidates: rest.candidates.map((c) => ({ id: c.id, label: c.name, secondary: `Candidate · ${c.email}`, href: `/yx/hiring/candidates/${enc(c.id)}` })),
      tickets: rest.tickets.map((t) => ({ id: t.id, label: t.number, secondary: t.subject, href: `/yx/desk/help/${enc(t.id)}` })),
    };
  }

  /** People exactly as the Directory shows them to this person (Public fields; codes only within HR's scope). */
  private async searchPeople(ctx: TenantContext, user: RequestUser, q: string): Promise<SearchHit[]> {
    try {
      const v = await this.history.viewer(user);
      const page = await this.people.directory(ctx, v, { q, limit: LIMIT });
      return page.people.map((p) => {
        const hr = 'employeeCode' in p;
        const parts = [hr ? (p as { employeeCode?: string | null }).employeeCode : null, p.designation?.name, p.department?.name].filter(Boolean);
        return { id: p.id, label: p.name, secondary: parts.join(' · '), href: hr ? `/yx/people/profile?person=${enc(p.id)}` : `/yx/people/directory?q=${enc(p.name)}` };
      });
    } catch (e) {
      // No employee record and no HR key: the directory is not for them, so neither is a people search.
      if (e instanceof ForbiddenException) return [];
      throw e;
    }
  }

  /** Counts for the side menu, each only for someone who may open the page it sits on. */
  async counts(ctx: TenantContext, user: RequestUser): Promise<Record<string, number>> {
    if (!ctx.organizationId || !user.userId) return {};
    const keys = await this.granted(user);
    const support = Boolean(user.actingSuperAdmin);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const me = user.userId!;
      const org = c.organizationId;
      const one = (sql: Prisma.Sql) => tx.$queryRaw<{ n: bigint }[]>(sql).then((r) => Number(r[0]?.n ?? 0));
      const out: Record<string, number> = {};
      out.approvals = await one(Prisma.sql`SELECT count(*) AS n FROM wf_tasks t JOIN wf_requests r ON r.id = t.request_id
        WHERE t.organization_id = ${org}::uuid AND t.assignee_user_id = ${me}::uuid AND t.status = 'open' AND r.status = 'pending' AND r.current_step = t.step`);
      out.notifications = await tx.userNotification.count({ where: { organizationId: org, recipientUserId: me, readAt: null } });
      if (keys.has('document.manage')) out.documentsToVerify = await tx.document.count({ where: { organizationId: org, status: 'uploaded' } });
      if (keys.has('lifecycle.exit.manage') || keys.has('lifecycle.exit.view')) out.exitCases = await tx.exitCase.count({ where: { organizationId: org, status: { in: ['submitted', 'accepted', 'cleared'] } } });
      if (!support && keys.has('payroll.query.handle')) out.payslipQueries = await tx.payslipQuery.count({ where: { organizationId: org, status: 'open' } });
      if (!support && keys.has('desk.ticket.work')) out.myTickets = await one(Prisma.sql`SELECT count(*) AS n FROM sd_tickets t WHERE t.organization_id = ${org}::uuid AND t.assignee_user_id = ${me}::uuid AND t.system_state NOT IN ('solved', 'closed')`);
      // Scorecards I owe on interviews that have happened (M10 AT5).
      if (!support) out.scorecardsToDo = await one(Prisma.sql`SELECT count(*) AS n FROM interview_panelists p JOIN interviews i ON i.id = p.interview_id
        JOIN interview_slots s ON s.id = i.confirmed_slot_id JOIN pipeline_entries pe ON pe.id = i.pipeline_entry_id JOIN jobs j ON j.id = pe.job_id
        WHERE p.organization_id = ${org}::uuid AND p.user_id = ${me}::uuid AND i.status <> 'cancelled' AND s.ends_at <= now()
          AND COALESCE(i.scorecard_template_id, j.scorecard_template_id) IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM scorecards sc WHERE sc.interview_id = i.id AND sc.panelist_user_id = p.user_id AND sc.status = 'submitted')`);
      return out;
    });
  }
}
