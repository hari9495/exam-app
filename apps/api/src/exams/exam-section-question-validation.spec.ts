import { BadRequestException } from '@nestjs/common';
import { validateSectionQuestionsReplace } from './exam-section-question-validation';

describe('validateSectionQuestionsReplace', () => {
  it('accepts a fresh list of active questions with no current links', () => {
    expect(() =>
      validateSectionQuestionsReplace(
        ['q1', 'q2'],
        [],
        [
          { id: 'q1', status: 'active' },
          { id: 'q2', status: 'active' },
        ],
      ),
    ).not.toThrow();
  });

  it('accepts an empty list, detaching every question from the section', () => {
    expect(() => validateSectionQuestionsReplace([], ['q1', 'q2'], [])).not.toThrow();
  });

  it('accepts keeping an already-linked question that has since been archived', () => {
    expect(() =>
      validateSectionQuestionsReplace(['q1'], ['q1'], [{ id: 'q1', status: 'archived' }]),
    ).not.toThrow();
  });

  it('accepts a mix of a retained archived question and a newly-added active one', () => {
    expect(() =>
      validateSectionQuestionsReplace(
        ['q1', 'q2'],
        ['q1'],
        [
          { id: 'q1', status: 'archived' },
          { id: 'q2', status: 'active' },
        ],
      ),
    ).not.toThrow();
  });

  it('rejects a newly-added archived question', () => {
    expect(() =>
      validateSectionQuestionsReplace(['q1'], [], [{ id: 'q1', status: 'archived' }]),
    ).toThrow(BadRequestException);
  });

  it('rejects a duplicate question id in the new list', () => {
    expect(() =>
      validateSectionQuestionsReplace(
        ['q1', 'q1'],
        [],
        [
          { id: 'q1', status: 'active' },
          { id: 'q1', status: 'active' },
        ],
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a duplicate even when the duplicated question is already linked and archived', () => {
    expect(() =>
      validateSectionQuestionsReplace(['q1', 'q1'], ['q1'], [{ id: 'q1', status: 'archived' }]),
    ).toThrow(BadRequestException);
  });
});
