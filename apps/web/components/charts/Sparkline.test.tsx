import { render } from '@testing-library/react';
import { Sparkline } from './Sparkline';

describe('Sparkline', () => {
  it('renders an area path and a line path for the given data', () => {
    const { container } = render(
      <Sparkline
        data={[
          { date: '2026-07-01', value: 3 },
          { date: '2026-07-02', value: 7 },
          { date: '2026-07-03', value: 5 },
        ]}
        color="#0d9488"
      />,
    );
    expect(container.querySelectorAll('path')).toHaveLength(2);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders without crashing and with no paths for empty data', () => {
    const { container } = render(<Sparkline data={[]} color="#0d9488" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelectorAll('path')).toHaveLength(0);
  });

  it('renders a flat line without crashing when every value is zero', () => {
    const { container } = render(
      <Sparkline
        data={[
          { date: '2026-07-01', value: 0 },
          { date: '2026-07-02', value: 0 },
        ]}
        color="#0d9488"
      />,
    );
    expect(container.querySelectorAll('path')).toHaveLength(2);
  });
});
