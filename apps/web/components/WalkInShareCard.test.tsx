import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from './ui';
import { WalkInShareCard } from './WalkInShareCard';

function renderCard() {
  return render(
    <ToastProvider>
      <WalkInShareCard examId="exam-1" orgSlug="demo-org" />
    </ToastProvider>,
  );
}

describe('WalkInShareCard', () => {
  const writeText = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.assign(navigator, { clipboard: { writeText } });
    // jsdom has no Web Share API by default -- each test opts it in when needed.
    delete (navigator as unknown as { share?: unknown }).share;
  });

  it('shows the walk-in URL for this exam and org, with the exam preselected', async () => {
    renderCard();

    await waitFor(() => {
      expect(screen.getByText(/\/walk-in\/demo-org\?exam=exam-1/)).toBeInTheDocument();
    });
  });

  it('renders a QR code image for the URL', async () => {
    renderCard();

    const img = await screen.findByAltText('QR code for walk-in registration');
    expect(img).toHaveAttribute('src', expect.stringMatching(/^data:image\/png/));
  });

  it('copies the link to the clipboard when "Copy link" is clicked', async () => {
    renderCard();
    await screen.findByText(/\/walk-in\/demo-org/);

    await userEvent.click(screen.getByRole('button', { name: /copy link/i }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/walk-in/demo-org?exam=exam-1'));
    expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument();
  });

  it('uses the Web Share API when available', async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share });
    renderCard();
    await screen.findByText(/\/walk-in\/demo-org/);

    await userEvent.click(screen.getByRole('button', { name: /^share$/i }));

    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('/walk-in/demo-org?exam=exam-1') }));
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to copying the link when the Web Share API is unavailable', async () => {
    renderCard();
    await screen.findByText(/\/walk-in\/demo-org/);

    await userEvent.click(screen.getByRole('button', { name: /^share$/i }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/walk-in/demo-org?exam=exam-1'));
  });
});
