import { reportClientError, resetClientErrorReporter } from './client-error-reporter';

describe('reportClientError', () => {
  beforeEach(() => {
    resetClientErrorReporter();
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  it('posts the error to /attempt/client-error with the candidate token', () => {
    reportClientError('token-1', { kind: 'js_error', message: 'boom', detail: 'app.js:12', severity: 'error' });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/attempt/client-error'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-1' }),
        body: JSON.stringify({ kind: 'js_error', message: 'boom', detail: 'app.js:12', severity: 'error' }),
      }),
    );
  });

  it('does nothing without a token', () => {
    reportClientError(null, { kind: 'js_error', message: 'boom' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('dedupes repeated identical errors within a page load', () => {
    reportClientError('t', { kind: 'answer_save_failed', message: 'network' });
    reportClientError('t', { kind: 'answer_save_failed', message: 'network' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('hard-caps total reports per page load so a crash loop cannot flood the server', () => {
    for (let i = 0; i < 20; i += 1) {
      reportClientError('t', { kind: 'js_error', message: `error ${i}` });
    }
    expect(global.fetch).toHaveBeenCalledTimes(10);
  });

  it('never throws when fetch itself fails', () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    expect(() => reportClientError('t', { kind: 'js_error', message: 'boom' })).not.toThrow();
  });
});
