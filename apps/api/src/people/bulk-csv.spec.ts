import { CsvProblem, MAX_BULK_ROWS, parseBulkCsv } from './bulk-csv';

// M01 §3.3 bulk change files: the whole file is refused for a bad header or shape; rows keep their line numbers.
describe('bulk change CSV (M01 §3.3)', () => {
  it('reads rows by header name, case- and spacing-insensitive, keeping file line numbers', () => {
    const rows = parseBulkCsv('﻿Employee Code,change-type,EFFECTIVE_DATE,Location\nKF-0142,transfer,2026-11-01,MYS\n\nKF-0118,transfer,2026-11-01,\n');
    expect(rows).toEqual([
      { line: 2, employee_code: 'KF-0142', change_type: 'transfer', effective_date: '2026-11-01', location: 'MYS' },
      { line: 3, employee_code: 'KF-0118', change_type: 'transfer', effective_date: '2026-11-01' },
    ]);
  });

  it('quoted cells keep commas and formula-looking text stays plain text', () => {
    const [row] = parseBulkCsv('employee_code,change_type,effective_date,reason\nKF-1,transfer,2026-11-01,"Moves, with team"\n');
    expect(row.reason).toBe('Moves, with team');
    expect(parseBulkCsv('employee_code,change_type,effective_date,reason\nKF-1,transfer,2026-11-01,=1+1\n')[0].reason).toBe('=1+1');
  });

  it('refuses unknown, duplicate or missing columns, ragged rows, empty files and oversized files', () => {
    expect(() => parseBulkCsv('employee_code,change_type,effective_date,salary\nx,transfer,2026-01-01,1')).toThrow(/Unknown column: salary/);
    expect(() => parseBulkCsv('employee_code,employee code,change_type,effective_date\nx,x,transfer,2026-01-01')).toThrow(/appears twice/);
    expect(() => parseBulkCsv('employee_code,change_type\nx,transfer')).toThrow(/Missing column: effective_date/);
    expect(() => parseBulkCsv('employee_code,change_type,effective_date\nx,transfer')).toThrow(CsvProblem);
    expect(() => parseBulkCsv('employee_code,change_type,effective_date\n')).toThrow(/no rows/);
    expect(() => parseBulkCsv('x'.repeat(512 * 1024 + 1))).toThrow(/larger than 512 KB/);
    const many = ['employee_code,change_type,effective_date', ...Array.from({ length: MAX_BULK_ROWS + 1 }, (_, i) => `E${i},transfer,2026-11-01`)].join('\n');
    expect(() => parseBulkCsv(many)).toThrow(/At most 500 rows/);
  });
});
