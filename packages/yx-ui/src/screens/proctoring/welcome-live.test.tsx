import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConsentScreen, IdentityCheckScreen } from './candidate';
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
