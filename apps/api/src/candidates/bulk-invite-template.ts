import ExcelJS from 'exceljs';

const HEADERS = ['Email', 'First Name', 'Middle Name', 'Last Name', 'Phone'];
const EXAMPLE_ROW = { Email: 'alice@example.com', 'First Name': 'Alice', 'Middle Name': '', 'Last Name': 'Smith', Phone: '555-1234' };

export async function generateBulkInviteTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Candidates');
  sheet.columns = HEADERS.map((header) => ({ header, key: header, width: 24 }));
  sheet.addRow(EXAMPLE_ROW);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
