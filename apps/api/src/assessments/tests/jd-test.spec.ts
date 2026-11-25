import { matchSkills, planSections, shares } from './jd-test';

describe('build a test from a job description (answer 2151)', () => {
  it('shares are whole numbers that add up to 100; nothing given splits evenly', () => {
    expect(shares([30, 25, 25, 20])).toEqual([30, 25, 25, 20]);
    expect(shares([1, 1, 1])).toEqual([34, 33, 33]);
    expect(shares([0, 0])).toEqual([50, 50]);
    expect(shares([])).toEqual([]);
  });

  it('matches the company skill names ignoring case and spaces; merges repeats; keeps the unknown ones unmapped', () => {
    const tags = [{ id: 't1', name: 'Java  Streams' }, { id: 't2', name: 'SQL joins' }];
    expect(matchSkills([{ name: 'java streams', weight: 30 }, { name: 'SQL Joins', weight: 20 }, { name: 'Java Streams', weight: 10 }, { name: 'Spring', weight: 40 }, { name: ' ', weight: 50 }], tags)).toEqual([
      { name: 'java streams', tagId: 't1', percent: 40 },
      { name: 'SQL Joins', tagId: 't2', percent: 20 },
      { name: 'Spring', tagId: null, percent: 40 },
    ]);
  });

  it('plans one pool section per skill, drawing at least one question each', () => {
    expect(planSections([{ tagId: 't1', name: 'Java', percent: 70 }, { tagId: 't2', name: 'SQL', percent: 30 }], 20)).toEqual([
      { tagId: 't1', title: 'Java', weightPercent: 70, poolSize: 14 },
      { tagId: 't2', title: 'SQL', weightPercent: 30, poolSize: 6 },
    ]);
    expect(planSections([{ tagId: 't1', name: 'Java', percent: 98 }, { tagId: 't2', name: 'SQL', percent: 2 }], 10)[1]!.poolSize).toBe(1);
  });
});
