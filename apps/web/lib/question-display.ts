import { QuestionType, Difficulty } from './types';
import type { StatusTone } from '../components/ui';

export const TYPE_TONE: Record<QuestionType, StatusTone> = {
  single_mcq: 'info',
  multi_mcq: 'info',
  true_false: 'info',
  code: 'purple',
};

export const TYPE_LABEL: Record<QuestionType, string> = {
  single_mcq: 'MCQ',
  multi_mcq: 'Multi-select',
  true_false: 'True/False',
  code: 'Code',
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

export const DIFFICULTY_LEVEL: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };

export function formatMarks(marks: number): string {
  return `${marks} ${marks === 1 ? 'mark' : 'marks'}`;
}
