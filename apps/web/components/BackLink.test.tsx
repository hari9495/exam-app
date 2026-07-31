import { render, screen } from '@testing-library/react';
import { BackLink } from './BackLink';

describe('BackLink', () => {
  it('renders the label and links to the given href', () => {
    render(<BackLink href="/exams" label="Back To Exams" />);

    const link = screen.getByRole('link', { name: /Back To Exams/ });
    expect(link).toHaveAttribute('href', '/exams');
  });
});
