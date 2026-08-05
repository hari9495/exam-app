import { parseBulkInviteFile, detectFileKind } from './bulk-invite-parser';
import ExcelJS from 'exceljs';

async function buildXlsxBuffer(rows: Record<string, string>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Candidates');
  const headers = Object.keys(rows[0]);
  sheet.columns = headers.map((header) => ({ header, key: header }));
  rows.forEach((row) => sheet.addRow(row));
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe('detectFileKind', () => {
  it('recognizes .csv and .xlsx case-insensitively', () => {
    expect(detectFileKind('candidates.csv')).toBe('csv');
    expect(detectFileKind('Candidates.CSV')).toBe('csv');
    expect(detectFileKind('candidates.xlsx')).toBe('xlsx');
    expect(detectFileKind('candidates.XLSX')).toBe('xlsx');
  });

  it('returns null for an unsupported extension', () => {
    expect(detectFileKind('candidates.txt')).toBeNull();
    expect(detectFileKind('candidates')).toBeNull();
  });
});

describe('parseBulkInviteFile (csv)', () => {
  it('parses valid rows including an optional phone column, combining First/Last Name into one name', async () => {
    const csv = [
      'Email,First Name,Last Name,Phone',
      'alice@test.com,Alice,Smith,555-1234',
      'bob@test.com,Bob,Jones,',
    ].join('\n');

    const { rows, errors } = await parseBulkInviteFile(Buffer.from(csv), 'csv');

    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { rowNumber: 1, email: 'alice@test.com', name: 'Alice Smith', phone: '555-1234' },
      { rowNumber: 2, email: 'bob@test.com', name: 'Bob Jones', phone: undefined },
    ]);
  });

  it('includes an optional Middle Name column in the combined name, and still accepts files without it', async () => {
    const csv = [
      'Email,First Name,Middle Name,Last Name,Phone',
      'alice@test.com,Alice,Marie,Smith,',
      'bob@test.com,Bob,,Jones,',
    ].join('\n');

    const { rows, errors } = await parseBulkInviteFile(Buffer.from(csv), 'csv');

    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { rowNumber: 1, email: 'alice@test.com', name: 'Alice Marie Smith', phone: undefined },
      { rowNumber: 2, email: 'bob@test.com', name: 'Bob Jones', phone: undefined },
    ]);
  });

  it('flags a row with a missing email', async () => {
    const csv = ['Email,First Name,Last Name,Phone', ',Alice,Smith,555-1234'].join('\n');

    const { rows, errors } = await parseBulkInviteFile(Buffer.from(csv), 'csv');

    expect(rows).toEqual([]);
    expect(errors).toEqual([{ row: 1, message: 'Invalid or missing email: ""' }]);
  });

  it('flags a row with a malformed email', async () => {
    const csv = ['Email,First Name,Last Name,Phone', 'not-an-email,Alice,Smith,'].join('\n');

    const { errors } = await parseBulkInviteFile(Buffer.from(csv), 'csv');

    expect(errors).toEqual([{ row: 1, message: 'Invalid or missing email: "not-an-email"' }]);
  });

  it('flags a row with a missing first name', async () => {
    const csv = ['Email,First Name,Last Name,Phone', 'alice@test.com,,Smith,'].join('\n');

    const { errors } = await parseBulkInviteFile(Buffer.from(csv), 'csv');

    expect(errors).toEqual([{ row: 1, message: 'Missing first name' }]);
  });

  it('flags a row with a missing last name', async () => {
    const csv = ['Email,First Name,Last Name,Phone', 'alice@test.com,Alice,,'].join('\n');

    const { errors } = await parseBulkInviteFile(Buffer.from(csv), 'csv');

    expect(errors).toEqual([{ row: 1, message: 'Missing last name' }]);
  });

  it('assigns sequential row numbers and continues past a bad row', async () => {
    const csv = [
      'Email,First Name,Last Name,Phone',
      'alice@test.com,Alice,Smith,',
      'not-an-email,Bad,Row,',
      'carol@test.com,Carol,Jones,',
    ].join('\n');

    const { rows, errors } = await parseBulkInviteFile(Buffer.from(csv), 'csv');

    expect(rows.map((r) => r.rowNumber)).toEqual([1, 3]);
    expect(errors).toEqual([{ row: 2, message: 'Invalid or missing email: "not-an-email"' }]);
  });
});

describe('parseBulkInviteFile (xlsx)', () => {
  it('parses a valid row from an in-memory workbook, combining First/Last Name into one name', async () => {
    const buffer = await buildXlsxBuffer([{ Email: 'alice@test.com', 'First Name': 'Alice', 'Last Name': 'Smith', Phone: '555-1234' }]);

    const { rows, errors } = await parseBulkInviteFile(buffer, 'xlsx');

    expect(errors).toEqual([]);
    expect(rows).toEqual([{ rowNumber: 1, email: 'alice@test.com', name: 'Alice Smith', phone: '555-1234' }]);
  });
});
