import { render, screen } from '@testing-library/react';
import CandidateSessionEndedPage from './page';

it('shows the kit "Your session has ended" screen with what to do next (decision 2398)', () => {
  render(<CandidateSessionEndedPage />);
  expect(screen.getByText('Your session has ended')).toBeInTheDocument();
  expect(screen.getByText(/use the link in your invitation email again/)).toBeInTheDocument();
});
