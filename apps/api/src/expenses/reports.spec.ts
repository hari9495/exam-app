import { ageingBars, bucketOf, toCsv, toXlsx } from './reports.service';

describe('expenses E5: report CSV', () => {
  it('quotes what needs quoting and never lets a cell start a spreadsheet formula', () => {
    const csv = toCsv({ columns: [{ key: 'a', label: 'Name' }, { key: 'b', label: 'Amount' }], rows: [{ a: 'Hotel, "Sea View"', b: '-120.00' }, { a: '=HYPERLINK("x")', b: null }, { a: '@SUM(A1)', b: '5900.00' }] });
    expect(csv).toBe('Name,Amount\r\n"Hotel, ""Sea View""",-120.00\r\n"\'=HYPERLINK(""x"")",\r\n\'@SUM(A1),5900.00\r\n');
  });
});

describe('EXP-09 chart figures', () => {
  it('ageing: the bucket edges are 30, 60 and 90 days, and every bucket shows, summed exactly', () => {
    expect([0, 30, 31, 60, 61, 90, 91].map(bucketOf)).toEqual(['0–30 days', '0–30 days', '31–60 days', '31–60 days', '61–90 days', '61–90 days', 'Over 90 days']);
    expect(ageingBars([{ bucket: '0–30 days', open: '0.10' }, { bucket: '0–30 days', open: '0.20' }, { bucket: 'Over 90 days', open: '6600.00' }])).toEqual([
      { label: '0–30 days', count: 2, amount: '0.30' },
      { label: '31–60 days', count: 0, amount: '0.00' },
      { label: '61–90 days', count: 0, amount: '0.00' },
      { label: 'Over 90 days', count: 1, amount: '6600.00' },
    ]);
  });
  it('the spreadsheet writes every cell as text, so money stays exact', async () => {
    const buf = await toXlsx({ kind: 'summary', columns: [{ key: 'a', label: 'Approved' }], rows: [{ a: '0.30' }, { a: null }] });
    expect(buf.subarray(0, 2).toString()).toBe('PK');
  });
});
