import ExcelJS from 'exceljs';

const HEADERS = [
  'Type', 'Text', 'Difficulty', 'Marks', 'NegativeMarks', 'Topic', 'Category', 'Tags',
  'LanguageMode', 'CodeLanguage', 'StarterCode',
  'Option1Text', 'Option1Correct', 'Option2Text', 'Option2Correct',
  'Option3Text', 'Option3Correct', 'Option4Text', 'Option4Correct',
  'Option5Text', 'Option5Correct', 'Option6Text', 'Option6Correct',
];

const EXAMPLE_ROWS: Record<string, string | number>[] = [
  {
    Type: 'single_mcq', Text: 'What is 2 + 2?', Difficulty: 'easy', Marks: 5, NegativeMarks: 0,
    Topic: 'Arithmetic', Tags: 'math;basics',
    Option1Text: '3', Option1Correct: 'FALSE', Option2Text: '4', Option2Correct: 'TRUE',
  },
  {
    Type: 'multi_mcq', Text: 'Which of these are prime numbers?', Difficulty: 'medium', Marks: 10, NegativeMarks: 2,
    Tags: 'math',
    Option1Text: '2', Option1Correct: 'TRUE', Option2Text: '4', Option2Correct: 'FALSE', Option3Text: '5', Option3Correct: 'TRUE',
  },
  {
    Type: 'true_false', Text: 'The sky is blue.', Difficulty: 'easy', Marks: 2, NegativeMarks: 0,
    Option1Text: 'True', Option1Correct: 'TRUE', Option2Text: 'False', Option2Correct: 'FALSE',
  },
  {
    Type: 'code', Text: 'Write a function that reverses a string.', Difficulty: 'medium', Marks: 10, NegativeMarks: 0,
    LanguageMode: 'fixed',
    CodeLanguage: 'javascript', StarterCode: 'function reverse(str) {\n\n}',
  },
];

export async function generateBulkUploadTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Questions');
  sheet.columns = HEADERS.map((header) => ({ header, key: header, width: 18 }));
  EXAMPLE_ROWS.forEach((row) => sheet.addRow(row));
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
