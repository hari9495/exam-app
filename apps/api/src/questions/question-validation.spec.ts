import { BadRequestException } from '@nestjs/common';
import { validateQuestionPayload } from './question-validation';

describe('validateQuestionPayload', () => {
  const base = { marks: 5, negativeMarks: 1 };

  it('accepts a valid single_mcq question', () => {
    expect(() =>
      validateQuestionPayload({
        ...base,
        type: 'single_mcq',
        difficulty: 'easy',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: false },
        ],
      }),
    ).not.toThrow();
  });

  it('rejects single_mcq with 0 correct options', () => {
    expect(() =>
      validateQuestionPayload({
        ...base,
        type: 'single_mcq',
        difficulty: 'easy',
        options: [
          { text: 'A', isCorrect: false },
          { text: 'B', isCorrect: false },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects single_mcq with 2 correct options', () => {
    expect(() =>
      validateQuestionPayload({
        ...base,
        type: 'single_mcq',
        difficulty: 'easy',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: true },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects single_mcq with fewer than 2 options', () => {
    expect(() =>
      validateQuestionPayload({
        ...base,
        type: 'single_mcq',
        difficulty: 'easy',
        options: [{ text: 'A', isCorrect: true }],
      }),
    ).toThrow(BadRequestException);
  });

  it('accepts a valid multi_mcq question with multiple correct options', () => {
    expect(() =>
      validateQuestionPayload({
        ...base,
        type: 'multi_mcq',
        difficulty: 'medium',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: true },
          { text: 'C', isCorrect: false },
        ],
      }),
    ).not.toThrow();
  });

  it('rejects multi_mcq with 0 correct options', () => {
    expect(() =>
      validateQuestionPayload({
        ...base,
        type: 'multi_mcq',
        difficulty: 'medium',
        options: [
          { text: 'A', isCorrect: false },
          { text: 'B', isCorrect: false },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('accepts a valid true_false question', () => {
    expect(() =>
      validateQuestionPayload({
        ...base,
        type: 'true_false',
        difficulty: 'easy',
        options: [
          { text: 'True', isCorrect: true },
          { text: 'False', isCorrect: false },
        ],
      }),
    ).not.toThrow();
  });

  it('rejects true_false with anything other than 2 options', () => {
    expect(() =>
      validateQuestionPayload({
        ...base,
        type: 'true_false',
        difficulty: 'easy',
        options: [{ text: 'True', isCorrect: true }],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects true_false with 0 correct options', () => {
    expect(() =>
      validateQuestionPayload({
        ...base,
        type: 'true_false',
        difficulty: 'easy',
        options: [
          { text: 'True', isCorrect: false },
          { text: 'False', isCorrect: false },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects an unknown question type', () => {
    expect(() =>
      validateQuestionPayload({
        ...base,
        type: 'fill_in_blank',
        difficulty: 'easy',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: false },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects marks of 0 or less', () => {
    expect(() =>
      validateQuestionPayload({
        type: 'true_false',
        difficulty: 'easy',
        marks: 0,
        negativeMarks: 0,
        options: [
          { text: 'True', isCorrect: true },
          { text: 'False', isCorrect: false },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects negativeMarks less than 0', () => {
    expect(() =>
      validateQuestionPayload({
        type: 'true_false',
        difficulty: 'easy',
        marks: 2,
        negativeMarks: -1,
        options: [
          { text: 'True', isCorrect: true },
          { text: 'False', isCorrect: false },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects negativeMarks greater than marks', () => {
    expect(() =>
      validateQuestionPayload({
        type: 'true_false',
        difficulty: 'easy',
        marks: 2,
        negativeMarks: 3,
        options: [
          { text: 'True', isCorrect: true },
          { text: 'False', isCorrect: false },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('accepts a fixed-mode code question with zero options and an allowed language', () => {
    expect(() =>
      validateQuestionPayload(
        {
          type: 'code',
          difficulty: 'medium',
          marks: 10,
          negativeMarks: 0,
          options: [],
          languageMode: 'fixed',
          allowedLanguages: ['python'],
        },
        ['python', 'javascript'],
      ),
    ).not.toThrow();
  });

  it('accepts a fixed-mode code question with multiple allowed languages', () => {
    expect(() =>
      validateQuestionPayload(
        {
          type: 'code',
          difficulty: 'medium',
          marks: 10,
          negativeMarks: 0,
          options: [],
          languageMode: 'fixed',
          allowedLanguages: ['python', 'java'],
        },
        ['python', 'java', 'javascript'],
      ),
    ).not.toThrow();
  });

  it('accepts an any-mode code question with no allowedLanguages', () => {
    expect(() =>
      validateQuestionPayload(
        { type: 'code', difficulty: 'medium', marks: 10, negativeMarks: 0, options: [], languageMode: 'any' },
        ['python', 'javascript'],
      ),
    ).not.toThrow();
  });

  it('rejects a code question with any options', () => {
    expect(() =>
      validateQuestionPayload(
        {
          type: 'code',
          difficulty: 'medium',
          marks: 10,
          negativeMarks: 0,
          options: [{ text: 'irrelevant', isCorrect: false }],
          languageMode: 'fixed',
          allowedLanguages: ['python'],
        },
        ['python'],
      ),
    ).toThrow('code questions must not have options');
  });

  it('rejects a code question with an unknown languageMode', () => {
    expect(() =>
      validateQuestionPayload(
        { type: 'code', difficulty: 'medium', marks: 10, negativeMarks: 0, options: [], languageMode: 'sometimes' },
        ['python'],
      ),
    ).toThrow('Unknown languageMode');
  });

  it('rejects a fixed-mode code question with no allowedLanguages', () => {
    expect(() =>
      validateQuestionPayload(
        { type: 'code', difficulty: 'medium', marks: 10, negativeMarks: 0, options: [], languageMode: 'fixed', allowedLanguages: [] },
        ['python'],
      ),
    ).toThrow('Fixed-mode code questions must specify at least one allowed language');
  });

  it('rejects a fixed-mode code question with a language not on the live Piston list', () => {
    expect(() =>
      validateQuestionPayload(
        { type: 'code', difficulty: 'medium', marks: 10, negativeMarks: 0, options: [], languageMode: 'fixed', allowedLanguages: ['cobol'] },
        ['python', 'javascript'],
      ),
    ).toThrow('Unsupported language(s): cobol');
  });

  it('rejects an any-mode code question that also specifies allowedLanguages', () => {
    expect(() =>
      validateQuestionPayload(
        { type: 'code', difficulty: 'medium', marks: 10, negativeMarks: 0, options: [], languageMode: 'any', allowedLanguages: ['python'] },
        ['python'],
      ),
    ).toThrow('Any-mode code questions must not specify allowedLanguages');
  });
});
