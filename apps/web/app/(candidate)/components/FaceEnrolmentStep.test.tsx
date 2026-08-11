import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FaceEnrolmentStep } from './FaceEnrolmentStep';

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

  // The step BUILDS the enrolment body and hands it up; it must not send it. There is no attempt
  // to key the row to until /attempt/start has run, so a POST from here could only ever 400.
  it('hands a declined not_verified payload up rather than posting it itself', async () => {
    const onSettled = jest.fn();
    render(<FaceEnrolmentStep policy="retry_then_allow" onSettled={onSettled} />);

    await userEvent.click(screen.getByRole('button', { name: /don’t agree/i }));

    expect(onSettled).toHaveBeenCalledWith({ status: 'not_verified', consentGiven: false });
  });

  it('does not settle at all when the candidate declines and enrolment is required', async () => {
    const onSettled = jest.fn();
    render(<FaceEnrolmentStep policy="require_enrolment" onSettled={onSettled} />);

    await userEvent.click(screen.getByRole('button', { name: /don’t agree/i }));

    expect(onSettled).not.toHaveBeenCalled();
    expect(screen.getByText(/contact your recruiter/i)).toBeInTheDocument();
  });
});
