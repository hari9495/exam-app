import { parse } from 'csv-parse/sync';

export interface CandidateCsvRow {
  email: string;
  name: string;
  phone?: string;
}

export interface CandidateCsvError {
  row: number;
  reason: string;
}

export interface ParsedCandidateCsv {
  rows: CandidateCsvRow[];
  errors: CandidateCsvError[];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseCandidateCsv(csvContent: string): ParsedCandidateCsv {
  const records: Record<string, string>[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const rows: CandidateCsvRow[] = [];
  const errors: CandidateCsvError[] = [];

  records.forEach((record, index) => {
    const rowNumber = index + 1;
    const email = record.email ?? '';
    const name = record.name ?? '';
    const phone = record.phone?.trim() || undefined;

    if (!EMAIL_PATTERN.test(email)) {
      errors.push({ row: rowNumber, reason: `Invalid or missing email: "${email}"` });
      return;
    }
    if (!name) {
      errors.push({ row: rowNumber, reason: 'Missing name' });
      return;
    }

    rows.push({ email, name, phone });
  });

  return { rows, errors };
}
