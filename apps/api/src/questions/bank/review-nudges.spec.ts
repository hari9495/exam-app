import { BANK_KEYS, waitingText } from './review-nudges.service';

// Answer 2129: the daily note's words and whom it is for.
describe('question review note', () => {
  it('names what waits, singular and plural, and where to go', () => {
    expect(waitingText(1, 0)).toBe('1 question waits for your review in the question bank. Open Hire › Assessments › Question review.');
    expect(waitingText(3, 0)).toMatch(/^3 questions wait for your review/);
    expect(waitingText(2, 1)).toMatch(/^2 questions and 1 translation wait for your review/);
    expect(waitingText(0, 2)).toMatch(/^2 translations wait for your review/);
  });

  it('is for the YukthiX bank key and its older alias, nothing wider', () => {
    expect(BANK_KEYS).toEqual(['asmt.bank.manage', 'question_bank:manage']);
  });
});
