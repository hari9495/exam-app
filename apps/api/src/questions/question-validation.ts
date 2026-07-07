import { BadRequestException } from '@nestjs/common';

export interface QuestionOptionInput {
  text: string;
  isCorrect: boolean;
}

export interface QuestionValidationInput {
  type: string;
  difficulty: string;
  marks: number;
  negativeMarks: number;
  options: QuestionOptionInput[];
}

const VALID_TYPES = ['single_mcq', 'multi_mcq', 'true_false'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];

export function validateQuestionPayload(input: QuestionValidationInput): void {
  const { type, difficulty, marks, negativeMarks, options } = input;

  if (!VALID_TYPES.includes(type)) {
    throw new BadRequestException(`Unknown question type: ${type}`);
  }
  if (!VALID_DIFFICULTIES.includes(difficulty)) {
    throw new BadRequestException(`Unknown difficulty: ${difficulty}`);
  }
  if (marks <= 0) {
    throw new BadRequestException('marks must be greater than 0');
  }
  if (negativeMarks < 0) {
    throw new BadRequestException('negativeMarks must be 0 or greater');
  }
  if (negativeMarks > marks) {
    throw new BadRequestException('negativeMarks cannot exceed marks');
  }

  const correctCount = options.filter((o) => o.isCorrect).length;

  if (type === 'true_false') {
    if (options.length !== 2) {
      throw new BadRequestException('true_false questions must have exactly 2 options');
    }
    if (correctCount !== 1) {
      throw new BadRequestException('true_false questions must have exactly 1 correct option');
    }
  } else if (type === 'single_mcq') {
    if (options.length < 2) {
      throw new BadRequestException('single_mcq questions must have at least 2 options');
    }
    if (correctCount !== 1) {
      throw new BadRequestException('single_mcq questions must have exactly 1 correct option');
    }
  } else if (type === 'multi_mcq') {
    if (options.length < 2) {
      throw new BadRequestException('multi_mcq questions must have at least 2 options');
    }
    if (correctCount < 1) {
      throw new BadRequestException('multi_mcq questions must have at least 1 correct option');
    }
  }
}
