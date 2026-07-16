import { parseBulkQuestionFile, detectFileKind } from './bulk-upload-parser';
import ExcelJS from 'exceljs';

async function buildXlsxBuffer(rows: Record<string, string | number>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Questions');
  const headers = Object.keys(rows[0]);
  sheet.columns = headers.map((header) => ({ header, key: header }));
  rows.forEach((row) => sheet.addRow(row));
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe('detectFileKind', () => {
  it('recognizes .csv and .xlsx case-insensitively', () => {
    expect(detectFileKind('questions.csv')).toBe('csv');
    expect(detectFileKind('Questions.CSV')).toBe('csv');
    expect(detectFileKind('questions.xlsx')).toBe('xlsx');
    expect(detectFileKind('questions.XLSX')).toBe('xlsx');
  });

  it('returns null for an unsupported extension', () => {
    expect(detectFileKind('questions.txt')).toBeNull();
    expect(detectFileKind('questions')).toBeNull();
  });
});

describe('parseBulkQuestionFile (csv)', () => {
  it('parses a valid single_mcq row with tags split by semicolon', async () => {
    const csv = [
      'Type,Text,Difficulty,Marks,NegativeMarks,Tags,Option1Text,Option1Correct,Option2Text,Option2Correct',
      'single_mcq,What is 2+2?,easy,5,1,math;basics,3,FALSE,4,TRUE',
    ].join('\n');

    const { rows, errors } = await parseBulkQuestionFile(Buffer.from(csv), 'csv');

    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        rowNumber: 1,
        type: 'single_mcq',
        text: 'What is 2+2?',
        difficulty: 'easy',
        marks: 5,
        negativeMarks: 1,
        topic: undefined,
        category: undefined,
        tags: ['math', 'basics'],
        codeLanguage: undefined,
        starterCode: undefined,
        options: [
          { text: '3', isCorrect: false },
          { text: '4', isCorrect: true },
        ],
      },
    ]);
  });

  it('parses a valid code row with zero options', async () => {
    const csv = [
      'Type,Text,Difficulty,Marks,CodeLanguage,StarterCode',
      'code,Reverse a string,medium,10,javascript,function reverse(s) {}',
    ].join('\n');

    const { rows, errors } = await parseBulkQuestionFile(Buffer.from(csv), 'csv');

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].options).toEqual([]);
    expect(rows[0].codeLanguage).toBe('javascript');
    expect(rows[0].starterCode).toBe('function reverse(s) {}');
  });

  it('reports a structural error for missing Marks', async () => {
    const csv = ['Type,Text,Difficulty,Marks', 'true_false,Is the sky blue?,easy,'].join('\n');

    const { rows, errors } = await parseBulkQuestionFile(Buffer.from(csv), 'csv');

    expect(rows).toEqual([]);
    expect(errors).toEqual([{ row: 1, message: 'Marks must be a whole number, got ""' }]);
  });

  it('reports a structural error for non-numeric Marks', async () => {
    const csv = ['Type,Text,Difficulty,Marks', 'true_false,Is the sky blue?,easy,five'].join('\n');

    const { errors } = await parseBulkQuestionFile(Buffer.from(csv), 'csv');

    expect(errors).toEqual([{ row: 1, message: 'Marks must be a whole number, got "five"' }]);
  });

  it('ignores blank option slots and defaults NegativeMarks to 0 when omitted', async () => {
    const csv = [
      'Type,Text,Difficulty,Marks,Option1Text,Option1Correct,Option2Text,Option2Correct,Option3Text,Option3Correct',
      'true_false,Is the sky blue?,easy,2,True,TRUE,False,FALSE,,',
    ].join('\n');

    const { rows, errors } = await parseBulkQuestionFile(Buffer.from(csv), 'csv');

    expect(errors).toEqual([]);
    expect(rows[0].negativeMarks).toBe(0);
    expect(rows[0].options).toEqual([
      { text: 'True', isCorrect: true },
      { text: 'False', isCorrect: false },
    ]);
  });

  it('assigns sequential row numbers and continues past a bad row', async () => {
    const csv = [
      'Type,Text,Difficulty,Marks,Option1Text,Option1Correct,Option2Text,Option2Correct',
      'true_false,Row one,easy,2,True,TRUE,False,FALSE',
      'true_false,Row two - bad marks,easy,notanumber,True,TRUE,False,FALSE',
      'true_false,Row three,easy,3,True,TRUE,False,FALSE',
    ].join('\n');

    const { rows, errors } = await parseBulkQuestionFile(Buffer.from(csv), 'csv');

    expect(rows.map((r) => r.rowNumber)).toEqual([1, 3]);
    expect(errors).toEqual([{ row: 2, message: 'Marks must be a whole number, got "notanumber"' }]);
  });
});

describe('parseBulkQuestionFile (xlsx)', () => {
  it('parses a valid row from an in-memory workbook', async () => {
    const buffer = await buildXlsxBuffer([
      {
        Type: 'true_false',
        Text: 'Is the sky blue?',
        Difficulty: 'easy',
        Marks: 2,
        Option1Text: 'True',
        Option1Correct: 'TRUE',
        Option2Text: 'False',
        Option2Correct: 'FALSE',
      },
    ]);

    const { rows, errors } = await parseBulkQuestionFile(buffer, 'xlsx');

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('true_false');
    expect(rows[0].options).toEqual([
      { text: 'True', isCorrect: true },
      { text: 'False', isCorrect: false },
    ]);
  });
});
