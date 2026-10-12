import { toCsv } from './reports.service';

describe('expenses E5: report CSV', () => {
  it('quotes what needs quoting and never lets a cell start a spreadsheet formula', () => {
    const csv = toCsv({ columns: [{ key: 'a', label: 'Name' }, { key: 'b', label: 'Amount' }], rows: [{ a: 'Hotel, "Sea View"', b: '-120.00' }, { a: '=HYPERLINK("x")', b: null }, { a: '@SUM(A1)', b: '5900.00' }] });
    expect(csv).toBe('Name,Amount\r\n"Hotel, ""Sea View""",-120.00\r\n"\'=HYPERLINK(""x"")",\r\n\'@SUM(A1),5900.00\r\n');
  });
});
