import { correctionDocument, heldReason, minutesAmount, quarterMonths, spreadMinutes } from './billing';

describe('project billing rules (P-6)', () => {
  it('minutes at an hourly rate, whole paise', () => {
    expect(minutesAmount(60, 160000n)).toBe(160000n);
    expect(minutesAmount(90, 160000n)).toBe(240000n);
    expect(minutesAmount(1, 100n)).toBe(2n); // 1.67 paise rounds to 2
    expect(minutesAmount(0, 160000n)).toBe(0n);
  });

  it('spreads a new week total: less off the last booked day, more onto it', () => {
    expect(spreadMinutes([480, 480, 480, 0, 0, 0, 0], 960)).toEqual([480, 480, 0, 0, 0, 0, 0]);
    expect(spreadMinutes([480, 480, 480, 0, 0, 0, 0], 1200)).toEqual([480, 480, 240, 0, 0, 0, 0]);
    expect(spreadMinutes([480, 480, 0, 0, 0, 0, 0], 1200)).toEqual([480, 720, 0, 0, 0, 0, 0]);
    expect(spreadMinutes([1440, 0, 0, 0, 0, 0, 0], 1500)).toEqual([1440, 60, 0, 0, 0, 0, 0]);
    expect(spreadMinutes([0, 0, 0, 0, 0, 0, 0], 60)).toEqual([60, 0, 0, 0, 0, 0, 0]);
    expect(spreadMinutes([480, 0, 0, 0, 0, 0, 0], 0)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(spreadMinutes([480, 0, 0, 0, 0, 0, 0], -1)).toBeNull();
    expect(spreadMinutes([480, 0, 0, 0, 0, 0, 0], 7 * 1440 + 1)).toBeNull();
  });

  it('fewer hours make a credit note, more a supplementary invoice, only on billed time (1416)', () => {
    expect(correctionDocument(true, 2640, 2160)).toBe('credit_note');
    expect(correctionDocument(true, 2640, 2880)).toBe('supplementary');
    expect(correctionDocument(false, 2640, 2160)).toBeNull();
    expect(correctionDocument(true, 2640, 2640)).toBeNull();
  });

  it('holds items that cannot be billed yet', () => {
    expect(heldReason({ clientId: null })).toBe('no client on the project');
    expect(heldReason({ clientId: 'c', clientStatus: 'waiting', needsRate: true, ratePaise: 1n })).toBe('waiting for client approval');
    expect(heldReason({ clientId: 'c', clientStatus: 'sent_back' })).toBe('sent back by the client');
    expect(heldReason({ clientId: 'c', milestoneStatus: 'completed' })).toBe('waiting for client acceptance');
    expect(heldReason({ clientId: 'c', needsRate: true, ratePaise: null })).toBe('no bill rate on the project');
    expect(heldReason({ clientId: 'c', needsFee: true, fee: null })).toBe('no fee on the project');
    expect(heldReason({ clientId: 'c', clientStatus: 'approved', needsRate: true, ratePaise: 5n })).toBeNull();
  });

  it('a quarter is its three months', () => {
    expect(quarterMonths('2026-Q3')).toEqual(['2026-07-01', '2026-08-01', '2026-09-01']);
    expect(quarterMonths('2027-Q1')).toEqual(['2027-01-01', '2027-02-01', '2027-03-01']);
  });
});
