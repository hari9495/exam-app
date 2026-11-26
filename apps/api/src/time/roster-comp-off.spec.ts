import { rosterCompOffDays } from './leave-rules';
import { SETTINGS } from '../org-structure/settings-registry';

// Answer 2757: comp-off from the roster, without a claim, when the company turns it on.
const day = { usualOff: true, fullHoliday: false, rostered: true, workedMinutes: 480, halfDayMinutes: 240, fullDayMinutes: 450, claimed: false, credited: false };

describe('comp-off from the roster (answer 2757)', () => {
  it('is off by default, a company-wide choice', () => {
    expect(SETTINGS['leave.comp_off.auto_from_roster']).toMatchObject({ default: 'off', scopes: ['tenant'], values: ['off', 'on'] });
  });

  it('a rostered weekly off or full holiday worked gives a full or half day by the minutes worked', () => {
    expect(rosterCompOffDays(day)).toBe(1);
    expect(rosterCompOffDays({ ...day, workedMinutes: 300 })).toBe(0.5);
    expect(rosterCompOffDays({ ...day, usualOff: false, fullHoliday: true })).toBe(1);
  });

  it('negative: an ordinary working day, too few minutes, no roster, or a day already claimed or credited gives nothing', () => {
    expect(rosterCompOffDays({ ...day, usualOff: false })).toBe(0);
    expect(rosterCompOffDays({ ...day, workedMinutes: 120 })).toBe(0);
    expect(rosterCompOffDays({ ...day, rostered: false })).toBe(0);
    expect(rosterCompOffDays({ ...day, claimed: true })).toBe(0);
    expect(rosterCompOffDays({ ...day, credited: true })).toBe(0);
  });
});
