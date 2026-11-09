import { vendorMissing } from './vendors.service';

describe('vendorMissing (HIR-21: a vendor is complete before a client job is shared)', () => {
  const full = { agreementSignedOn: new Date('2026-01-01'), pan: 'ABCDE1234F', bankVerifiedAt: new Date(), tdsSection: '194C' };

  it('a vendor with every document lacks nothing', () => {
    expect(vendorMissing(full)).toEqual([]);
  });

  it('names each missing document in plain words, in a fixed order', () => {
    expect(vendorMissing({ agreementSignedOn: null, pan: null, bankVerifiedAt: null, tdsSection: null })).toEqual(['signed agreement', 'PAN', 'verified bank account', 'TDS section']);
    expect(vendorMissing({ ...full, bankVerifiedAt: null })).toEqual(['verified bank account']);
  });
});
