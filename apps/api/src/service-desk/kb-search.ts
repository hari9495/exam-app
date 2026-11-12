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

/**
 * Answer 1642: words that mean the same in a knowledge search, one group a line, words separated by commas. A company
 * setting (HR edits it in Desk set-up › Settings); this Indian HR starter list until they do.
 */
export const SYNONYMS_KEY = 'desk.kb.synonyms';
export const STARTER_SYNONYMS = [
  'pf, provident fund, epf',
  'uan, universal account number',
  'esi, esic, employees state insurance',
  'cl, casual leave',
  'sl, sick leave',
  'el, earned leave, privilege leave, pl',
  'lop, loss of pay',
  'comp off, compensatory off',
  'payslip, salary slip, pay slip',
  'form 16, form16',
  'tds, income tax, tax deduction',
  'hra, house rent allowance',
  'lta, leave travel allowance',
  'pt, professional tax',
  'ctc, cost to company',
  'fnf, full and final, settlement',
  'wfh, work from home',
  'od, on duty',
].join('\n');
const SYN_TERM = /^[\p{L}\p{M}\p{N}]+( [\p{L}\p{M}\p{N}]+)*$/u;

/** The word list as groups; refuses lines HR would not mean (one word, odd characters, too long), naming the line. */
export function parseSynonyms(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length > 80) throw new Error('Keep the list to 80 lines.');
  return lines.map((line, i) => {
    const terms = [...new Set(line.split(',').map((t) => t.trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean))];
    if (terms.length < 2) throw new Error(`Line ${i + 1}: give at least two words that mean the same, separated by commas.`);
    for (const t of terms) if (t.length > 40 || !SYN_TERM.test(t)) throw new Error(`Line ${i + 1}: "${t}" may use only letters, digits and single spaces (up to 40).`);
    return terms;
  });
}

/** The company's groups (its own list, else the starter list). A stored list that no longer parses falls back. */
export async function synonymsOf(tx: Tx, org: string): Promise<string[][]> {
  const row = await tx.setting.findFirst({ where: { organizationId: org, key: SYNONYMS_KEY, scopeType: 'tenant', validFrom: null }, select: { value: true } });
  try {
    return parseSynonyms(typeof row?.value === 'string' ? row.value : STARTER_SYNONYMS);
  } catch {
    return parseSynonyms(STARTER_SYNONYMS);
  }
}

/** The other words of every group that one of the search's words (or phrases) belongs to. */
export function synonymsFor(q: string, groups: string[][]): string[] {
  const norm = ` ${(q.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? []).join(' ')} `;
  const out = new Set<string>();
  for (const g of groups) if (g.some((t) => norm.includes(` ${t} `))) for (const t of g) if (!norm.includes(` ${t} `)) out.add(t);
  return [...out].slice(0, 12);
}

/** Published articles of these spaces that match the words (prefix match while typing), best first. */
export async function searchIn(tx: Tx, org: string, spaceIds: string[], q: string, take: number) {
  if (!spaceIds.length) return [];
  // Answer 1642: "PF" also finds "provident fund" (the company's word list).
  const alts = synonymsFor(q, await synonymsOf(tx, org)).map((t) => prefixQuery(t, '&')).filter((x): x is string => Boolean(x));
  const widen = (base: string) => (alts.length ? [`(${base})`, ...alts.map((a) => `(${a})`)].join(' | ') : base);
  const run = async (tsq: string) =>
    tx.$queryRaw<{ id: string; number: number; slug: string; title: string; summary: string | null; space_id: string; language: string }[]>`
      SELECT id, number, slug, title, summary, space_id, language FROM sd_kb_articles
      WHERE organization_id = ${org}::uuid AND space_id = ANY(${spaceIds}::uuid[]) AND state = 'published' AND deleted_at IS NULL AND language = 'en'
        AND search @@ to_tsquery('simple', ${tsq})
      ORDER BY featured DESC, ts_rank(search, to_tsquery('simple', ${tsq})) DESC LIMIT ${take}`;
  const and = prefixQuery(q, '&');
  if (!and) return [];
  let rows = await run(widen(and));
  if (!rows.length) rows = await run(widen(prefixQuery(q, '|')!));
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

