import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { ItemAnalysisScreen, QuestionBankScreen, QuestionEditorScreen, QuestionReviewQueueScreen } from './bank-tests';
import { codeProblems, missingAlt, rubricProblems } from './bank-live';
import { BANK_QUESTION, BANK_QUESTION_IMAGE, BANK_QUESTION_MAJOR, CODE_QUESTION, PREVIEW_IMAGE, REVIEW_CHANGES, REVIEW_TRANSLATIONS, liveBank, liveEditor, liveItems, liveReviews } from './bank-live-samples';

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

  it('answer 2224: a retired question approved before is restored; negative: a never-approved one has no Restore, a refusal says why', async () => {
    const onRestore = vi.fn().mockRejectedValueOnce(new Error('This question is not retired.')).mockResolvedValueOnce({});
    const { unmount } = wrap(<QuestionBankScreen live={liveBank({ onRestore })} />);
    await ue.click(within(screen.getByRole('table', { name: 'Questions' })).getByText('Which document records a CCP deviation?'));
    await ue.click(await screen.findByRole('button', { name: 'Restore' }));
    expect((await screen.findAllByText('This question is not retired.')).length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('button', { name: 'Restore' }));
    expect(onRestore).toHaveBeenLastCalledWith('q4');
    expect((await screen.findAllByText('Question restored')).length).toBeGreaterThan(0);
    unmount();
    const rows = liveBank().rows.map((r) => (r.id === 'q4' ? { ...r, wasApproved: false } : r));
    wrap(<QuestionBankScreen live={liveBank({ rows, onRestore })} />);
    await ue.click(within(screen.getByRole('table', { name: 'Questions' })).getByText('Which document records a CCP deviation?'));
    expect(await screen.findByText(/It was never approved/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
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
  it('answer 2143: the candidate preview shows the image through its signed link, with its alt text; one not saved yet says so', () => {
    const { unmount } = wrap(<QuestionEditorScreen live={liveEditor({ question: BANK_QUESTION_IMAGE })} />);
    const preview = screen.getByRole('complementary', { name: 'Candidate preview' });
    expect(within(preview).getByRole('img', { name: 'Line chart of monthly sales, rising from March' })).toHaveAttribute('src', PREVIEW_IMAGE);
    unmount();
    wrap(<QuestionEditorScreen live={liveEditor({ question: { ...BANK_QUESTION_IMAGE, images: {} } })} />);
    const p2 = screen.getByRole('complementary', { name: 'Candidate preview' });
    expect(within(p2).queryByRole('img')).not.toBeInTheDocument();
    expect(within(p2).getByText(/shows here once the question is saved/)).toBeInTheDocument();
  });


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

// Bank follow-ups (answers 2121, 2125, 2126).
describe('bank follow-ups (live)', () => {
  it('2121: import sends the file; the rows it refused are listed; done is a toast', async () => {
    const onImport = vi.fn().mockResolvedValue({ created: 2, errors: [{ row: 4, message: 'Mark one option correct.' }] });
    wrap(<QuestionBankScreen live={liveBank({ onImport })} />);
    await ue.click(screen.getByRole('button', { name: 'Import' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import questions' });
    const file = new File(['type,text'], 'questions.csv', { type: 'text/csv' });
    await ue.upload(dialog.querySelector('input[type="file"]') as HTMLInputElement, file);
    await waitFor(() => expect(onImport).toHaveBeenCalledWith(file));
    expect(await within(dialog).findByText('Row 4: Mark one option correct.')).toBeInTheDocument();
    expect((await screen.findAllByText('2 questions sent for review')).length).toBeGreaterThan(0);
  });

  it('2121 negative: Draft with AI pressed with nothing filled says what is missing and sends nothing; then it sends', async () => {
    const onDraftWithAi = vi.fn().mockResolvedValue({ aiJobId: 'j1' });
    wrap(<QuestionBankScreen live={liveBank({ onDraftWithAi })} />);
    await ue.click(screen.getByRole('button', { name: 'Draft with AI' }));
    const dialog = await screen.findByRole('dialog', { name: 'Draft questions with AI' });
    await ue.click(within(dialog).getByRole('button', { name: 'Draft questions' }));
    expect(await within(dialog).findByText(/Say what the questions are about/)).toBeInTheDocument();
    expect(onDraftWithAi).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox', { name: /About/ }), 'Java streams');
    await ue.click(within(dialog).getByRole('button', { name: 'Draft questions' }));
    await waitFor(() => expect(onDraftWithAi).toHaveBeenCalledWith({ topic: 'Java streams', difficulty: 'medium', questionTypes: ['single_mcq'], count: 5, marks: 1, negativeMarks: 0, tagIds: [] }));
  });

  it('2125: a code question shows its language, starter code and tests; a new test is added and saved with the question', async () => {
    const onSave = vi.fn().mockResolvedValue({ saved: 'draft' });
    wrap(<QuestionEditorScreen live={liveEditor({ question: CODE_QUESTION, stats: null, onSave })} />);
    await ue.click(screen.getByRole('tab', { name: 'Answer key' }));
    expect(screen.getByRole('group', { name: 'Test case 2' })).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Test case 2' })).getByRole('checkbox', { name: 'Hidden from candidates' })).toBeChecked();
    await ue.click(screen.getByRole('button', { name: 'Add test case' }));
    const third = screen.getByRole('group', { name: 'Test case 3' });
    await ue.type(within(third).getByRole('textbox', { name: /Expected output/ }), '42');
    await ue.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0].codeTests).toHaveLength(3);
    expect(onSave.mock.calls[0]![0].codeTests[2]).toMatchObject({ expectedStdout: '42', hidden: true });
  });

  it('2271: a code question gets a rubric whose criteria add up to its marks, saved with the question', async () => {
    const onSave = vi.fn().mockResolvedValue({ saved: 'draft' });
    const question = { ...CODE_QUESTION, content: { ...CODE_QUESTION.content, marks: 10 } };
    wrap(<QuestionEditorScreen live={liveEditor({ question, stats: null, onSave })} />);
    await ue.click(screen.getByRole('tab', { name: 'Answer key' }));
    const box = screen.getByRole('region', { name: 'Rubric' });
    await ue.click(within(box).getByRole('button', { name: 'Add criterion' }));
    await ue.click(within(box).getByRole('button', { name: 'Add criterion' }));
    await ue.type(within(box).getByRole('textbox', { name: 'Criterion 1' }), 'Correct output');
    await ue.type(within(box).getByRole('textbox', { name: 'Criterion 2' }), 'Readable code');
    const m1 = within(box).getByRole('textbox', { name: 'Marks for criterion 1' });
    await ue.clear(m1);
    await ue.type(m1, '6');
    await ue.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(within(box).getByText('The criteria add up to 7 marks; the question is worth 10.')).toBeInTheDocument();
    const m2 = within(box).getByRole('textbox', { name: 'Marks for criterion 2' });
    await ue.clear(m2);
    await ue.type(m2, '4');
    await ue.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0].rubric).toEqual([{ criterion: 'Correct output', marks: 6 }, { criterion: 'Readable code', marks: 4 }]);
  });

  it('2271 negative: unnamed, repeated or part-mark criteria are refused; no rubric is fine', () => {
    const base = { ...CODE_QUESTION.content, marks: 4 };
    expect(rubricProblems({ ...base, rubric: [] })).toEqual([]);
    expect(rubricProblems({ ...base, rubric: [{ criterion: '', marks: 4 }] })).toEqual(['Name every criterion.']);
    expect(rubricProblems({ ...base, rubric: [{ criterion: 'A', marks: 2 }, { criterion: 'a', marks: 2 }] })).toEqual(['Each criterion is named once.']);
    expect(rubricProblems({ ...base, rubric: [{ criterion: 'A', marks: 3.5 }, { criterion: 'B', marks: 0.5 }] })).toEqual(['Each criterion is worth at least 1 whole mark.']);
  });

  it('2125 negative: no test, no expected output, no language or every test hidden is not saved', async () => {
    const base = CODE_QUESTION.content;
    expect(codeProblems(base)).toEqual([]);
    expect(codeProblems({ ...base, codeTests: [] })).toEqual(['Add at least one test case.']);
    expect(codeProblems({ ...base, allowedLanguages: [] })).toEqual(['Choose the language candidates write in.']);
    expect(codeProblems({ ...base, codeTests: [{ expectedStdout: '' }] })).toEqual(['Every test case needs its expected output.']);
    expect(codeProblems({ ...base, codeTests: [{ expectedStdout: '1', hidden: true }] })).toEqual(['Keep at least one test case visible, so candidates see an example.']);
    expect(codeProblems({ ...base, languageMode: 'any', allowedLanguages: undefined })).toEqual([]);
    const onSave = vi.fn();
    wrap(<QuestionEditorScreen live={liveEditor({ question: { ...CODE_QUESTION, content: { ...base, codeTests: [] } }, stats: null, onSave })} />);
    await ue.click(screen.getByRole('button', { name: 'Save draft' }));
    expect((await screen.findAllByText('Add at least one test case.')).length).toBeGreaterThan(0);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('2126: an uploaded question image asks for alt text; submit is refused until it has some', async () => {
    const onUploadImage = vi.fn().mockResolvedValue({ imageUrl: 'question-images/line.png' });
    const onSubmit = vi.fn();
    const draft = { ...BANK_QUESTION, status: 'draft' as const, approvedBy: null, approvedAt: null };
    wrap(<QuestionEditorScreen live={liveEditor({ question: draft, onUploadImage, onSubmit })} />);
    const file = new File(['png'], 'line.png', { type: 'image/png' });
    const field = screen.getByText('Question image').closest('.yx-field') as HTMLElement;
    await ue.upload(field.querySelector('input[type="file"]') as HTMLInputElement, file);
    await waitFor(() => expect(onUploadImage).toHaveBeenCalledWith(file));
    expect(await screen.findByText(/Question image: line.png/)).toBeInTheDocument();
    expect(screen.getByText('1 image needs accessibility text')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Submit for review' }));
    expect(onSubmit).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Image alt text/ }), 'A packing line');
    expect(screen.queryByText('1 image needs accessibility text')).toBeNull();
  });
});
