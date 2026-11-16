// Sample `live` data for the PRC-01, 02, 03 and 05 stories of the states the real question bank has (AS-1), and for the
// tests. Not used by the app.
import type { BankContent, BankQuestion, BankRow, BankSettings, ItemRow, ItemStats, LiveBank, LiveEditor, LiveItemAnalysis, LiveReviews, ReviewChange, ReviewTranslation } from './bank-live';

const ok = () => Promise.resolve({});
const at = (day: number) => `2026-11-${String(day).padStart(2, '0')}T09:30:00.000Z`;

export const BANK_SETTINGS: BankSettings = { languages: ['hi'], secondApproverCollections: ['Food safety'], duplicatePercent: 90, provisionalAnswers: 200, packs: ['aptitude', 'english'] };

export const BANK_ROWS: BankRow[] = [
  { id: 'q1', text: 'Which Java Stream operation is lazy and returns a new stream?', type: 'single_mcq', topic: 'Java streams', collection: 'Backend L2', difficulty: 'medium', status: 'approved', version: 2, openChange: null, languages: ['en', 'hi'], aiDrafted: false, updatedAt: at(10) },
  { id: 'q2', text: 'Explain how you would reduce food-safety deviations on a packing line.', type: 'essay', topic: 'Food safety', collection: 'Food safety', difficulty: 'medium', status: 'in_review', version: 1, openChange: { state: 'in_review', kind: 'new' }, languages: ['en'], aiDrafted: false, updatedAt: at(12) },
  { id: 'q3', text: 'A dispatch van covers 180 km in 3 hours. At the same speed, how far in 5 hours?', type: 'single_mcq', topic: 'Speed and distance', collection: 'Campus aptitude', difficulty: 'easy', status: 'draft', version: 1, openChange: null, languages: ['en'], aiDrafted: true, updatedAt: at(14) },
  { id: 'q4', text: 'Which document records a CCP deviation?', type: 'single_mcq', topic: 'Food safety', collection: 'Food safety', difficulty: 'hard', status: 'retired', version: 1, openChange: null, languages: ['en'], aiDrafted: false, updatedAt: at(2) },
];

export const ITEM_STATS: ItemStats = {
  questionId: 'q1',
  responses: 142,
  percentCorrect: 62,
  discrimination: 0.41,
  flags: [],
  options: [
    { optionId: 'o1', text: 'filter() is terminal', isCorrect: false, selections: 30 },
    { optionId: 'o2', text: 'map() is lazy', isCorrect: true, selections: 88 },
    { optionId: 'o3', text: 'collect() is lazy', isCorrect: false, selections: 24 },
  ],
  hasEnoughData: true,
};

export function liveBank(over: Partial<LiveBank> = {}): LiveBank {
  return { state: 'ready', onRetry: () => undefined, rows: BANK_ROWS, stats: { q1: { responses: 142, percentCorrect: 62 } }, settings: BANK_SETTINGS, onOpen: () => undefined, onImport: () => undefined, onDraftWithAi: () => undefined, onSubmit: ok, onRetire: ok, onLoadStats: () => Promise.resolve(ITEM_STATS), ...over };
}

const MCQ: BankContent = {
  type: 'single_mcq',
  text: 'Which Java Stream operation is lazy and returns a new stream?',
  topic: 'Java streams',
  category: 'Backend L2',
  difficulty: 'medium',
  marks: 2,
  negativeMarks: 0,
  tags: ['java'],
  options: [
    { text: 'filter() is terminal', isCorrect: false },
    { text: 'map() is lazy and returns a new stream', isCorrect: true },
    { text: 'collect() is lazy', isCorrect: false },
  ],
  optionAlts: [],
};

export const BANK_QUESTION: BankQuestion = {
  id: 'q1',
  status: 'approved',
  version: 2,
  aiDrafted: false,
  author: 'Ramesh Iyer',
  approvedBy: 'Lakshmi Rao',
  approvedAt: at(10),
  content: MCQ,
  openChange: null,
  history: [
    { id: 'h2', kind: 'major', state: 'approved', version: 2, author: 'Ramesh Iyer', reviewer: 'Lakshmi Rao', secondReviewer: null, at: at(10), note: null },
    { id: 'h1', kind: 'new', state: 'approved', version: 1, author: 'Ramesh Iyer', reviewer: 'Lakshmi Rao', secondReviewer: null, at: at(2), note: null },
  ],
  translations: [{ id: 't1', language: 'hi', version: 2, state: 'approved', text: 'कौन सा Java Stream ऑपरेशन lazy है और नया stream लौटाता है?', options: ['filter() terminal है', 'map() lazy है और नया stream लौटाता है', 'collect() lazy है'], aiAssisted: true, author: 'Kavin Raj', reviewer: 'Priya Sharma', mine: false, note: null, rowVersion: 2 }],
};

