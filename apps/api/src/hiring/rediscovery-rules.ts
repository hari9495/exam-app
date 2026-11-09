// HIR-26 rediscovery (founder decision 2): the plain text match that runs with AI on or off. Pure, so it is unit-tested.
// A past candidate is suggested when a word of the requisition's title or designation is in their résumé title or a
// past role, or one of their skills appears in the requisition. It only suggests; a person decides.

const STOP = new Set(['and', 'the', 'for', 'with', 'senior', 'junior', 'lead', 'head', 'trainee', 'intern', 'associate', 'executive', 'manager', 'officer', 'staff', 'team', 'line', 'shift', 'level']);

/** Lower-case words of 3+ letters, without filler words. */
export const words = (s: string | null | undefined) => new Set((s ?? '').toLowerCase().split(/[^a-z0-9+#.]+/).map((w) => w.replace(/\.+$/, '')).filter((w) => w.length >= 3 && !STOP.has(w)));

export interface RediscoveryRole {
  /** Title and designation: the words that must meet a past role or skill. */
  title: string;
  /** Title, designation and description: where a skill may appear. */
  text: string;
  location: string | null;
}

export interface RediscoveryPerson {
  resumeTitle: string | null;
  skills: string | null;
  pastRoles: { title: string; location: string | null }[];
}

export function matchPerson(role: RediscoveryRole, p: RediscoveryPerson): { score: number; reasons: string[] } | null {
  const need = words(role.title);
  const text = role.text.toLowerCase();
  const hits = (s: string) => [...words(s)].some((w) => need.has(w));
  const titleHit = [p.resumeTitle, ...p.pastRoles.map((r) => r.title)].find((t): t is string => Boolean(t) && hits(t!)) ?? null;
  const skills = [...new Set((p.skills ?? '').split(/[,;|\n]/).map((s) => s.trim()).filter((s) => s.length >= 2 && s.length <= 60))];
  const skillHits = skills.filter((s) => hits(s) || new RegExp(`(^|[^a-z0-9])${s.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(text)).slice(0, 4);
  if (!titleHit && !skillHits.length) return null;
  const loc = role.location && p.pastRoles.some((r) => r.location && r.location.toLowerCase() === role.location!.toLowerCase()) ? role.location : null;
  return {
    score: (titleHit ? 3 : 0) + skillHits.length * 2 + (loc ? 1 : 0),
    reasons: [...(titleHit ? [`Past role: ${titleHit}`] : []), ...skillHits, ...(loc ? [loc] : [])],
  };
}
