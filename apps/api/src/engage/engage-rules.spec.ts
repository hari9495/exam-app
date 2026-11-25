import { carriesAmount, reminderDue } from './engage-rules';

describe('engage rules', () => {
  it('spots an amount meant to stay in the app', () => {
    expect(carriesAmount('September bonus: ₹12,000 credited')).toBe(true);
    expect(carriesAmount('Bonus of Rs. 5000')).toBe(true);
    expect(carriesAmount('INR 300 meal card')).toBe(true);
    expect(carriesAmount('Revised canteen hygiene rules, Hosur plant')).toBe(false);
    expect(carriesAmount('Hall 2 on floor 3')).toBe(false);
  });
  it('reminds on day 2 and day 5 after publishing, then stops (answer 2602)', () => {
    expect(reminderDue('2026-11-01', '2026-11-02', 0)).toBe(false);
    expect(reminderDue('2026-11-01', '2026-11-03', 0)).toBe(true);
    expect(reminderDue('2026-11-01', '2026-11-05', 1)).toBe(false);
    expect(reminderDue('2026-11-01', '2026-11-06', 1)).toBe(true);
    expect(reminderDue('2026-11-01', '2026-12-01', 2)).toBe(false);
  });
});