/** The same question with a big change waiting (v3), found to be like another question. */
export const BANK_QUESTION_MAJOR: BankQuestion = {
  ...BANK_QUESTION,
  status: 'in_review',
  openChange: { id: 'r3', kind: 'major', state: 'in_review', version: 3, content: { ...MCQ, options: [{ text: 'filter() is lazy', isCorrect: true }, ...MCQ.options.slice(1).map((o) => ({ ...o, isCorrect: false }))] }, mine: true, note: null, fieldComments: {}, duplicate: { percent: 94, questionId: 'q9', cleared: false }, rowVersion: 2 },
};

export function liveEditor(over: Partial<LiveEditor> = {}): LiveEditor {
  return { state: 'ready', onRetry: () => undefined, question: BANK_QUESTION, settings: BANK_SETTINGS, stats: ITEM_STATS, onBack: () => undefined, onSave: () => Promise.resolve({ saved: 'minor' as const, version: 2 }), onSubmit: () => Promise.resolve({ duplicate: null, needsSecond: false }), onWithdraw: ok, onSaveTranslation: ok, onSubmitTranslation: ok, onOpenQuestion: () => undefined, ...over };
}

export const REVIEW_CHANGES: ReviewChange[] = [
  {
    id: 'r1',
    questionId: 'q1',
    kind: 'major',
    fromVersion: 2,
    toVersion: 3,
    author: 'Ramesh Iyer',
    aiDrafted: false,
    submittedAt: at(14),
    before: MCQ,
    after: { ...MCQ, marks: 3, options: [{ text: 'filter() is lazy', isCorrect: true }, ...MCQ.options.slice(1).map((o) => ({ ...o, isCorrect: false }))] },
    changed: ['options', 'marks'],
    duplicate: null,
    secondApproval: null,
    rowVersion: 2,
  },
  {
    id: 'r2',
    questionId: 'q5',
    kind: 'new',
    fromVersion: null,
    toVersion: 1,
    author: 'Sonal Mehta',
    aiDrafted: true,
    submittedAt: at(15),
    before: null,
    after: { ...MCQ, text: 'Which Java Stream operation is lazy and returns a stream?', category: 'Food safety' },
    changed: [],
    duplicate: { percent: 95, questionId: 'q1', text: 'Which Java Stream operation is lazy and returns a new stream?', cleared: false },
    secondApproval: { firstBy: null },
    rowVersion: 1,
  },
];

export const REVIEW_TRANSLATIONS: ReviewTranslation[] = [
  { id: 't9', questionId: 'q3', language: 'hi', version: 1, english: { text: 'A dispatch van covers 180 km in 3 hours. How far in 5 hours?', options: ['250 km', '300 km'] }, text: 'एक डिस्पैच वैन 3 घंटे में 180 किमी चलती है। 5 घंटे में कितनी दूर?', options: ['250 किमी', '300 किमी'], aiAssisted: true, author: 'Kavin Raj', submittedAt: at(13), rowVersion: 3 },
];

export function liveReviews(over: Partial<LiveReviews> = {}): LiveReviews {
  return { state: 'ready', onRetry: () => undefined, changes: REVIEW_CHANGES, translations: REVIEW_TRANSLATIONS, onOpenQuestion: () => undefined, onApprove: () => Promise.resolve({ state: 'approved', version: 3 }), onRequestChanges: ok, onClearDuplicate: ok, onDecideTranslation: ok, ...over };
}

export const ITEM_ROWS: ItemRow[] = [
  { questionId: 'q1', text: 'Which Java Stream operation is lazy and returns a new stream?', responses: 142, percentCorrect: 62, discrimination: 0.41, flags: [], declared: 'medium', observed: 'medium' },
  { questionId: 'q6', text: 'Which SQL clause filters groups?', responses: 412, percentCorrect: 91, discrimination: 0.12, flags: ['Weak discrimination'], declared: 'hard', observed: 'easy' },
  { questionId: 'q7', text: 'What does a CCP stand for?', responses: 38, percentCorrect: 44, discrimination: -0.08, flags: ['Answer key may be wrong'], declared: 'medium', observed: 'medium' },
];

export function liveItems(over: Partial<LiveItemAnalysis> = {}): LiveItemAnalysis {
  return { state: 'ready', onRetry: () => undefined, rows: ITEM_ROWS, provisionalAnswers: 200, onLoadItem: () => Promise.resolve(ITEM_STATS), onOpenQuestion: () => undefined, ...over };
}
