import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { itemRows } from '../../lib/yx-assessments';
import YxQuestionBankPage from './(app)/hiring/assessments/questions/page';
import YxQuestionEditorPage from './(app)/hiring/assessments/questions/[id]/page';
import YxQuestionReviewPage from './(app)/hiring/assessments/reviews/page';
import YxItemAnalysisPage from './(app)/hiring/assessments/item-analysis/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn(), API_BASE: '' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Assessments AS-1 (answers 2009, 2010, 2017): the designed question bank pages on the /question-bank API.
const api = apiFetch as jest.Mock;
const calls: string[] = [];
const push = jest.fn();
const SETTINGS = { languages: [], secondApproverCollections: [], duplicatePercent: 90, provisionalAnswers: 200, packs: ['aptitude'] };
const ROW = { id: 'q1', text: 'Which Java Stream operation is lazy?', type: 'single_mcq', topic: 'Java', collection: 'Backend', difficulty: 'medium', status: 'draft', version: 1, openChange: null, languages: ['en'], aiDrafted: true, updatedAt: '2026-11-10T09:00:00.000Z' };
const CONTENT = { type: 'single_mcq', text: 'Which Java Stream operation is lazy?', difficulty: 'medium', marks: 2, negativeMarks: 0, tags: [], options: [{ text: 'filter()', isCorrect: false }, { text: 'map()', isCorrect: true }], optionAlts: [] };
const CHANGE = { id: 'r1', questionId: 'q1', kind: 'new', fromVersion: null, toVersion: 1, author: 'Ramesh', aiDrafted: false, submittedAt: '2026-11-12T09:00:00.000Z', before: null, after: CONTENT, changed: [], duplicate: null, secondApproval: null, rowVersion: 4 };

function route() {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${path}${init?.body ? ` ${String(init.body)}` : ''}`);
    if (path === '/question-bank/questions' && !init?.method) return [ROW];
    if (path === '/question-bank/questions' && init?.method === 'POST') return { id: 'q9' };
    if (path === '/questions/bulk-upload') return { created: [{ id: 'b1' }, { id: 'b2' }], errors: [{ row: 3, message: 'Mark one option correct.' }] };
    if (path === '/questions/ai-generate') return { aiJobId: 'j1' };
    if (path === '/questions/images') return { imageUrl: 'question-images/line.png' };
    if (path === '/questions/code-languages') return [{ language: 'java', version: '17' }];
    if (path === '/question-bank/settings') return SETTINGS;
    if (path === '/question-bank/reviews') return { changes: [CHANGE], translations: [] };
    if (path === '/question-bank/reviews/r1/approve') return { state: 'approved', version: 1 };
    if (path === '/analytics/questions/difficulty-calibration') return [{ questionId: 'q1', text: ROW.text, responses: 40, percentCorrect: 55, declared: 'medium', observed: 'medium' }];
    if (path === '/analytics/questions/flagged') return [{ questionId: 'q1', discrimination: 0.1, flags: [{ code: 'weak_discrimination', message: 'weak' }] }];
    return {};
  });
}
const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  push.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push, replace: push });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
  route();
});

it('the bank lists the company questions; Add question opens a new one', async () => {
  wrap(<YxQuestionBankPage />);
  expect(await screen.findByText('Which Java Stream operation is lazy?')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Add question' }));
  expect(push).toHaveBeenCalledWith('/yx/hiring/assessments/questions/new');
});

it('a new question is created as a draft (POST question-bank/questions) and opened', async () => {
  (useParams as jest.Mock).mockReturnValue({ id: 'new' });
  wrap(<YxQuestionEditorPage />);
  await userEvent.type(await screen.findByRole('textbox', { name: /Question/ }), 'What is 2 + 2?');
  await userEvent.click(screen.getByRole('tab', { name: 'Answer key' }));
  await userEvent.type(screen.getByRole('textbox', { name: /Option A/ }), '3');
  await userEvent.type(screen.getByRole('textbox', { name: /Option B/ }), '4');
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  await waitFor(() => expect(calls.some((c) => c.startsWith('POST /question-bank/questions {') && c.includes('"text":"What is 2 + 2?"'))).toBe(true));
  expect(push).toHaveBeenCalledWith('/yx/hiring/assessments/questions/q9');
});

it('a reviewer approves with the row version the queue gave (stale presses are refused by the API)', async () => {
  wrap(<YxQuestionReviewPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
  await waitFor(() => expect(calls).toContain('POST /question-bank/reviews/r1/approve {"rowVersion":4,"comments":{}}'));
});

it('item analysis merges the calibration with the flags, in plain words', async () => {
  expect(itemRows([{ questionId: 'q1', text: 't', responses: 40, percentCorrect: 55, declared: 'medium', observed: 'hard' }], [{ questionId: 'q1', discrimination: -0.1, flags: [{ code: 'miskeyed_suspect', message: 'x' }] }])).toEqual([
    { questionId: 'q1', text: 't', responses: 40, percentCorrect: 55, discrimination: -0.1, flags: ['Answer key may be wrong'], declared: 'medium', observed: 'hard' },
  ]);
  wrap(<YxItemAnalysisPage />);
  expect(await screen.findByText('Weak discrimination')).toBeInTheDocument();
  expect(screen.getByText(/1 of 1 questions have fewer than 200 answers/)).toBeInTheDocument();
});

// Bank follow-ups (answers 2121, 2126): import and AI drafts from the designed bank; images through the question route.
it('Import sends the file to the bulk upload (rows land in review) and lists the refused rows', async () => {
  wrap(<YxQuestionBankPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Import' }));
  const dialog = await screen.findByRole('dialog', { name: 'Import questions' });
  await userEvent.upload(dialog.querySelector('input[type="file"]') as HTMLInputElement, new File(['x'], 'q.csv', { type: 'text/csv' }));
  await waitFor(() => expect(calls.some((c) => c.startsWith('POST /questions/bulk-upload'))).toBe(true));
  expect(await screen.findByText('Row 3: Mark one option correct.')).toBeInTheDocument();
});

it('Draft with AI posts to the AI route', async () => {
  wrap(<YxQuestionBankPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Draft with AI' }));
  await screen.findByRole('dialog', { name: 'Draft questions with AI' });
  await userEvent.type(screen.getByRole('textbox', { name: /About/ }), 'Percentages');
  await userEvent.click(screen.getByRole('button', { name: 'Draft questions' }));
  await waitFor(() => expect(calls).toContain('POST /questions/ai-generate {"topic":"Percentages","difficulty":"medium","questionTypes":["single_mcq"],"count":5,"marks":1,"negativeMarks":0,"tagIds":[]}'));
});

it('a question image is uploaded through the question image route', async () => {
  (useParams as jest.Mock).mockReturnValue({ id: 'new' });
  wrap(<YxQuestionEditorPage />);
  const field = (await screen.findByText('Question image')).closest('.yx-field') as HTMLElement;
  await userEvent.upload(field.querySelector('input[type="file"]') as HTMLInputElement, new File(['png'], 'line.png', { type: 'image/png' }));
  await waitFor(() => expect(calls.some((c) => c.startsWith('POST /questions/images'))).toBe(true));
  expect(await screen.findByText(/Question image: line.png/)).toBeInTheDocument();
});
