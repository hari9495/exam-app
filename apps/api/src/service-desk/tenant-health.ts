/** The account signals a company's health score is worked out from (never HR data). */
export interface HealthSignals {
  /** The company's lifecycle and billing state; null when the support account is not linked to a company. */
  lifecycle: string | null;
  billingStatus: string | null;
  /** The last sign-in of any of the company's System Admins. */
  adminLastSignIn: Date | null;
  /** Open tickets with the YukthiX Support desk, the average rating (1-5) and the NPS (-100 to 100). */
  open: number;
  csat: number | null;
  nps: number | null;
}

/**
 * The health score the YukthiX Support desk shows on a ticket's company panel, and the console's tenant health list
 * (answer 1047): one score, 0-100, starting at 80, with the reasons it went down.
 */
export function tenantHealth(s: HealthSignals, now = new Date()): { health: number; factors: string[] } {
  const factors: string[] = [];
  let health = 80;
  if (s.lifecycle === 'suspended' || s.billingStatus !== 'active') (health -= 30), factors.push('Billing or account is not in good standing');
  if (s.lifecycle === 'trial') factors.push('In trial');
  const idle = s.adminLastSignIn ? (now.getTime() - s.adminLastSignIn.getTime()) / 86_400_000 : 99;
  if (idle > 30) (health -= 20), factors.push('No admin sign-in for 30 days');
  if (s.open > 3) (health -= 10), factors.push(`${s.open} open tickets`);
  if (s.csat !== null && s.csat < 3.5) (health -= 15), factors.push('Low ratings');
  if (s.nps !== null && s.nps < 0) (health -= 15), factors.push('More detractors than promoters');
  return { health: Math.max(0, Math.min(100, health)), factors };
}

/** The average rating, one decimal (null with no ratings). */
export const csatOf = (scores: number[]) => (scores.length ? Math.round((scores.reduce((s, x) => s + x, 0) / scores.length) * 10) / 10 : null);
/** NPS from the latest answers: promoters (9-10) less detractors (0-6), as a percentage (null with no answers). */
export const npsOf = (scores: number[]) => (scores.length ? Math.round(((scores.filter((n) => n >= 9).length - scores.filter((n) => n <= 6).length) / scores.length) * 100) : null);
