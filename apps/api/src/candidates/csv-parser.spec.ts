import { parseCandidateCsv } from './csv-parser';

describe('parseCandidateCsv', () => {
  it('parses valid rows including an optional phone column', () => {
    const csv = 'email,name,phone\nalice@test.com,Alice,555-1234\nbob@test.com,Bob,';
    const result = parseCandidateCsv(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toEqual([
      { email: 'alice@test.com', name: 'Alice', phone: '555-1234' },
      { email: 'bob@test.com', name: 'Bob', phone: undefined },
    ]);
  });

  it('flags a row with a missing email', () => {
    const csv = 'email,name,phone\n,Alice,555-1234';
    const result = parseCandidateCsv(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toEqual([{ row: 1, reason: 'Invalid or missing email: ""' }]);
  });

  it('flags a row with a malformed email', () => {
    const csv = 'email,name,phone\nnot-an-email,Alice,';
    const result = parseCandidateCsv(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toEqual([{ row: 1, reason: 'Invalid or missing email: "not-an-email"' }]);
  });

  it('flags a row with a missing name', () => {
    const csv = 'email,name,phone\nalice@test.com,,';
    const result = parseCandidateCsv(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toEqual([{ row: 1, reason: 'Missing name' }]);
  });

  it('continues processing subsequent rows after an earlier row fails, with correct row numbers', () => {
    const csv = 'email,name,phone\nbad-email,Alice,\nbob@test.com,Bob,';
    const result = parseCandidateCsv(csv);

    expect(result.errors).toEqual([{ row: 1, reason: 'Invalid or missing email: "bad-email"' }]);
    expect(result.rows).toEqual([{ email: 'bob@test.com', name: 'Bob', phone: undefined }]);
  });

  it('returns no rows and no errors for a header-only CSV', () => {
    const result = parseCandidateCsv('email,name,phone');
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});
