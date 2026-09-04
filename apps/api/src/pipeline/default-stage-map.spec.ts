import { legacyStageToSeededStageKey } from './default-stage-map';

describe('legacyStageToSeededStageKey', () => {
  it('maps each legacy active stage to its same-named seeded stage', () => {
    expect(legacyStageToSeededStageKey('applied', false)).toBe('applied');
    expect(legacyStageToSeededStageKey('screened', false)).toBe('screened');
    expect(legacyStageToSeededStageKey('interview', false)).toBe('interview');
    expect(legacyStageToSeededStageKey('offer', false)).toBe('offer');
    expect(legacyStageToSeededStageKey('hired', false)).toBe('hired');
  });
  it('maps any rejected entry to the rejected stage regardless of stage', () => {
    expect(legacyStageToSeededStageKey('interview', true)).toBe('rejected');
    expect(legacyStageToSeededStageKey('applied', true)).toBe('rejected');
  });
});
