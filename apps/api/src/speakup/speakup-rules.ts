import { randomInt } from 'crypto';
import type { SpeakupKind, SpeakupTeam } from './dto';

// HLP-06 rules as plain functions (docs/yukthix/helpdesk-design-map.md section 4e).

/** 32 letters and digits with no look-alikes (no I, O, 0, 1): 16 of them ≈ 80 bits. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newReplyCode(): string {
  let s = '';
  for (let i = 0; i < 16; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}
/** As printed: ABCD-EFGH-JKLM-NPQR. */
export const showCode = (c: string) => c.match(/.{4}/g)!.join('-');
/** As typed: any case, dashes and spaces ignored; null when it can't be a code. */
export function readCode(typed: string): string | null {
  const c = typed.toUpperCase().replace(/[\s-]/g, '');
  return c.length === 16 && [...c].every((ch) => CODE_ALPHABET.includes(ch)) ? c : null;
}

export const PREFIX: Record<SpeakupKind, string> = { grievance: 'GRV', whistleblower: 'WB', posh: 'POSH' };
export const caseNumber = (kind: SpeakupKind, n: number) => `${PREFIX[kind]}-${String(n).padStart(4, '0')}`;

/** Who may report without a name, from the company setting: all, ethics_only (fraud and ethics only), off. POSH never. */
export function anonymousAllowed(setting: string, kind: SpeakupKind): boolean {
  if (kind === 'posh' || setting === 'off') return false;
  return setting !== 'ethics_only' || kind === 'whistleblower';
}

/**
 * Where a report goes: POSH to the Internal Committee, fraud and ethics to the ethics team, grievances to the grievance
 * team (the ethics team when it has nobody). About one of the officers of that list: the escalation list instead.
 * Returns the list and its members, never the officer it is about; null when nobody can receive it.
 */
export function route(kind: SpeakupKind, teams: Record<SpeakupTeam, string[]>, aboutUserId: string | null): { team: SpeakupTeam; members: string[] } | null {
  let team: SpeakupTeam = kind === 'posh' ? 'ic' : kind === 'whistleblower' ? 'ethics' : teams.grievance.length ? 'grievance' : 'ethics';
  if (kind === 'posh' && !teams.ic.length) return null;
  if (aboutUserId && teams[team].includes(aboutUserId)) team = 'escalation';
  const members = teams[team].filter((u) => u !== aboutUserId);
  return members.length ? { team, members } : null;
}

/** "2026-11-03" + n days / months (month ends clamped). */
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export function addMonths(d: string, n: number): string {
  const [y, m, day] = d.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(day, last))).toISOString().slice(0, 10);
}
/** A POSH complaint is late when the incident is more than the rule set's months before today (the IC may still accept it). */
export const poshLate = (happenedOn: string | null, today: string, filingMonths: number) => Boolean(happenedOn && addMonths(happenedOn, filingMonths) < today);
