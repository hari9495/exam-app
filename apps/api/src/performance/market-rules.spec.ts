import { marketStale, readMarketCsv } from './market-rules';

const grades = [
  { id: 'g3', name: 'G3', code: 'g-3' },
  { id: 'g4', name: 'G4', code: null },
];

describe('PRF-10 market data CSV', () => {
  it('reads good rows by grade name or code, any case, with amounts written Indian style', () => {
    const r = readMarketCsv('grade,min,median,max,currency\nG3,"5,10,000",600000,720000,inr\n', grades);
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([{ gradeId: 'g3', grade: 'G3', min: 510000, median: 600000, max: 720000, currency: 'INR' }]);
    expect(readMarketCsv('Grade,Min,Median,Max,Currency\nG-3,1,2,3,INR', grades).rows[0]!.gradeId).toBe('g3');
  });

  it('lists every bad row and keeps nothing', () => {
    const r = readMarketCsv(['grade,min,median,max,currency', 'G3,500000,600000,700000,INR', 'G9,1,2,3,INR', 'G4,900,800,700,INR', 'G3,1,2,3,INR', 'G4,0,abc,5,USD'].join('\n'), grades);
    expect(r.rows).toEqual([]);
    expect(r.errors.map((e) => e.row)).toEqual([3, 4, 5, 6]);
    expect(r.errors[0]!.message).toMatch(/No grade "G9"/);
    expect(r.errors[1]!.message).toMatch(/must go up/);
    expect(r.errors[2]!.message).toMatch(/already in the file/);
    expect(r.errors[3]!.message).toMatch(/min must be an amount/i);
    expect(r.errors[3]!.message).toMatch(/same currency \(INR\)/);
  });

  it('refuses a file without the columns, an empty file and too many rows', () => {
    expect(readMarketCsv('grade,min,max\nG3,1,2', grades).errors[0]!.message).toMatch(/Missing: median, currency/);
    expect(readMarketCsv('', grades).errors[0]!.message).toBe('The file is empty.');
    expect(readMarketCsv('grade,min,median,max,currency\n', grades).errors[0]!.row).toBe(2);
    const many = ['grade,min,median,max,currency', ...Array.from({ length: 1001 }, () => 'G3,1,2,3,INR')].join('\n');
    expect(readMarketCsv(many, grades).errors[0]!.message).toMatch(/Up to 1000/);
  });

  it('is stale after the company setting in months, not on the day', () => {
    expect(marketStale('2025-11-03', '2026-11-03', 12)).toBe(false);
    expect(marketStale('2025-11-03', '2026-11-04', 12)).toBe(true);
    expect(marketStale('2026-05-03', '2026-11-03', 6)).toBe(false);
    expect(marketStale('2026-05-02', '2026-11-03', 6)).toBe(true);
  });
});
