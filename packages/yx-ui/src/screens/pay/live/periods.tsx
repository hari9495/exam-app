// "2026-09" → "September 2026", shared by the live payroll screens. The pay periods and reopen requests screens are the
// PAY-49 design now (../payroll-records.tsx).
export const monthText = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
