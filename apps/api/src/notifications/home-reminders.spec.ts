import { closingSoon, pickReminders, type ReminderCard } from './home-reminders';

const card = (kind: ReminderCard['kind'], closesOn: string | null): ReminderCard => ({ kind, id: `${kind}:${closesOn}`, title: kind, body: '', href: '#', closesOn });

describe('T2-E 51 Home reminders (answer 2874)', () => {
  it('each kind shows from its lead days before it closes, never after', () => {
    expect(closingSoon('tax_proofs', '2027-01-25', '2027-01-31')).toBe(true);
    expect(closingSoon('tax_proofs', '2027-01-23', '2027-01-31')).toBe(false); // 8 days out
    expect(closingSoon('review', '2026-11-27', '2026-11-30')).toBe(true);
    expect(closingSoon('review', '2026-11-26', '2026-11-30')).toBe(false);
    expect(closingSoon('survey', '2026-11-28', '2026-11-30')).toBe(true);
    expect(closingSoon('survey', '2026-12-01', '2026-11-30')).toBe(false); // closed
  });

  it('a sent-back request first, then the soonest; at most 2', () => {
    const out = pickReminders([card('survey', '2026-11-29'), card('review', '2026-11-28'), card('sent_back', null), card('tax_regime', '2026-11-30')], () => true);
    expect(out.map((c) => c.kind)).toEqual(['sent_back', 'review']);
  });

  it('negative: a kind the company switched off never shows', () => {
    const out = pickReminders([card('review', '2026-11-28'), card('survey', '2026-11-29')], (k) => k !== 'review');
    expect(out.map((c) => c.kind)).toEqual(['survey']);
    expect(pickReminders([card('review', '2026-11-28')], () => false)).toEqual([]);
  });
});
