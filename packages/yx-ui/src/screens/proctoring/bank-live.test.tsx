import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { ItemAnalysisScreen, QuestionBankScreen, QuestionEditorScreen, QuestionReviewQueueScreen } from './bank-tests';
import { missingAlt } from './bank-live';
import { BANK_QUESTION, BANK_QUESTION_MAJOR, REVIEW_CHANGES, REVIEW_TRANSLATIONS, liveBank, liveEditor, liveItems, liveReviews } from './bank-live-samples';

// AS-1: the designed question bank screens with live data (answers 2009, 2010, 2017).
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('PRC-01 question bank (live)', () => {
  it('lists the company questions with their review state and version, and opens the item stats', async () => {
    const onLoadStats = vi.fn().mockResolvedValue({ questionId: 'q1', responses: 142, percentCorrect: 62, discrimination: 0.41, flags: [], options: [], hasEnoughData: true });
    wrap(<QuestionBankScreen live={liveBank({ onLoadStats })} />);
    const table = screen.getByRole('table', { name: 'Questions' });
    expect(within(table).getByText('In review')).toBeInTheDocument();
    expect(within(table).getByText('Retired')).toBeInTheDocument();
    await ue.click(within(table).getByText('Which Java Stream operation is lazy and returns a new stream?'));
    expect(onLoadStats).toHaveBeenCalledWith('q1');
    expect(await screen.findByText('Provisional statistics')).toBeInTheDocument();
    expect(screen.getByText('0.41')).toBeInTheDocument();
  });

  it('Add question opens a new question; the packs tab says which starter packs are on', async () => {
    const onOpen = vi.fn();
    wrap(<QuestionBankScreen live={liveBank({ onOpen })} />);
    await ue.click(screen.getByRole('button', { name: 'Add question' }));
    expect(onOpen).toHaveBeenCalledWith('new');
    await ue.click(screen.getByRole('tab', { name: /Library packs/ }));
    expect(screen.getAllByText('Switched on')).toHaveLength(2);
    expect(screen.getByText('Switched off')).toBeInTheDocument();
  });

  it('bulk submit sends each ticked question and names the ones the server refused', async () => {
    const onSubmit = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Add alt text to the question image before you submit.'));
    wrap(<QuestionBankScreen live={liveBank({ onSubmit })} />);
    const table = screen.getByRole('table', { name: 'Questions' });
    const boxes = within(table).getAllByRole('checkbox');
    await ue.click(boxes[1]!);
    await ue.click(boxes[2]!);
    await ue.click(screen.getByRole('button', { name: /Submit 2 for review/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect((await screen.findAllByText('1 sent for review')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/1 not done\. .*alt text/)).length).toBeGreaterThan(0);
  });
});

describe('PRC-02 question editor (live)', () => {
  it('shows the versions, the approved Hindi translation in the preview, and saves a change with a toast', async () => {
    const onSave = vi.fn().mockResolvedValue({ saved: 'major', version: 3 });
    wrap(<QuestionEditorScreen live={liveEditor({ onSave })} />);
    await ue.click(screen.getByRole('tab', { name: /Versions/ }));
    expect(screen.getByText('Approved v2')).toBeInTheDocument();
    await ue.click(screen.getByRole('combobox', { name: 'Language' }));
    await ue.click(await screen.findByRole('option', { name: 'Hindi' }));
    expect(screen.getByText(/कौन सा Java Stream/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect((await screen.findAllByText('Saved as version 3. Submit it for review.')).length).toBeGreaterThan(0);
  });

  it('negative: an empty question is not saved; the field says what is missing', async () => {
    const onSave = vi.fn();
    wrap(<QuestionEditorScreen live={liveEditor({ question: null, stats: null, onSave })} />);
    await ue.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Write the question.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('a major change in review warns about the new version and the possible duplicate, and can be withdrawn', async () => {
    const onWithdraw = vi.fn().mockResolvedValue(undefined);
    wrap(<QuestionEditorScreen live={liveEditor({ question: BANK_QUESTION_MAJOR, onWithdraw })} />);
    expect(screen.getByText('This is a major change')).toBeInTheDocument();
    expect(screen.getByText(/94 % similar/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Withdraw from review' }));
    await waitFor(() => expect(onWithdraw).toHaveBeenCalled());
  });

  it('negative: an image without alt text cannot be submitted (says why, nothing sent)', async () => {
    const onSubmit = vi.fn();
    const q = { ...BANK_QUESTION, status: 'draft' as const, content: { ...BANK_QUESTION.content, imageUrl: 'questions/line.png', imageAlt: '' } };
    wrap(<QuestionEditorScreen live={liveEditor({ question: q, onSubmit })} />);
    expect(screen.getByText('1 image needs accessibility text')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Submit for review' }));
    expect((await screen.findAllByText('Add alt text to the question image before you submit.')).length).toBeGreaterThan(0);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(missingAlt({ ...q.content, imageAlt: 'A packing line' })).toEqual([]);
  });

  it('translations: English only says so; a switched-on language takes a translation of every option', async () => {
    const { unmount } = wrap(<QuestionEditorScreen live={liveEditor({ settings: { languages: [], secondApproverCollections: [], duplicatePercent: 90, provisionalAnswers: 200, packs: [] } })} />);
    await ue.click(screen.getByRole('tab', { name: /Translations/ }));
    expect(screen.getByText(/Questions are in English only/)).toBeInTheDocument();
    unmount();
    const onSaveTranslation = vi.fn().mockResolvedValue(undefined);
    wrap(<QuestionEditorScreen live={liveEditor({ question: { ...BANK_QUESTION, translations: [] }, onSaveTranslation })} />);
    await ue.click(screen.getByRole('tab', { name: /Translations/ }));
    await ue.click(screen.getByRole('button', { name: 'Draft translation' }));
    const dialog = await screen.findByRole('dialog', { name: 'Hindi translation' });
    await ue.click(within(dialog).getByRole('button', { name: 'Save draft' }));
    expect(await within(dialog).findByText('Write the translated question.')).toBeInTheDocument();
    expect(onSaveTranslation).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox', { name: /Question/ }), 'प्रश्न');
    for (const [i, box] of within(dialog).getAllByRole('textbox', { name: /Option/ }).entries()) await ue.type(box, `विकल्प ${i}`);
    await ue.click(within(dialog).getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(onSaveTranslation).toHaveBeenCalledWith('hi', { text: 'प्रश्न', options: ['विकल्प 0', 'विकल्प 1', 'विकल्प 2'], aiAssisted: false }));
  });
});

describe('PRC-03 review queue (live)', () => {
  it('shows a major change side by side and approves it with the field comments', async () => {
    const onApprove = vi.fn().mockResolvedValue({ state: 'approved', version: 3 });
    wrap(<QuestionReviewQueueScreen live={liveReviews({ onApprove })} />);
    await ue.click(screen.getByText('Which Java Stream operation is lazy and returns a new stream?'));
    expect(screen.getByRole('heading', { name: 'v2 → v3' })).toBeInTheDocument();
    expect(screen.getByText('Options and answer key · changed')).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Comment on marks/ }), 'Fine.');
    await ue.click(screen.getByRole('button', { name: 'Approve v3' }));
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith(REVIEW_CHANGES[0], { marks: 'Fine.' }));
    expect((await screen.findAllByText('Approved. Version 3 can now go into tests.')).length).toBeGreaterThan(0);
  });

  it('negative: a possible duplicate blocks approval until marked "not a duplicate"; two approvers are announced', async () => {
    const onApprove = vi.fn();
    const onClearDuplicate = vi.fn().mockResolvedValue(undefined);
    wrap(<QuestionReviewQueueScreen live={liveReviews({ onApprove, onClearDuplicate })} />);
    await ue.click(screen.getByText('Which Java Stream operation is lazy and returns a stream?'));
    expect(screen.getByText('This collection needs two approvers')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    expect((await screen.findAllByText('Confirm "not a duplicate" first.')).length).toBeGreaterThan(0);
    expect(onApprove).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Mark "not a duplicate"' }));
    await waitFor(() => expect(onClearDuplicate).toHaveBeenCalledWith(REVIEW_CHANGES[1]));
  });

  it('negative: requesting changes needs a note; with one the author is told', async () => {
    const onRequestChanges = vi.fn().mockResolvedValue(undefined);
    wrap(<QuestionReviewQueueScreen live={liveReviews({ onRequestChanges })} />);
    await ue.click(screen.getByText('Which Java Stream operation is lazy and returns a new stream?'));
    await ue.click(screen.getByRole('button', { name: 'Request changes' }));
    const dialog = await screen.findByRole('dialog', { name: 'Request changes' });
    await ue.click(within(dialog).getByRole('button', { name: 'Send to author' }));
    expect(await within(dialog).findByText('Say what to change (at least 5 characters).')).toBeInTheDocument();
    await ue.type(within(dialog).getByRole('textbox'), 'Keep option B as the key.');
    await ue.click(within(dialog).getByRole('button', { name: 'Send to author' }));
    await waitFor(() => expect(onRequestChanges).toHaveBeenCalledWith(REVIEW_CHANGES[0], 'Keep option B as the key.', {}));
  });

  it('a translation is reviewed against the English, line by line; asking for changes needs a note', async () => {
    const onDecideTranslation = vi.fn().mockResolvedValue(undefined);
    wrap(<QuestionReviewQueueScreen live={liveReviews({ changes: [], onDecideTranslation })} />);
    expect(screen.getByRole('heading', { name: /Hindi translation · v1/ })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Request changes' }));
    expect(await screen.findByText('Say what to change.')).toBeInTheDocument();
    expect(onDecideTranslation).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Approve translation' }));
    await waitFor(() => expect(onDecideTranslation).toHaveBeenCalledWith(REVIEW_TRANSLATIONS[0], true));
  });

  it('nothing waiting is the design empty state', () => {
    wrap(<QuestionReviewQueueScreen live={liveReviews({ changes: [], translations: [] })} />);
    expect(screen.getByText('Nothing waiting for review.')).toBeInTheDocument();
  });
});

describe('PRC-05 item analysis (live)', () => {
  it('marks items under the company threshold provisional and shows the chosen item’s distractors', async () => {
    const onLoadItem = vi.fn().mockResolvedValue({ questionId: 'q1', responses: 142, percentCorrect: 62, discrimination: 0.41, flags: [], options: [{ optionId: 'a', text: 'A', isCorrect: false, selections: 30 }, { optionId: 'b', text: 'B', isCorrect: true, selections: 70 }], hasEnoughData: true });
    wrap(<ItemAnalysisScreen live={liveItems({ onLoadItem })} />);
    expect(screen.getByText(/2 of 3 questions have fewer than 200 answers/)).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Items' });
    expect(within(table).getAllByText('Provisional')).toHaveLength(2);
    await ue.click(within(table).getByText('Which Java Stream operation is lazy and returns a new stream?'));
    expect(onLoadItem).toHaveBeenCalledWith('q1');
    expect(await screen.findByText('Distractors')).toBeInTheDocument();
  });
});

