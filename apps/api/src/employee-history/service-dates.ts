import { addDays } from '../org-structure/org-validation';

// G1 (gap pass C3, G1-GLOBAL-CORE-BUILD-DESIGN §4): three named service dates. Company start and this employer's
// start are read from the employments already stored; continuous service is HR's value, else it follows the rehire
// choice saved at joining (lifecycle 6e: fresh / continuous / break counted), else the joining day.

export interface Spell {
  id: string;
  /** YYYY-MM-DD */
  joinedOn: string;
  exitedOn: string | null;
  rehireOf: string | null;
  /** HR's value, with its reason. */
  continuousServiceFrom: string | null;
  /** The rehire policy's service choice in force when this spell started. */
  serviceChoice: string | null;
}

export type ServiceSource = 'hr' | 'rehire_continuous' | 'rehire_break_counted' | 'joining';

export interface ServiceDates {
  companyStart: string;
  employerStart: string;
  continuousServiceFrom: string;
  source: ServiceSource;
}

const DAY = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

function continuous(spells: readonly Spell[], s: Spell, depth = 0): { date: string; source: ServiceSource } {
  if (s.continuousServiceFrom) return { date: s.continuousServiceFrom, source: 'hr' };
  const prev = s.rehireOf ? spells.find((x) => x.id === s.rehireOf) : undefined;
  // A broken chain (or a loop) counts from the joining day: never an invented earlier date.
  if (!prev || !prev.exitedOn || depth > 20) return { date: s.joinedOn, source: 'joining' };
  if (s.serviceChoice === 'continuous') return { date: continuous(spells, prev, depth + 1).date, source: 'rehire_continuous' };
  if (s.serviceChoice === 'break_counted') {
    // Earlier service counts, the break does not: the days served before move the start back.
    const served = days(continuous(spells, prev, depth + 1).date, prev.exitedOn) + 1;
    return { date: addDays(s.joinedOn, -served), source: 'rehire_break_counted' };
  }
  return { date: s.joinedOn, source: 'joining' };
}

/** The three dates for one spell (`id`) among all the person's spells in this company. */
export function serviceDates(spells: readonly Spell[], id: string): ServiceDates {
  const s = spells.find((x) => x.id === id);
  if (!s) throw new Error('No such employment');
  const c = continuous(spells, s);
  return { companyStart: spells.map((x) => x.joinedOn).sort()[0], employerStart: s.joinedOn, continuousServiceFrom: c.date, source: c.source };
}
