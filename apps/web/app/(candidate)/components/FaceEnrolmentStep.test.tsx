import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FaceEnrolmentStep } from './FaceEnrolmentStep';
import { useFaceEnrolment } from '../../../lib/hooks/useAttempt';

jest.mock('../../../lib/hooks/useAttempt', () => ({ useFaceEnrolment: jest.fn() }));

const mutateAsync = jest.fn().mockResolvedValue({ status: 'enrolled' });

beforeEach(() => {
  mutateAsync.mockClear();
  (useFaceEnrolment as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
});

describe('FaceEnrolmentStep', () => {
  // Consent is the lawful basis. Nothing may be captured before it is given.
  it('asks for consent before touching the camera', () => {
    render(<FaceEnrolmentStep policy="retry_then_allow" onSettled={jest.fn()} />);
    expect(screen.getByText(/photo of your face/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /take photo/i })).not.toBeInTheDocument();
  });

  it('says plainly what declining means when the exam requires enrolment', () => {
    render(<FaceEnrolmentStep policy="require_enrolment" onSettled={jest.fn()} />);
    expect(screen.getByText(/you won’t be able to start/i)).toBeInTheDocument();
  });

  it('settles as not_verified without a photo when the candidate declines under a permissive policy', async () => {
    const onSettled = jest.fn();
    render(<FaceEnrolmentStep policy="retry_then_allow" onSettled={onSettled} />);

    await userEvent.click(screen.getByRole('button', { name: /don’t agree/i }));

    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ status: 'not_verified', consentGiven: false }));
    expect(onSettled).toHaveBeenCalledWith('not_verified');
  });

  it('does not settle at all when the candidate declines and enrolment is required', async () => {
    const onSettled = jest.fn();
    render(<FaceEnrolmentStep policy="require_enrolment" onSettled={onSettled} />);

    await userEvent.click(screen.getByRole('button', { name: /don’t agree/i }));

    expect(onSettled).not.toHaveBeenCalled();
    expect(screen.getByText(/contact your recruiter/i)).toBeInTheDocument();
  });
});
