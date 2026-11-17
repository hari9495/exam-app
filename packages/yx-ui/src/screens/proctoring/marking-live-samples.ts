// Sample `live` data for the PRC-19 and fairness stories of the states the real pages have (AS-6), and for the tests.
// Not used by the app.
import type { FairnessData, LiveEvaluator, LiveFairness, MarkingItem } from './marking-live';

const ok = () => Promise.resolve();
const nothing = () => undefined;

export const MARKING_ITEM: MarkingItem = {
  attemptId: '7f3a0000-0000-4000-8000-000000000001',
  questionId: 'q1',
  test: 'Quality supervisor certification',
  candidate: 'Candidate 7F3A',
  blind: true,
  question: { text: 'Explain how you would reduce food-safety deviations on a packing line. Name the method you would use and who owns each action.', type: 'essay', marks: 9 },
  answer: { text: 'First I would pull the deviation log for the last four weeks and group deviations by station. On line 3 most deviations are seal-temperature drops after the 2 pm changeover. Using 5 Whys, the cause is that the heater warm-up is skipped when the shift changes.', language: null, files: [] },
  state: 'needs_first',
  mine: null,
  toModerate: null,
  minor: false,
  suggestion: null,
  attemptReady: false,
};

export const liveEvaluator = (o: Partial<LiveEvaluator> = {}, item: Partial<MarkingItem> = {}): LiveEvaluator => ({
  state: 'ready',
  onRetry: nothing,
  position: { index: 13, total: 32 },
  item: { ...MARKING_ITEM, ...item },
  onMark: ok,
  onSuggest: ok,
  onNext: nothing,
  onFinish: ok,
  ...o,
});

export const FAIRNESS: FairnessData = {
  exam: { id: 'e1', title: 'Campus aptitude 2026' },
  minGroup: 30,
  described: 1840,
  rows: [
    { group: 'Men', attempts: 1020, rate: 0.62, ratio: 1, status: 'ok' },
    { group: 'Women', attempts: 790, rate: 0.41, ratio: 0.66, status: 'flagged' },
    { group: 'Another way', attempts: null, rate: null, ratio: null, status: 'hidden' },
  ],
  finding: { group: 'Women', ratio: 0.66 },
  review: null,
  survey: { responses: 412, averageRating: 4.1, clearPercent: 88 },
};

export const liveFairness = (o: Partial<LiveFairness> = {}, data: Partial<FairnessData> = {}): LiveFairness => ({
  state: 'ready',
  onRetry: nothing,
  data: { ...FAIRNESS, ...data },
  tests: [
    { id: 'e1', title: 'Campus aptitude 2026' },
    { id: 'e2', title: 'Java Backend Developer · L2' },
  ],
  onTest: nothing,
  onOpenReview: ok,
  onDecide: ok,
  ...o,
});
