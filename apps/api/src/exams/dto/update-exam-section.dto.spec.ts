import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateExamSectionDto } from './update-exam-section.dto';

// Regression coverage for a bug that unit tests with a mocked fetch could not catch: the weight
// editor PATCHes only { weightPercent }, but UpdateExamSectionDto extends CreateExamSectionDto,
// whose `title` is required -- so every weight edit was rejected with 400 "title should not be
// empty" in production while the component test (mocking the response) passed.
function errorsFor(payload: Record<string, unknown>): string[] {
  const dto = plainToInstance(UpdateExamSectionDto, payload);
  return validateSync(dto).flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('UpdateExamSectionDto', () => {
  it('accepts a partial update carrying only weightPercent, without a title', () => {
    expect(errorsFor({ weightPercent: 60 })).toEqual([]);
  });

  it('accepts a partial update carrying only a title', () => {
    expect(errorsFor({ title: 'Renamed Section' })).toEqual([]);
  });

  it('still rejects a title that is present but blank -- clearing a name is not a valid edit', () => {
    expect(errorsFor({ title: '' }).join(' ')).toMatch(/should not be empty/);
  });

  it.each([-1, 101, 12.5])('rejects an out-of-range or fractional weightPercent (%p)', (weightPercent) => {
    expect(errorsFor({ weightPercent }).length).toBeGreaterThan(0);
  });

  it.each([0, 100])('accepts the weightPercent boundaries (%p)', (weightPercent) => {
    expect(errorsFor({ weightPercent })).toEqual([]);
  });

  it('accepts a partial update carrying only requiredCount', () => {
    expect(errorsFor({ requiredCount: 3 })).toEqual([]);
  });

  it('accepts null requiredCount, which clears the requirement back to "answer all"', () => {
    expect(errorsFor({ requiredCount: null })).toEqual([]);
  });

  it.each([0, -1, 2.5])('rejects a requiredCount that is not a positive integer (%p)', (requiredCount) => {
    expect(errorsFor({ requiredCount }).length).toBeGreaterThan(0);
  });
});
