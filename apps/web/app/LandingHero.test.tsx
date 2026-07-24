import { render, screen } from '@testing-library/react';
import LandingHero from './LandingHero';

describe('LandingHero', () => {
  it('renders its children', () => {
    render(
      <LandingHero>
        <h1>Test headline</h1>
      </LandingHero>,
    );

    expect(screen.getByRole('heading', { name: 'Test headline' })).toBeInTheDocument();
  });
});
