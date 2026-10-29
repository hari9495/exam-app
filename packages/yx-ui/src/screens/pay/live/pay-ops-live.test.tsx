import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdvisoriesScreen, RegistersScreen, TaxCertificatesScreen } from './operations';
import { PEOPLE } from './fixtures-5j';
import { ADVISORIES, CERTIFICATES, DECLARATIONS, ENTITIES, LOANS, PROOFS, REGISTERS } from './fixtures-ops';

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const fn = () => vi.fn(async () => ({}) as never);
const nameOf = (id: string) => PEOPLE.find((p) => p.employeeId === id)?.name ?? 'Someone';
const search = async () => PEOPLE.map((p) => ({ id: p.employeeId, name: p.name, employeeCode: p.employeeCode ?? undefined }));

describe('payroll operations screens', () => {

  it('registers: freezing asks first; a signed register only downloads', async () => {
    const onFreeze = fn();
    render(<RegistersScreen state="ready" entities={ENTITIES} entityId="e1" onEntity={vi.fn()} month="2026-09" onMonth={vi.fn()} registers={REGISTERS} can={{ generate: true, sign: true, download: true }} onGenerate={fn()} onDownload={fn()} onFreeze={onFreeze} onSign={fn()} onPack={fn()} />);
    expect(screen.getByRole('button', { name: 'Upload the signed Wages register' })).toBeInTheDocument();
    const signed = screen.getByRole('row', { name: /Overtime/ });
    expect(within(signed).getAllByRole('button')).toHaveLength(1);
    await ue.click(screen.getByRole('button', { name: 'Freeze the Deductions register' }));
    expect(onFreeze).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Freeze' }));
    await waitFor(() => expect(onFreeze).toHaveBeenCalledWith(REGISTERS[1]));
  });

  it('advisories: marked reviewed with what was done', async () => {
    const onReview = fn();
    render(<AdvisoriesScreen state="ready" entities={ENTITIES} entityId="e1" onEntity={vi.fn()} advisories={ADVISORIES} onReview={onReview} />);
    expect(screen.getAllByRole('button', { name: /^Mark ".*" reviewed$/ })).toHaveLength(1);
    await ue.click(screen.getByRole('button', { name: 'Mark "Karnataka minimum wages revised" reviewed' }));
    await ue.type(screen.getByRole('textbox', { name: /What you did/ }), 'Raised two salaries in Mysuru');
    await ue.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    await waitFor(() => expect(onReview).toHaveBeenCalledWith(ADVISORIES[0], 'Raised two salaries in Mysuru'));
  });

  it('advisories: only an https source becomes a link', () => {
    render(<AdvisoriesScreen state="ready" entities={ENTITIES} entityId="e1" onEntity={vi.fn()} advisories={[ADVISORIES[0], { ...ADVISORIES[1], link: 'javascript:alert(1)' }]} onReview={fn()} />);
    expect(screen.getAllByRole('link', { name: 'Read the source' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Read the source' })).toHaveAttribute('href', 'https://labour.karnataka.gov.in/');
  });

  it('certificates: issuing everything ready needs the typed phrase', async () => {
    const onIssueAll = vi.fn(async () => ({ issued: 1, failed: [] }));
    render(
      <TaxCertificatesScreen
        state="ready"
        entities={ENTITIES}
        entityId="e1"
        onEntity={vi.fn()}
        taxYear="2025-26"
        onTaxYear={vi.fn()}
        certificates={CERTIFICATES}
        nameOf={nameOf}
        can={{ importZip: true, issueAll: true }}
        onImportZip={vi.fn(async () => ({ files: 0, matched: 0, unmatched: [] }))}
        onPartA={fn()}
        onIssue={fn()}
        onIssueAll={onIssueAll}
      />,
    );
    await ue.click(screen.getByRole('button', { name: 'Issue 1 ready' }));
    const confirm = screen.getAllByRole('button', { name: 'Issue' }).pop()!;
    // Never disabled: pressed before the phrase is typed, it says what to type.
    await ue.click(confirm);
    expect(screen.getAllByText(/exactly, in capitals\./).length).toBeGreaterThan(0);
    expect(onIssueAll).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Type/ }), 'ISSUE FORM16 2025-26');
    await ue.click(confirm);
    await waitFor(() => expect(onIssueAll).toHaveBeenCalledWith(expect.objectContaining({ phrase: 'ISSUE FORM16 2025-26' })));
    expect(await screen.findByText('1 issued')).toBeInTheDocument();
  });
});
