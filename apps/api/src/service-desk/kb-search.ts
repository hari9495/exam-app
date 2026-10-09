import { Prisma } from '@prisma/client';
import { Tx } from '../org-structure/org-structure.service';
import { maskPii } from './pii';

// Knowledge search and counts shared by KbService and the email acknowledgement (MailOutService), which cannot depend
// on KbService itself (KbService → TicketsService → MailOutService would be a cycle).

type Space = Prisma.SdKbSpaceGetPayload<object>;
export type KbSource = 'help' | 'portal' | 'public' | 'drawer' | 'agent' | 'email';
const webOrigin = () => (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');

/** Words of a search as a safe prefix tsquery ("print can" → "print & can:*"); only letters and digits get through. */
export function prefixQuery(q: string, join: '&' | '|' = '&'): string | null {
  // Letters with their combining marks (Hindi, Tamil and Telugu vowel signs), and digits.
  const words = (q.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? []).slice(0, 8);
  if (!words.length) return null;
  return words.map((w, i) => (i === words.length - 1 ? `${w}:*` : w)).join(` ${join} `);
}

export async function portalFor(tx: Tx, org: string, deskId: string): Promise<string | null> {
  const link = await tx.sdPortalDesk.findFirst({ where: { organizationId: org, deskId } });
  return link ? ((await tx.sdPortal.findFirst({ where: { organizationId: org, id: link.portalId, status: 'active' }, select: { slug: true } }))?.slug ?? null) : null;
}

/** Where a requester opens an article: the public help centre, the outside portal, or the in-app help centre. */
export function readerUrl(orgSlug: string, s: Space, x: { number: number; slug: string }, portalSlug: string | null) {
  if (s.audience === 'public') return `${webOrigin()}/yx/help/${orgSlug}/${s.slug}/${x.slug}`;
  if (portalSlug) return `${webOrigin()}/yx/portal/${orgSlug}/${portalSlug}?article=${x.number}`;
  return `${webOrigin()}/yx/desk/help?article=${x.number}`;
}

/** Published articles of these spaces that match the words (prefix match while typing), best first. */
export async function searchIn(tx: Tx, org: string, spaceIds: string[], q: string, take: number) {
  if (!spaceIds.length) return [];
  const run = async (tsq: string) =>
    tx.$queryRaw<{ id: string; number: number; slug: string; title: string; summary: string | null; space_id: string; language: string }[]>`
      SELECT id, number, slug, title, summary, space_id, language FROM sd_kb_articles
      WHERE organization_id = ${org}::uuid AND space_id = ANY(${spaceIds}::uuid[]) AND state = 'published' AND deleted_at IS NULL AND language = 'en'
        AND search @@ to_tsquery('simple', ${tsq})
      ORDER BY featured DESC, ts_rank(search, to_tsquery('simple', ${tsq})) DESC LIMIT ${take}`;
  const and = prefixQuery(q, '&');
  if (!and) return [];
  let rows = await run(and);
  if (!rows.length) rows = await run(prefixQuery(q, '|')!);
  return rows.map((r) => ({ id: r.id, number: r.number, slug: r.slug, title: r.title, summary: r.summary, spaceId: r.space_id }));
}

/** One count without any user id (YX-GRO-07). Searches keep only masked words. */
export async function countKb(tx: Tx, org: string, e: { kind: 'search' | 'view' | 'click' | 'solved'; source: KbSource; spaceId?: string | null; articleId?: string | null; query?: string; results?: number }) {
  const query = e.query ? maskPii(e.query.trim().toLowerCase().replace(/\s+/g, ' ')).text.slice(0, 200) : null;
  await tx.sdKbEvent.create({ data: { organizationId: org, kind: e.kind, source: e.source, spaceId: e.spaceId ?? null, articleId: e.articleId ?? null, query, results: e.results ?? null } });
}

/** The suggested articles in an email acknowledgement (US-G-019): public or the desk's requester articles. */
export async function forAcknowledgement(tx: Tx, org: string, deskId: string, text: string): Promise<{ title: string; url: string }[]> {
  const desk = await tx.sdDesk.findFirst({ where: { organizationId: org, id: deskId }, select: { kind: true } });
  if (!desk) return [];
  const spaces = (await tx.sdKbSpace.findMany({ where: { organizationId: org, status: 'active', audience: { in: ['requesters', 'public'] } } })).filter((s) => s.audience === 'public' || s.deskId === deskId || (!s.deskId && desk.kind !== 'customer_support'));
  const found = await searchIn(tx, org, spaces.map((s) => s.id), text, 3);
  if (!found.length) return [];
  await countKb(tx, org, { kind: 'search', source: 'email', query: text, results: found.length });
  const o = await tx.organization.findUnique({ where: { id: org }, select: { slug: true } });
  const portal = desk.kind === 'customer_support' ? await portalFor(tx, org, deskId) : null;
  const bySpace = new Map(spaces.map((s) => [s.id, s]));
  return found.map((x) => ({ title: x.title, url: readerUrl(o?.slug ?? '', bySpace.get(x.spaceId)!, x, portal) }));
}

