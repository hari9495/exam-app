import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConsentScreen, IdentityCheckScreen, ReadyToStartScreen, type LiveReadyToStart } from './candidate';
import { LIVE_CONSENT, LIVE_SELFIE } from './runner-live-samples';

// Answer 2201: the designed consent (PRC-24) and selfie (PRC-25) with a real invitation.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const tick = (name: RegExp) => ue.click(screen.getByRole('checkbox', { name }));

describe('PRC-24 live consent', () => {
  it('shows what is recorded and kept; agreeing to all passes on the face-check choice', async () => {
    const onAgree = vi.fn();
    render(<ConsentScreen live={{ ...LIVE_CONSENT, retentionDays: 45, onAgree }} />);
    expect(screen.getByText('Deleted 45 days after your result, unless you ask for a review')).toBeInTheDocument();
    await tick(/recording/);
    await tick(/face checks/);
    await tick(/closed all other applications/);
    await ue.click(screen.getByRole('button', { name: 'Agree and continue' }));
    expect(onAgree).toHaveBeenCalledWith({ faceChecks: true });
  });

  it('when the photo is optional, saying no to face checks still lets the candidate continue', async () => {
    const onAgree = vi.fn();
    render(<ConsentScreen live={{ ...LIVE_CONSENT, onAgree }} />);
    await tick(/recording/);
    await tick(/closed all other applications/);
    await ue.click(screen.getByRole('button', { name: 'Agree and continue' }));
    expect(onAgree).toHaveBeenCalledWith({ faceChecks: false });
  });

  it('negative: when the photo is required, Agree waits for face checks; saying no offers the manual check', async () => {
    const onAsk = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<ConsentScreen live={{ ...LIVE_CONSENT, faceRequired: true, manual: { state: 'none', onAsk } }} />);
    await tick(/recording/);
    await tick(/closed all other applications/);
    expect(screen.getByRole('button', { name: 'Agree and continue' })).toBeDisabled();
    rerender(<ConsentScreen live={{ ...LIVE_CONSENT, faceRequired: true, declined: true, manual: { state: 'none', onAsk } }} />);
    await ue.click(screen.getByRole('button', { name: 'Ask for a manual identity check' }));
    expect(onAsk).toHaveBeenCalled();
  });

  it('negative: a failed request to ask says so and can be tried again', async () => {
    const onAsk = vi.fn().mockRejectedValue(new Error('Your request was not sent.'));
    render(<ConsentScreen live={{ ...LIVE_CONSENT, faceRequired: true, declined: true, manual: { state: 'none', onAsk } }} />);
    await ue.click(screen.getByRole('button', { name: 'Ask for a manual identity check' }));
    expect(await screen.findByText('Your request was not sent.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask for a manual identity check' })).toBeEnabled();
  });

  it('an approved manual check replaces the face checks', () => {
    render(<ConsentScreen live={{ ...LIVE_CONSENT, faceRequired: true, manual: { state: 'approved', onAsk: vi.fn() } }} />);
    expect(screen.getByText('A manual identity check was approved for you')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /face checks/ })).not.toBeInTheDocument();
  });
});

