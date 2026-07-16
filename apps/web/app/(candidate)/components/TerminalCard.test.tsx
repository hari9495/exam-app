import { render, screen } from '@testing-library/react';
import { TerminalCard } from './TerminalCard';

describe('TerminalCard', () => {
  it('renders the title and body for every tone', () => {
    const tones = ['loading', 'success', 'error', 'neutral'] as const;
    tones.forEach((tone) => {
      const { unmount } = render(<TerminalCard tone={tone} title={`Title ${tone}`} body={`Body ${tone}`} />);
      expect(screen.getByText(`Title ${tone}`)).toBeInTheDocument();
      expect(screen.getByText(`Body ${tone}`)).toBeInTheDocument();
      unmount();
    });
  });
});
