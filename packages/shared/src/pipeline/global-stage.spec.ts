import { deriveGlobalStage, GLOBAL_STAGES } from './global-stage';

const e = (category: any, archived = false) => ({ category, archived });

describe('deriveGlobalStage', () => {
  it('lists the seven global stages in order', () => {
    expect(GLOBAL_STAGES).toEqual(['new','in_review','engaged','available','offered','hired','rejected']);
  });
  it('no entries, never contacted -> new', () => {
    expect(deriveGlobalStage([], false)).toBe('new');
  });
  it('no entries but contacted -> in_review', () => {
    expect(deriveGlobalStage([], true)).toBe('in_review');
  });
  it('a non-archived active entry -> engaged', () => {
    expect(deriveGlobalStage([e('active')], true)).toBe('engaged');
  });
  it('a non-archived offer entry -> offered (beats engaged)', () => {
    expect(deriveGlobalStage([e('active'), e('offer')], true)).toBe('offered');
  });
  it('a non-archived hired entry -> hired (beats everything)', () => {
    expect(deriveGlobalStage([e('active'), e('offer'), e('hired'), e('rejected')], true)).toBe('hired');
  });
  it('all entries terminal, one archived (freed) -> available (beats rejected)', () => {
    expect(deriveGlobalStage([e('rejected'), e('active', true)], true)).toBe('available');
  });
  it('only rejected entries -> rejected', () => {
    expect(deriveGlobalStage([e('rejected')], true)).toBe('rejected');
  });
  it('a hired entry that was itself archived does not count as hired', () => {
    // e.g. hired then the job closed/archived; falls to available via the archived flag
    expect(deriveGlobalStage([e('hired', true)], true)).toBe('available');
  });
});
