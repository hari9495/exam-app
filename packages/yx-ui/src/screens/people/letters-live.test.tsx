import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { BulkLetterWizard, IssuedLettersRegister, type LiveBulkLetters, type LiveLetters } from './documents';
import type { LetterTemplate } from './live/types';

// PPL-28 live: the designed issue sheet with the API's templates, the preview with real data and the approval rule.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const T = (id: string, letterType: string, name: string, requiresApproval: boolean, legalEntityId: string | null = null, version = 1): LetterTemplate => ({ id, letterType, name, legalEntityId, language: 'en', source: 'starter', fields: [], requiresApproval, personSigns: false, companyDsc: false, onePerPerson: false, version, status: 'active', previewViewed: true, createdAt: '2026-09-01T00:00:00Z' });
const TEMPLATES = [T('t1', 'promotion', 'Promotion with pay change', true, null, 2), T('t1b', 'promotion', 'Promotion with pay change', true, 'other', 3), T('t2', 'experience', 'Experience letter', false)];

function sheet(issue: Partial<NonNullable<LiveLetters['issue']>> = {}, rows: LiveLetters['rows'] = []) {
  const live: LiveLetters = {
    state: 'ready',
    onRetry: () => {},
    rows,
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
    expect(live.issue!.onIssue).toHaveBeenCalledWith('p1', TEMPLATES[0], undefined);
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

  it('an issued letter is corrected from its row: same person and type, the old one named (as the design)', async () => {
    const issued = { id: 'l1', title: 'Experience letter: Arjun Kulkarni', letterType: 'experience', personId: 'p1', person: 'Arjun Kulkarni', referenceNo: 'KF/EXPE/2026/000001', verifyCode: 'ABCDEFGHJK', status: 'issued' as const, renderError: null, issuedAt: '2026-10-24T10:00:00Z', personSigns: false, acceptedAt: null, signature: null, supersededById: null };
    const { live, drawer } = sheet({ person: undefined }, [issued]);
    await ue.click(screen.getByRole('button', { name: /More actions for KF\/EXPE\/2026\/000001/ }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Issue a correction' }));
    expect(within(drawer()).getByText('Issue a correction')).toBeTruthy();
    expect(within(drawer()).getByText('Replaces KF/EXPE/2026/000001. The old letter then shows as superseded.')).toBeTruthy();
    expect(within(drawer()).getByRole('combobox', { name: 'Employee' })).toBeDisabled();
    await waitFor(() => expect(within(drawer()).getByRole('button', { name: 'Issue letter' })).toBeEnabled());
    await ue.click(within(drawer()).getByRole('button', { name: 'Issue letter' }));
    expect(live.issue!.onIssue).toHaveBeenCalledWith('p1', TEMPLATES[2], issued);
  });

  // Founder 26 Oct 2026: a second letter of a "one per person" type is refused, naming the issued one, like other blocks.
  it('a second one-per-person letter is refused in the sheet, which stays open with the reason', async () => {
    const onIssue = vi.fn(() => Promise.reject(new Error('Already issued: KF/EXPE/2026/000001. Use Issue a correction to replace it.')));
    const { drawer } = sheet({ onIssue });
    await pickType('Experience letter');
    await waitFor(() => expect(within(drawer()).getByRole('button', { name: 'Issue letter' })).toBeEnabled());
    await ue.click(within(drawer()).getByRole('button', { name: 'Issue letter' }));
    expect(await within(drawer()).findByText('Already issued: KF/EXPE/2026/000001. Use Issue a correction to replace it.')).toBeTruthy();
  });
});

describe('PPL-28 bulk issue, live', () => {
  const check = { letterType: 'experience', rows: [{ personId: 'p1', name: 'Arjun Kulkarni', ready: true, reason: null }, { personId: 'p2', name: 'Thomas George', ready: true, reason: null }, { personId: 'p3', name: 'Aisha Khan', ready: false, reason: 'A letter of this type for this person is already on its way.' }, { personId: 'p4', name: null, ready: false, reason: 'You cannot issue letters to this person.' }] };
  function wizard(over: Partial<LiveBulkLetters> = {}) {
    const live: LiveBulkLetters = { state: 'ready', onRetry: () => {}, templates: TEMPLATES, people: [{ value: 'p1', label: 'Arjun Kulkarni' }, { value: 'p2', label: 'Thomas George' }], picked: ['p1', 'p2', 'p3', 'p4'], letterType: 'experience', onCheck: vi.fn(async () => check), onPreview: vi.fn(async () => 'blob:preview'), onIssue: vi.fn(async () => {}), ...over };
    render(
      <ToastProvider>
        <BulkLetterWizard live={live} />
      </ToastProvider>,
    );
    return live;
  }
  const next = () => ue.click(screen.getByRole('button', { name: 'Continue' }));

  it('previews each letter with the API, lists failures with reasons, opens anyone’s letter, and issues behind the typed count', async () => {
    const live = wizard();
    await next();
    expect(screen.getByRole('combobox', { name: 'Template' })).toHaveTextContent('Experience letter v1');
    await next();
    expect(await screen.findByText("2 letters can't be generated")).toBeTruthy();
    expect(live.onCheck).toHaveBeenCalledWith({ templateId: 't2', source: 'people', personIds: ['p1', 'p2', 'p3', 'p4'] });
    expect(screen.getByText('Fix these and retry, or issue the other 2 now.')).toBeTruthy();
    expect(screen.getByText('A letter of this type for this person is already on its way.')).toBeTruthy();
    // Someone the issuer cannot reach is never named.
    expect(screen.getByText('Someone you cannot issue letters to')).toBeTruthy();
    await waitFor(() => expect(live.onPreview).toHaveBeenCalledWith('p1', TEMPLATES[2]));
    await ue.click(screen.getByRole('combobox', { name: 'Preview the letter for' }));
    await ue.click(await screen.findByRole('option', { name: 'Thomas George' }));
    await waitFor(() => expect(live.onPreview).toHaveBeenCalledWith('p2', TEMPLATES[2]));
    await ue.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(live.onCheck).toHaveBeenCalledTimes(2));
    await next();
    await ue.click(await screen.findByRole('button', { name: 'Issue 2 letters' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Issue 2 experience letters?')).toBeTruthy();
    const go = within(dialog).getByRole('button', { name: 'Issue letters' });
    expect(go).toBeDisabled();
    await ue.type(within(dialog).getByRole('textbox'), 'ISSUE 2 LETTERS');
    await ue.click(go);
    expect(live.onIssue).toHaveBeenCalledWith({ templateId: 't2', source: 'people', personIds: ['p1', 'p2', 'p3', 'p4'] }, 'ISSUE 2 LETTERS', TEMPLATES[2]);
  });

  it('the go-live source offers only appointment templates; a refused issue stays open with the reason', async () => {
    const appointment = T('ta', 'appointment', 'Appointment letter', true);
    const live = wizard({ templates: [...TEMPLATES, appointment], picked: [], letterType: undefined, onCheck: vi.fn(async () => ({ letterType: 'appointment', rows: [{ personId: 'p1', name: 'Arjun Kulkarni', ready: true, reason: null }] })), onIssue: vi.fn(() => Promise.reject(new Error('Type ISSUE 2 LETTERS to confirm.'))) });
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await ue.click(screen.getByRole('radio', { name: 'Employees with no appointment letter on file (go-live)' }));
    await next();
    await ue.click(screen.getByRole('combobox', { name: 'Template' }));
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['Appointment letter v1']);
    await ue.click(screen.getByRole('option', { name: 'Appointment letter v1' }));
    await next();
    await waitFor(() => expect(live.onCheck).toHaveBeenCalledWith({ templateId: 'ta', source: 'no_appointment' }));
    await next();
    expect(screen.getByText(/each letter waits for the signatory first/)).toBeTruthy();
    await ue.click(screen.getByRole('button', { name: 'Issue 1 letter' }));
    const dialog = await screen.findByRole('dialog');
    await ue.type(within(dialog).getByRole('textbox'), 'ISSUE 1 LETTER');
    await ue.click(within(dialog).getByRole('button', { name: 'Issue letters' }));
    expect(await within(dialog).findByText('Type ISSUE 2 LETTERS to confirm.')).toBeTruthy();
  });
});

describe('PPL-15 a drafted withdrawal letter, live', () => {
  const draft = { id: 'l9', title: 'Offer withdrawal letter: Kavya Reddy', letterType: 'offer_withdrawal', personId: 'p9', person: 'Kavya Reddy', referenceNo: null, verifyCode: null, status: 'draft' as const, renderError: null, issuedAt: null, personSigns: false, acceptedAt: null, signature: null, supersededById: null };
  it('shows as a draft with no number, and HR issues it from the row', async () => {
    const onIssueDraft = vi.fn(async () => {});
    render(
      <ToastProvider>
        <IssuedLettersRegister rows={[]} live={{ state: 'ready', onRetry: () => {}, rows: [draft], verifyUrl: (c) => c, onDownload: () => {}, onIssueDraft }} />
      </ToastProvider>,
    );
    const row = screen.getByRole('row', { name: /Offer withdrawal letter Kavya Reddy/ });
    expect(within(row).getByText('Draft')).toBeInTheDocument();
    await ue.click(within(row).getByRole('button', { name: /More actions|Actions/ }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Issue letter' }));
    await waitFor(() => expect(onIssueDraft).toHaveBeenCalledWith(draft));
  });
});
