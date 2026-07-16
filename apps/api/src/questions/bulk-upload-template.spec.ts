import ExcelJS from 'exceljs';
import { generateBulkUploadTemplate } from './bulk-upload-template';

describe('generateBulkUploadTemplate', () => {
  it('produces a workbook with the expected headers and one example row per question type', async () => {
    const buffer = await generateBulkUploadTemplate();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];

    const headerRow = sheet.getRow(1).values as unknown[];
    const headers = headerRow.slice(1).map((v) => String(v));
    expect(headers).toEqual([
      'Type', 'Text', 'Difficulty', 'Marks', 'NegativeMarks', 'Topic', 'Category', 'Tags',
      'CodeLanguage', 'StarterCode',
      'Option1Text', 'Option1Correct', 'Option2Text', 'Option2Correct',
      'Option3Text', 'Option3Correct', 'Option4Text', 'Option4Correct',
      'Option5Text', 'Option5Correct', 'Option6Text', 'Option6Correct',
    ]);

    const typeColumnIndex = headers.indexOf('Type') + 1;
    const rowTypes: string[] = [];
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      rowTypes.push(String(sheet.getRow(rowNumber).getCell(typeColumnIndex).value));
    }
    expect(rowTypes).toEqual(['single_mcq', 'multi_mcq', 'true_false', 'code']);
  });
});
