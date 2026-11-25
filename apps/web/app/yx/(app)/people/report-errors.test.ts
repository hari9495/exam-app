import { errorText, reportErrors } from './report-errors';

// PPL-03 Documents: verify and download refusals on the record become a plain message.
describe('report-errors', () => {
  it('errorText gives the server message, or a plain fallback', () => {
    expect(errorText(new Error('Not allowed'))).toBe('Not allowed');
    expect(errorText('x')).toBe('That did not work. Try again in a moment.');
  });

  it('verify and download refusals become a plain message, not an uncaught error', async () => {
    const show = jest.fn();
    await expect(reportErrors(async () => Promise.reject(new Error('The file has not passed the virus check yet.')), show)).resolves.toBeUndefined();
    await reportErrors(() => {
      throw new Error('Not found');
    }, show);
    await reportErrors(async () => 'ok', show);
    expect(show.mock.calls).toEqual([['The file has not passed the virus check yet.'], ['Not found']]);
  });
});
