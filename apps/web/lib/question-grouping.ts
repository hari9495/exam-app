import { Question, Difficulty } from './types';

export type GroupByField = 'topic' | 'category' | 'difficulty' | 'tag';
export type GroupBy = 'none' | GroupByField;

export interface QuestionGroup {
  label: string;
  questions: Question[];
}

const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'medium', 'hard'];
const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

const PLACEHOLDER_LABEL: Record<GroupByField, string> = {
  topic: 'No topic',
  category: 'No category',
  difficulty: 'No difficulty',
  tag: 'No tags',
};

export function groupQuestions(questions: Question[], groupBy: GroupByField): QuestionGroup[] {
  const buckets = new Map<string, Question[]>();
  function push(label: string, question: Question) {
    const existing = buckets.get(label);
    if (existing) {
      existing.push(question);
    } else {
      buckets.set(label, [question]);
    }
  }

  for (const question of questions) {
    if (groupBy === 'tag') {
      // A question can carry several tags, so it legitimately appears under each
      // of them -- group counts can therefore exceed the total question count.
      const tags = question.tags ?? [];
      if (tags.length === 0) {
        push(PLACEHOLDER_LABEL.tag, question);
      } else {
        for (const tag of tags) {
          push(tag.name, question);
        }
      }
    } else if (groupBy === 'difficulty') {
      push(DIFFICULTY_LABEL[question.difficulty] ?? PLACEHOLDER_LABEL.difficulty, question);
    } else {
      const value = groupBy === 'topic' ? question.topic : question.category;
      push(value?.trim() ? value : PLACEHOLDER_LABEL[groupBy], question);
    }
  }

  const groups = Array.from(buckets, ([label, grouped]) => ({ label, questions: grouped }));

  if (groupBy === 'difficulty') {
    const order = DIFFICULTY_ORDER.map((difficulty) => DIFFICULTY_LABEL[difficulty]);
    const rank = (label: string) => (order.indexOf(label) === -1 ? order.length : order.indexOf(label));
    return groups.sort((a, b) => rank(a.label) - rank(b.label));
  }

  // Alphabetical, with the "not set" bucket pinned last so it never buries real groups.
  const placeholder = PLACEHOLDER_LABEL[groupBy];
  return groups.sort((a, b) => {
    if (a.label === placeholder) return 1;
    if (b.label === placeholder) return -1;
    return a.label.localeCompare(b.label);
  });
}
