import { STAGE_CATEGORIES, isTerminalCategory } from './pipeline-categories';

describe('pipeline categories', () => {
  it('lists the five fixed categories in order', () => {
    expect(STAGE_CATEGORIES).toEqual(['active', 'offer', 'hired', 'rejected', 'archived']);
  });
  it('treats hired/rejected/archived as terminal, active/offer as not', () => {
    expect(isTerminalCategory('hired')).toBe(true);
    expect(isTerminalCategory('rejected')).toBe(true);
    expect(isTerminalCategory('archived')).toBe(true);
    expect(isTerminalCategory('active')).toBe(false);
    expect(isTerminalCategory('offer')).toBe(false);
  });
});
