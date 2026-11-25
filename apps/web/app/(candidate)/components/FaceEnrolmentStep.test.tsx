import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FaceEnrolmentStep, ATTEMPT_TIMEOUT_MS } from './FaceEnrolmentStep';

// Answer 2201: the designed selfie step (PRC-25). Consent is given on the designed consent step before this mounts; here
// the camera never works, so every try fails and the policy decides what happens next.
beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: jest.fn().mockRejectedValue(new Error('NotAllowedError')) } });
});
afterEach(() => jest.useRealTimers());

async function failAll(tries: number) {
  for (let i = 0; i < tries; i++) {
    await act(async () => {
      await Promise.resolve();
      jest.advanceTimersByTime(ATTEMPT_TIMEOUT_MS);
    });
  }
}

describe('FaceEnrolmentStep', () => {
  it('shows the designed selfie step with the live camera and the tries', () => {
    render(<FaceEnrolmentStep policy="retry_then_allow" candidateName="Ada" companyName="Acme" onSettled={jest.fn()} />);
    expect(screen.getByRole('heading', { name: 'Check your identity' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your camera')).toBeInTheDocument();
    expect(screen.getByText('Look at the camera and blink.')).toBeInTheDocument();
  });

  // AS-4b (PRC-24): when the photo is required and cannot be taken, the manual identity check is offered.
  it('negative: required photo that cannot be taken offers the manual identity check, and asks for it', async () => {
    const onAsk = jest.fn().mockResolvedValue(undefined);
    const onSettled = jest.fn();
    render(<FaceEnrolmentStep policy="require_enrolment" candidateName="Ada" companyName="Acme" onSettled={onSettled} manualCheck={{ state: 'none', onAsk }} />);
    await failAll(3);
    expect(onSettled).not.toHaveBeenCalled();
    expect(screen.getByText('This test needs a photo check')).toBeInTheDocument();
    jest.useRealTimers();
    await userEvent.click(screen.getByRole('button', { name: 'Ask for a manual identity check' }));
    expect(onAsk).toHaveBeenCalled();
  });

  it('negative: once asked, says the manual check is being decided', async () => {
    render(<FaceEnrolmentStep policy="require_enrolment" candidateName="Ada" companyName="Acme" onSettled={jest.fn()} manualCheck={{ state: 'asked', onAsk: jest.fn() }} />);
    await failAll(3);
    expect(screen.getByText('You asked for a manual identity check')).toBeInTheDocument();
  });
});
