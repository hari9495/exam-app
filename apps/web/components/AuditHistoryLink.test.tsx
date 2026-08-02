import { render, screen } from '@testing-library/react';
import { AuditHistoryLink } from './AuditHistoryLink';

describe('AuditHistoryLink', () => {
  it('links to the audit log pre-filtered by entity type, id, and name', () => {
    render(<AuditHistoryLink entityType="exam" entityId="exam-1" entityName="Backend Round" />);

    const link = screen.getByRole('link', { name: /view history/i });
    const href = link.getAttribute('href')!;
    expect(href.startsWith('/audit-log?')).toBe(true);
    const params = new URLSearchParams(href.split('?')[1]);
    expect(params.get('entityType')).toBe('exam');
    expect(params.get('entityId')).toBe('exam-1');
    expect(params.get('entityName')).toBe('Backend Round');
  });

  it('omits entityName from the link when not provided', () => {
    render(<AuditHistoryLink entityType="question" entityId="q-1" />);

    const href = screen.getByRole('link', { name: /view history/i }).getAttribute('href')!;
    expect(href).not.toContain('entityName');
  });
});
