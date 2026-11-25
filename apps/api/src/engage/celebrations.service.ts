import { ForbiddenException, Injectable } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, inCompany } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';
import { todayIst } from '../org-structure/org-validation';
import type { ScopeUser } from '../access/scope';
import { CelebrationPrefsDto } from './dto';

// Batch G2 item 76 (M09 Q5, ENG-01 strip; answer 2605): today's celebrations, worked out when the feed is read (nothing
// is posted or stored): birthdays without the year (never for someone who hides their birthday), work anniversaries
// (whole years), and the first week of new joiners. Each kind is a company setting (on by default) and each person
// can turn any kind of their own off. Promotions wait until promotion letters are tied in.

const ANY_ENTITY = { legalEntityId: '00000000-0000-0000-0000-000000000000' };
type Kind = 'birthday' | 'anniversary' | 'new_joiner';

/** MM-DD of a day, with 29 Feb treated as 28 Feb outside leap years. */
export function sameDay(d: string, today: string): boolean {
  const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const md = d.slice(5);
  return md === today.slice(5) || (md === '02-29' && today.slice(5) === '02-28' && !leap(Number(today.slice(0, 4))));
}

@Injectable()
export class CelebrationsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  today(ctx: TenantContext, today = todayIst()) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const on = async (k: 'engage.celebrate.birthdays' | 'engage.celebrate.anniversaries' | 'engage.celebrate.new_joiners') => (await settingFor(tx, c, k, ANY_ENTITY)) !== 'off';
      const [bday, anniv, joiners] = [await on('engage.celebrate.birthdays'), await on('engage.celebrate.anniversaries'), await on('engage.celebrate.new_joiners')];
      if (!bday && !anniv && !joiners) return [];
      const rows = await tx.$queryRaw<{ id: string; user_id: string | null; given_name: string; family_name: string | null; joined_on: string; dob: string | null; hide: boolean | null }[]>`
        SELECT DISTINCT ON (e.id) e.id::text, e.user_id::text, e.given_name, e.family_name, em.joined_on::text, pd.date_of_birth::text AS dob, pd.hide_birthday AS hide
        FROM employees e
        JOIN employments em ON em.organization_id = e.organization_id AND em.employee_id = e.id
        LEFT JOIN employee_personal_details pd ON pd.organization_id = e.organization_id AND pd.employee_id = e.id
        WHERE e.organization_id = ${org}::uuid AND em.joined_on <= ${today}::date AND (em.exited_on IS NULL OR em.exited_on >= ${today}::date)
        ORDER BY e.id, em.joined_on DESC`;
      const out = await tx.engCelebrationOptout.findMany({ where: { organizationId: org }, select: { userId: true, kind: true } });
      const off = (u: string | null, k: Kind) => Boolean(u && out.some((o) => o.userId === u && o.kind === k));
      const name = (r: (typeof rows)[number]) => [r.given_name, r.family_name].filter(Boolean).join(' ');
      const weekAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10);
      const list: { id: string; name: string; kind: 'Birthday' | 'Work anniversary' | 'New joiner'; detail: string }[] = [];
      for (const r of rows) {
        if (bday && r.dob && !r.hide && !off(r.user_id, 'birthday') && sameDay(r.dob, today)) list.push({ id: `b-${r.id}`, name: name(r), kind: 'Birthday', detail: 'Birthday today' });
        const years = Number(today.slice(0, 4)) - Number(r.joined_on.slice(0, 4));
        if (anniv && years >= 1 && !off(r.user_id, 'anniversary') && sameDay(r.joined_on, today)) list.push({ id: `a-${r.id}`, name: name(r), kind: 'Work anniversary', detail: `${years} ${years === 1 ? 'year' : 'years'} with us` });
        if (joiners && r.joined_on >= weekAgo && !off(r.user_id, 'new_joiner')) list.push({ id: `j-${r.id}`, name: name(r), kind: 'New joiner', detail: r.joined_on === today ? 'Joined today' : 'Joined this week' });
      }
      return list.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
    });
  }

  /** My own choices: which kinds of my celebrations show. */
  mine(ctx: TenantContext, user: ScopeUser) {
    const me = user.userId!;
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const out = (await tx.engCelebrationOptout.findMany({ where: { organizationId: c.organizationId, userId: me }, select: { kind: true } })).map((o) => o.kind);
      return { birthday: !out.includes('birthday'), anniversary: !out.includes('anniversary'), newJoiner: !out.includes('new_joiner') };
    });
  }

  setMine(ctx: TenantContext, user: ScopeUser, dto: CelebrationPrefsDto) {
    const me = user.userId;
    if (!me || user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Only the person themselves chooses this.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const want: Record<Kind, boolean> = { birthday: dto.birthday, anniversary: dto.anniversary, new_joiner: dto.newJoiner };
      for (const [kind, show] of Object.entries(want) as [Kind, boolean][]) {
        if (show) await tx.engCelebrationOptout.deleteMany({ where: { organizationId: org, userId: me, kind } });
        else await tx.engCelebrationOptout.createMany({ data: [{ organizationId: org, userId: me, kind }], skipDuplicates: true });
      }
      await audit(tx, c, 'engage.celebrations.choices', 'user', me, { ...want });
      return { birthday: dto.birthday, anniversary: dto.anniversary, newJoiner: dto.newJoiner };
    });
  }
}
