import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { LetterTemplatesList, type LiveLetterTemplates } from './documents';
import type { LetterTemplate, LetterTemplates } from './live/types';

// PPL-29 live: the designed list and workspace with the API's templates, the validation report, the editor and the
// test render that must be seen before a template is switched on.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const T = (id: string, name: string, x: Partial<LetterTemplate> = {}): LetterTemplate => ({ id, letterType: 'relieving', name, legalEntityId: null, language: 'en', source: 'upload', fields: ['employee_name', 'probation', 'address'], requiresApproval: true, personSigns: false, companyDsc: false, onePerPerson: true, version: 1, status: 'draft', previewViewed: false, createdAt: '2026-10-01T00:00:00Z', ...x });
const DATA: LetterTemplates = {
  templates: [T('t1', 'Relieving and experience'), T('t2', 'Relieving, short', { source: 'starter', status: 'active', previewViewed: true })],
  starters: [{ letterType: 'relieving', name: 'Relieving letter', onePerPerson: true, added: true, update: true }],
  fields: [
    { key: 'employee_name', label: 'Full name', cls: 'internal', flag: false, optional: false },
    { key: 'probation', label: 'On probation (yes / no)', cls: 'internal', flag: true, optional: false },
    { key: 'address', label: 'Home address', cls: 'personal', flag: false, optional: false },
  ],
};

function page(over: Partial<LiveLetterTemplates> = {}) {
  const live: LiveLetterTemplates = {
    state: 'ready',
    onRetry: () => {},
    data: DATA,
    entities: [],
    people: [{ value: 'p1', label: 'Meera Iyer · KF-0007' }],
    onUpload: vi.fn(async (x) => T('t3', x.name, { version: 2 })),
    onCompose: vi.fn(async (x) => T('t4', x.name, { source: 'editor', version: 2 })),
    onStarter: vi.fn(async () => T('t5', 'Relieving letter', { source: 'starter', version: 2 })),
    onParagraphs: vi.fn(async () => [{ text: '{{legal_entity}}', heading: true, bold: true }, { text: 'Dear {{employee_name}},', heading: false, bold: false }]),
    onWord: vi.fn(),
    wordFile: vi.fn(async () => new File(['x'], 'a.docx')),
    onTestRender: vi.fn(async () => 'blob:render'),
    onStatus: vi.fn(async () => {}),
    listHref: '/list',
    ...over,
  };
  render(
    <ToastProvider>
      <LetterTemplatesList rows={[]} live={live} />
    </ToastProvider>,
  );
  return live;
}

describe('PPL-29 letter templates, live', () => {
  it('shows what the page gives it (the Signatories drawer)', () => {
    page({ onSignatories: () => {}, children: <p>Signatories drawer</p> });
    expect(screen.getByRole('button', { name: 'Signatories' })).toBeTruthy();
    expect(screen.getByText('Signatories drawer')).toBeTruthy();
  });

  it('lists templates with the designed columns and one menu per row; a newer starter is offered', async () => {
    page();
    const row = screen.getByRole('row', { name: /Relieving and experience/ });
    expect(within(row).getByText('Uploaded Word')).toBeTruthy();
    expect(within(row).getByText('English')).toBeTruthy();
    expect(within(row).getByText('Approval')).toBeTruthy();
    expect(within(row).queryByRole('button', { name: 'Use it' })).toBeNull();
    await ue.click(within(screen.getByRole('row', { name: /Relieving, short/ })).getByRole('button', { name: /actions|more/i }));
    expect(await screen.findByRole('menuitem', { name: 'Get the new starter version' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Stop using' })).toBeTruthy();
  });

  it('activates only after the test render was seen', async () => {
    const live = page();
    await ue.click(screen.getByRole('row', { name: /Relieving and experience/ }));
    expect(screen.getByRole('button', { name: 'Activate' })).toBeDisabled();
    expect(screen.getByText('View a test render with a sample employee before you activate this template.')).toBeTruthy();
    // The validation report of the saved file: fields, a section and a personal field.
    expect(screen.getByText('3 placeholders match the field registry')).toBeTruthy();
    expect(screen.getByText(/is Personal\. Issuers without that class/)).toBeTruthy();
    await ue.click(screen.getByRole('tab', { name: 'Test render' }));
    expect(await screen.findByRole('region', { name: 'Test render preview' })).toBeTruthy();
    expect(live.onTestRender).toHaveBeenCalledWith(DATA.templates[0], null);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Activate' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Preview viewed' })).toBeDisabled();
    await ue.click(screen.getByRole('button', { name: 'Activate' }));
    expect(live.onStatus).toHaveBeenCalledWith(DATA.templates[0], 'active');
    expect(await screen.findByText('Relieving and experience is now in use')).toBeTruthy();
  });

  it('an unknown placeholder is reported with "Use suggestion", which uploads again with the rename', async () => {
    const onUpload = vi.fn().mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'TEMPLATE_FIELDS', body: { errors: { emp_nme: 'employee_name' } } })).mockResolvedValueOnce(T('t3', 'Relieving and experience', { version: 2 }));
    page({ onUpload });
    await ue.click(screen.getByRole('row', { name: /Relieving and experience/ }));
    const file = new File(['x'], 'relieving.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    await ue.upload(document.querySelector('input[type=file]') as HTMLInputElement, file);
    expect(await screen.findByText('Validation report · relieving.docx')).toBeTruthy();
    await ue.click(screen.getByRole('button', { name: 'Use suggestion' }));
    expect(onUpload).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Relieving and experience', letterType: 'relieving', file, fixes: { emp_nme: 'employee_name' } }));
    expect(await screen.findByText('Relieving and experience version 2 saved as a draft')).toBeTruthy();
  });

  it('a template made in YukthiX opens in the editor and saves the next version', async () => {
    const live = page();
    await ue.click(within(screen.getByRole('row', { name: /Relieving, short/ })).getByRole('button', { name: /actions|more/i }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Open' }));
    await ue.click(screen.getByRole('tab', { name: 'Editor' }));
    expect(await screen.findByRole('button', { name: 'Insert field' })).toBeTruthy();
    await ue.click(screen.getByRole('button', { name: 'Save as a new version' }));
    expect(live.onCompose).toHaveBeenCalledWith(expect.objectContaining({ name: 'Relieving, short', paragraphs: [{ text: '{{legal_entity}}', heading: true, bold: true }, { text: 'Dear {{employee_name}},', heading: false, bold: false }] }));
  });

  // Founder 26 Oct 2026 (PPL-28): "one per person" is the company's policy on the template, saved with the next version.
  it('HR changes "Per person" on a template; the next version carries it', async () => {
    const live = page();
    await ue.click(screen.getByRole('row', { name: /Relieving, short/ }));
    const per = screen.getByRole('radiogroup', { name: 'Per person' });
    expect(within(per).getByRole('radio', { name: 'One only' })).toHaveAttribute('aria-checked', 'true');
    await ue.click(within(per).getByRole('radio', { name: 'Can repeat' }));
    await ue.click(screen.getByRole('tab', { name: 'Editor' }));
    await ue.click(await screen.findByRole('button', { name: 'Save as a new version' }));
    expect(live.onCompose).toHaveBeenCalledWith(expect.objectContaining({ name: 'Relieving, short', onePerPerson: false }));
  });
});
