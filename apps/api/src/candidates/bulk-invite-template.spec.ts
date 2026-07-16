import ExcelJS from 'exceljs';
import { generateBulkInviteTemplate } from './bulk-invite-template';

describe('generateBulkInviteTemplate', () => {
  it('produces a workbook with the Email/Name/Phone headers and one example row', async () => {
    const buffer = await generateBulkInviteTemplate();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];

    const headerRow = sheet.getRow(1).values as unknown[];
    const headers = headerRow.slice(1).map((v) => String(v));
    expect(headers).toEqual(['Email', 'Name', 'Phone']);

    expect(sheet.rowCount).toBe(2);
    const exampleRow = sheet.getRow(2).values as unknown[];
    expect(String(exampleRow[1])).toContain('@');
    expect(String(exampleRow[2]).length).toBeGreaterThan(0);
  });
});
