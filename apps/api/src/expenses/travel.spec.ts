import { DevFakeTravelPartner, NoTravelPartner, openBalance, settleClaim, travelPartnerFromEnv, tripBudget } from './travel';

describe('expenses E4: travel partner seam (XP-4.03)', () => {
  const leg = { fromCity: 'Bengaluru', toCity: 'Mumbai', departOn: '2026-11-02', mode: 'air', stayNights: 0 };

  it('the dev fake books a leg with a stable reference and a company-paid fare', async () => {
    const a = new DevFakeTravelPartner();
    const b = await a.book(leg);
    expect(b).toEqual({ provider: 'dev-fake', ref: 'FAKE-20261102-BENMUM', kind: 'ticket', title: 'Bengaluru → Mumbai (air)', amount: '5400.00' });
    expect(await a.book(leg)).toEqual(b);
  });

  it('without a partner, booking is refused with a plain reason', async () => {
    await expect(new NoTravelPartner().book()).rejects.toThrow('Upload the ticket instead');
  });

  it('picks the adapter from the environment, never the fake in production', () => {
    expect(travelPartnerFromEnv(undefined).name).toBe('none');
    expect(travelPartnerFromEnv('dev-fake').name).toBe('dev-fake');
    const was = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => travelPartnerFromEnv('dev-fake')).toThrow('not allowed in production');
    } finally {
      process.env.NODE_ENV = was;
    }
  });
});

describe('expenses E4: advance arithmetic (XP-4.04)', () => {
  it('open balance is the amount less every settlement', () => {
    expect(openBalance('10000', ['7000']).toFixed(2)).toBe('3000.00');
    expect(openBalance(null, []).toFixed(2)).toBe('0.00');
  });

  it('₹10,000 advance, ₹7,000 claimed: nothing more paid, ₹3,000 to return', () => {
    expect(settleClaim('10000', '7000')).toEqual({ adjusted: '7000.00', netPayable: '0.00', leftOnAdvance: '3000.00' });
  });

  it('a claim above the advance pays the difference', () => {
    expect(settleClaim('10000', '12500.50')).toEqual({ adjusted: '10000.00', netPayable: '2500.50', leftOnAdvance: '0.00' });
    expect(settleClaim('0', '800')).toEqual({ adjusted: '0.00', netPayable: '800.00', leftOnAdvance: '0.00' });
  });

  it('company-paid bookings count against the trip budget', () => {
    expect(tripBudget('20000', ['5400'], ['7000'])).toEqual({ estimate: '20000.00', companyPaid: '5400.00', claimed: '7000.00', used: '12400.00', left: '7600.00' });
  });
});