// A sample company name or a link that goes nowhere must never reach a real candidate.
describe('live candidate frame', () => {
  it('shows the inviting company, not the sample one, and no portal tabs or placeholder legal links', () => {
    render(<ConsentScreen live={{ ...LIVE_CONSENT, companyName: 'Acme Hiring' }} />);
    expect(screen.getByText('Acme Hiring')).toBeInTheDocument();
    expect(screen.queryByText(/Kaveri/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Privacy notice' })).not.toBeInTheDocument();
    expect(screen.queryByText('Practice')).not.toBeInTheDocument();
  });

  it('negative: the design story keeps its sample frame', () => {
    render(<ConsentScreen />);
    expect(screen.getByRole('link', { name: 'Privacy notice' })).toBeInTheDocument();
  });
});

describe('PRC-25 live selfie', () => {
  it('shows the camera, what to do and which try this is', () => {
    render(<IdentityCheckScreen live={{ ...LIVE_SELFIE, camera: <span>camera feed</span>, tries: 1, failed: true, hint: 'Face the light.' }} />);
    expect(screen.getByText('camera feed')).toBeInTheDocument();
    expect(screen.getByText('That try did not work')).toBeInTheDocument();
    expect(screen.getByText('Try 2 of 3')).toBeInTheDocument();
  });

  it('negative: blocked without a manual path says to contact the person who invited them', () => {
    render(<IdentityCheckScreen live={{ ...LIVE_SELFIE, blocked: true }} />);
    expect(screen.getByText(/Contact the person who invited you/)).toBeInTheDocument();
  });
});

// Answer 2232: the start card on /welcome as the designed "Ready to start" step.
const READY: LiveReadyToStart = {
  companyName: 'Kaveri Foods',
  candidateName: 'Arjun Nair',
  testTitle: 'SQL basics',
  durationMinutes: 40,
  sections: [{ title: 'SQL', questions: 6 }],
  instructions: 'Answer every question.',
  notes: [],
  window: { state: 'open' },
  camera: { state: 'on', onTurnOn: () => undefined },
  problem: null,
  seb: null,
  onAccommodation: () => undefined,
  onReadiness: () => undefined,
  onMyTests: () => undefined,
  starting: false,
  onStart: () => undefined,
};

describe('PRC-22 live Ready to start', () => {
  it('shows the test, its sections and instructions; Start starts once the camera is on', async () => {
    const onStart = vi.fn();
    render(<ReadyToStartScreen live={{ ...READY, onStart }} />);
    expect(screen.getByText('40 minutes')).toBeInTheDocument();
    expect(screen.getAllByText('6 questions')).toHaveLength(2);
    expect(screen.getByText('Answer every question.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Start test' }));
    expect(onStart).toHaveBeenCalled();
  });

  it('negative: with the camera off there is no Start, only Turn on camera', async () => {
    const onTurnOn = vi.fn();
    render(<ReadyToStartScreen live={{ ...READY, camera: { state: 'off', onTurnOn } }} />);
    expect(screen.queryByRole('button', { name: 'Start test' })).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Turn on camera' }));
    expect(onTurnOn).toHaveBeenCalled();
  });

  it('negative: a blocked camera says how to allow it; a test without the camera starts straight away', () => {
    const { rerender } = render(<ReadyToStartScreen live={{ ...READY, camera: { state: 'blocked', onTurnOn: () => undefined } }} />);
    expect(screen.getByText('Camera blocked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try the camera again' })).toBeInTheDocument();
    rerender(<ReadyToStartScreen live={{ ...READY, camera: null }} />);
    expect(screen.getByRole('button', { name: 'Start test' })).toBeInTheDocument();
  });

  it('negative: not open yet or closed shows no Start; a problem says why the start did not go ahead', () => {
    const { rerender } = render(<ReadyToStartScreen live={{ ...READY, window: { state: 'not_open', opensAt: '1 Dec 2026, 2:00 pm' } }} />);
    expect(screen.getByText(/opens on 1 Dec 2026, 2:00 pm/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start test' })).toBeNull();
    rerender(<ReadyToStartScreen live={{ ...READY, window: { state: 'closed' } }} />);
    expect(screen.getByText(/window has closed/)).toBeInTheDocument();
    rerender(<ReadyToStartScreen live={{ ...READY, problem: 'Please disconnect additional displays before starting the test.' }} />);
    expect(screen.getByText('Please disconnect additional displays before starting the test.')).toBeInTheDocument();
  });

  it('Safe Exam Browser replaces Start with the configuration download; an unfinished photo goes back to it', async () => {
    const onDownload = vi.fn();
    const onPhoto = vi.fn();
    const { rerender } = render(<ReadyToStartScreen live={{ ...READY, seb: { onDownload } }} />);
    expect(screen.queryByRole('button', { name: 'Start test' })).toBeNull();
    await ue.click(screen.getByRole('button', { name: /Download the configuration/ }));
    expect(onDownload).toHaveBeenCalled();
    rerender(<ReadyToStartScreen live={{ ...READY, onPhoto }} />);
    await ue.click(screen.getByRole('button', { name: 'Continue to the photo check' }));
    expect(onPhoto).toHaveBeenCalled();
  });
});
