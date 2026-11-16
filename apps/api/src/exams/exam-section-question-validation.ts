import { BadRequestException } from '@nestjs/common';

export interface QuestionStatusLookup {
  id: string;
  status: string;
}

export function validateSectionQuestionsReplace(
  newQuestionIds: string[],
  currentlyLinkedQuestionIds: string[],
  questionStatuses: QuestionStatusLookup[],
): void {
  const seen = new Set<string>();
  for (const id of newQuestionIds) {
    if (seen.has(id)) {
      throw new BadRequestException(`Question ${id} is listed more than once`);
    }
    seen.add(id);
  }

  const currentlyLinkedSet = new Set(currentlyLinkedQuestionIds);
  const statusById = new Map(questionStatuses.map((q) => [q.id, q.status]));

  for (const id of newQuestionIds) {
    const isNewlyAdded = !currentlyLinkedSet.has(id);
    if (isNewlyAdded && statusById.get(id) !== 'active') {
      // Answer 2142: only an approved question (status active) goes into a fixed section.
      throw new BadRequestException(`Question ${id} is not approved and cannot be added to a section. Approve it in the question bank first.`);
    }
  }
}
