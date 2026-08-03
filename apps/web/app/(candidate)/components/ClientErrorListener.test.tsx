import { render } from '@testing-library/react';
import { ClientErrorListener } from './ClientErrorListener';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';
import { reportClientError } from '../../../lib/client-error-reporter';

jest.mock('../../../lib/candidate-auth-context', () => ({ useCandidateAuth: jest.fn() }));
jest.mock('../../../lib/client-error-reporter', () => ({ reportClientError: jest.fn() }));

describe('ClientErrorListener', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports uncaught window errors while a candidate session is active', () => {
    (useCandidateAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
    render(<ClientErrorListener />);

    window.dispatchEvent(new ErrorEvent('error', { message: 'boom', filename: 'chunk.js', lineno: 42 }));

    expect(reportClientError).toHaveBeenCalledWith('tok', {
      kind: 'js_error',
      message: 'boom',
      detail: 'chunk.js:42',
    });
  });

  it('does not attach listeners without a session token', () => {
    (useCandidateAuth as jest.Mock).mockReturnValue({ accessToken: null });
    render(<ClientErrorListener />);

    window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }));

    expect(reportClientError).not.toHaveBeenCalled();
  });

  it('stops reporting after unmount', () => {
    (useCandidateAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
    const { unmount } = render(<ClientErrorListener />);
    unmount();

    window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }));

    expect(reportClientError).not.toHaveBeenCalled();
  });
});
