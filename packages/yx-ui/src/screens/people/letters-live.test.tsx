import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { IssuedLettersRegister, type LiveLetters } from './documents';
import type { LetterTemplate } from './live/types';

// PPL-28 live: the designed issue sheet with the API's templates, the preview with real data and the approval rule.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const T = (id: string, letterType: string, name: string, requiresApproval: boolean, legalEntityId: string | null = null, version = 1): LetterTemplate => ({ id, letterType, name, legalEntityId, language: 'en', source: 'starter', fields: [], requiresApproval, personSigns: false, companyDsc: false, version, status: 'active', previewViewed: true, createdAt: '2026-09-01T00:00:00Z' });
const TEMPLATES = [T('t1', 'promotion', 'Promotion with pay change', true, null, 2), T('t1b', 'promotion', 'Promotion with pay change', true, 'other', 3), T('t2', 'experience', 'Experience letter', false)];

function sheet(issue: Partial<NonNullable<LiveLetters['issue']>> = {}) {
  const live: LiveLetters = {
    state: 'ready',
    onRetry: () => {},
    rows: [],
    verifyUrl: (c) => c,
    onDownload: () => {},
    issue: { templates: TEMPLATES, people: [{ value: 'p1', label: 'Arjun Kulkarni · KF-0142', legalEntityId: 'kf' }], approverFor: () => 'Lakshmi Venkatesan', onPreview: vi.fn(async () => 'blob:preview'), onIssue: vi.fn(async () => {}), onBulk: () => {}, person: 'p1', ...issue },
  };
  render(
    <ToastProvider>
      <IssuedLettersRegister rows={[]} live={live} />
    </ToastProvider>,
  );
  return { live, drawer: () => screen.getByRole('dialog') };
}
const pickType = async (label: string) => {
  await ue.click(within(screen.getByRole('dialog')).getByRole('combobox', { name: 'Letter type' }));
  await ue.click(await screen.findByRole('option', { name: label }));
};

describe('PPL-28 issue a letter, live', () => {
  it('marks types that need approval, offers the versions for the person, previews inline and sends for approval', async () => {
    const { live, drawer } = sheet();
    expect(within(drawer()).getByRole('combobox', { name: 'Employee' })).toHaveTextContent('Arjun Kulkarni');
    await pickType('Promotion with pay change (approval required)');
    // Another entity's template is not offered; the company-wide v2 is chosen.
    expect(within(drawer()).getByRole('combobox', { name: 'Template' })).toHaveTextContent('Promotion with pay change · v2 · English');
    // The preview is the server's PDF, drawn as pages (PDF.js; jsdom has no canvas, so only the region is checked).
    expect(await within(drawer()).findByRole('region', { name: 'Letter preview' })).toBeTruthy();
    expect(live.issue!.onPreview).toHaveBeenCalledWith('p1', TEMPLATES[0]);
    expect(within(drawer()).getByText('Approval before issue')).toBeTruthy();
    expect(within(drawer()).getByText('Lakshmi Venkatesan')).toBeTruthy();
    await ue.click(within(drawer()).getByRole('button', { name: 'Send for approval' }));
    expect(live.issue!.onIssue).toHaveBeenCalledWith('p1', TEMPLATES[0]);
  });

  it('a letter without approval says Issue letter', async () => {
    const { drawer } = sheet();
    await pickType('Experience letter');
    await waitFor(() => expect(within(drawer()).getByRole('button', { name: 'Issue letter' })).toBeEnabled());
    expect(within(drawer()).queryByText('Approval before issue')).toBeNull();
  });

  it('missing fields block generation and say what to fill', async () => {
    const onPreview = vi.fn(() => Promise.reject(Object.assign(new Error('x'), { code: 'LETTER_FIELDS_MISSING', body: { errors: { new_ctc: 'Annual CTC after the raise', signatory_name: 'Who signs (name)' } } })));
    const { drawer } = sheet({ onPreview });
    await pickType('Experience letter');
    expect(await within(drawer()).findByText("We can't generate this letter yet")).toBeTruthy();
    expect(within(drawer()).getByText(/Fill these on Arjun's record first: annual CTC after the raise\. Name who signs for their legal entity in Settings › Letter templates\. Letters never go out with blanks\./)).toBeTruthy();
    expect(within(drawer()).queryByRole('region', { name: 'Letter preview' })).toBeNull();
    expect(within(drawer()).getByRole('button', { name: 'Issue letter' })).toBeDisabled();
  });

  it('missing fields on a letter needing approval show no approval card (as the design)', async () => {
    const onPreview = vi.fn(() => Promise.reject(Object.assign(new Error('x'), { code: 'LETTER_FIELDS_MISSING', body: { errors: { new_ctc: 'Annual CTC after the raise' } } })));
    const { drawer } = sheet({ onPreview });
    await pickType('Promotion with pay change (approval required)');
    expect(await within(drawer()).findByText("We can't generate this letter yet")).toBeTruthy();
    expect(within(drawer()).queryByText('Approval before issue')).toBeNull();
  });
});
