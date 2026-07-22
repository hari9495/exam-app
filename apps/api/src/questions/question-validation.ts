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
  languageMode?: string;
  allowedLanguages?: string[];
}

const VALID_TYPES = ['single_mcq', 'multi_mcq', 'true_false', 'code'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];
// Purely a cosmetic label list for the QCIC feature's decorative `snippetLanguage` field
// (shown as plain text above a read-only <pre> block, no execution, no highlighting) — NOT
// related to the Code Run Execution feature's actual language capability, which is now driven
// entirely by the live Piston runtime list passed into validateQuestionPayload below.
export const VALID_CODE_LANGUAGES = ['javascript', 'typescript', 'python', 'java', 'csharp', 'cpp', 'go', 'ruby'];

export function validateQuestionPayload(input: QuestionValidationInput, availableLanguages: string[] = []): void {
  const { type, difficulty, marks, negativeMarks, options, languageMode, allowedLanguages } = input;

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

  if (type === 'code') {
    if (options.length !== 0) {
      throw new BadRequestException('code questions must not have options');
    }
    if (languageMode !== 'fixed' && languageMode !== 'any') {
      throw new BadRequestException(`Unknown languageMode: ${languageMode}`);
    }
    if (languageMode === 'fixed') {
      if (!allowedLanguages || allowedLanguages.length === 0) {
        throw new BadRequestException('Fixed-mode code questions must specify at least one allowed language');
      }
      const unsupported = allowedLanguages.filter((lang) => !availableLanguages.includes(lang));
      if (unsupported.length > 0) {
        throw new BadRequestException(`Unsupported language(s): ${unsupported.join(', ')}`);
      }
    } else if (allowedLanguages && allowedLanguages.length > 0) {
      throw new BadRequestException('Any-mode code questions must not specify allowedLanguages');
    }
  } else if (type === 'true_false') {
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
