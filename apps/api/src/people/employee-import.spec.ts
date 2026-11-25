import ExcelJS from 'exceljs';
import { fieldIssues, guessFields, importDate, plain, readImportFile } from './employee-import';

// PPL-07: reading an employee file and the plain-word problems a row can have on its own.
describe('employee import file (PPL-07)', () => {
  it('reads a CSV, keeps the file row numbers, skips blank lines and guesses the fields', async () => {
    const f = await readImportFile(Buffer.from('﻿Emp No,Full Name,DOJ,Dept,Personal Mobile\nKF-1,Harini Suresh,01 Oct 2026,Quality,98401 22871\n\nKF-2,=1+1,2026-10-05,Sales,\n'), 'joiners.csv');
    expect(f.columns.map((c) => c.field)).toEqual(['code', 'name', 'joined', 'department', null]);
    expect(f.columns[1].sample).toBe('Harini Suresh');
    expect(f.rows).toEqual([
      { row: 2, cells: ['KF-1', 'Harini Suresh', '01 Oct 2026', 'Quality', '98401 22871'] },
      { row: 4, cells: ['KF-2', '=1+1', '2026-10-05', 'Sales', ''] },
    ]);
  });

  it('reads the first sheet of an .xlsx file, Excel dates as dd MMM yyyy', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Joiners');
    ws.addRow(['Name', 'Joining date']);
    ws.addRow(['Leela Prasad', new Date(Date.UTC(2026, 9, 5))]);
    const f = await readImportFile(Buffer.from(await wb.xlsx.writeBuffer()), 'joiners.xlsx');
    expect(f.rows).toEqual([{ row: 2, cells: ['Leela Prasad', '05 Oct 2026'] }]);
  });

  it('refuses other file types, empty files, nameless or repeated columns and too many rows', async () => {
    await expect(readImportFile(Buffer.from('x'), 'a.xls')).rejects.toThrow('Upload a .csv or .xlsx file.');
    await expect(readImportFile(Buffer.from('Name\n'), 'a.csv')).rejects.toThrow('no rows');
    await expect(readImportFile(Buffer.from('Name,,DOJ\na,b,c\n'), 'a.csv')).rejects.toThrow('has no name');
    await expect(readImportFile(Buffer.from('Name,name\na,b\n'), 'a.csv')).rejects.toThrow('same name');
    await expect(readImportFile(Buffer.from(`Name\n${'a\n'.repeat(501)}`), 'a.csv')).rejects.toThrow('more than 500 rows');
    await expect(readImportFile(Buffer.alloc(2 * 1024 * 1024 + 1), 'a.csv')).rejects.toThrow('larger than 2 MB');
  });

  it('matches each field once', () => {
    expect(guessFields(['Email', 'Work email', 'Reports To'])).toEqual(['email', null, 'manager']);
  });

  it('reads three date forms and refuses impossible dates', () => {
    expect(importDate('01 Oct 2026')).toBe('2026-10-01');
    expect(importDate('2026-10-01')).toBe('2026-10-01');
    expect(importDate('1/10/2026')).toBe('2026-10-01');
    expect(importDate('31 Feb 2026')).toBeNull();
    expect(importDate('1/10/26')).toBeNull();
    // Excel writes dates into a CSV as 01-Nov-26.
    expect(importDate('01-Nov-26')).toBe('2026-11-01');
    expect(importDate('1-nov-2026')).toBe('2026-11-01');
  });

  it('says what is wrong with a row in plain words', () => {
    const issues = fieldIssues({ name: '', pan: 'CFBPB8812', joined: '1/10/26', department: 'Quality', status: 'temp' });
    expect(issues).toEqual([
      { field: 'Name', message: 'Enter the employee name.' },
      { field: 'PAN', message: 'Enter a 10-character PAN like ABCDE1234F.' },
      { field: 'Joining date', message: 'Enter the date as dd MMM yyyy, like 01 Oct 2026.' },
      { field: 'Designation', message: 'Enter the designation.' },
      { field: 'Location', message: 'Enter the location.' },
      { field: 'Employment type', message: 'Enter the employment type.' },
      { field: 'Status', message: 'Use Probation or Confirmed, or leave it blank for Probation.' },
    ]);
    expect(fieldIssues({ name: 'A B', joined: '01 Oct 2026', department: 'd', designation: 'x', location: 'l', type: 't' })).toEqual([]);
  });

  it('never shows internal rule numbers', () => {
    expect(plain('That department is archived (YX-ORG-04).')).toBe('That department is archived.');
  });
});
