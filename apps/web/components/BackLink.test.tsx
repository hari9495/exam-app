import { render, screen } from '@testing-library/react';
import { BackLink } from './BackLink';

describe('BackLink', () => {
  it('renders the label and links to the given href', () => {
    render(<BackLink href="/exams" label="Back to exams" />);

    const link = screen.getByRole('link', { name: /Back to exams/ });
    expect(link).toHaveAttribute('href', '/exams');
  });
});
