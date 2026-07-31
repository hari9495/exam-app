import { fireEvent, render, screen } from '@testing-library/react';
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

  it('shows a tooltip with the date and value of the nearest point on hover', () => {
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = () =>
      ({ width: 200, height: 48, top: 0, left: 0, right: 200, bottom: 48, x: 0, y: 0, toJSON() {} }) as DOMRect;

    render(
      <Sparkline
        data={[
          { date: '2026-07-01', value: 3 },
          { date: '2026-07-02', value: 7 },
          { date: '2026-07-03', value: 5 },
        ]}
        color="#0d9488"
      />,
    );
    const svg = screen.getByLabelText('Trend Sparkline');
    const expectedLabel = new Date('2026-07-02T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

    // The mocked scalePoint (apps/web/__mocks__/d3-scale.ts) places '2026-07-02' at x=40, not evenly spread like the real d3-scale.
    fireEvent.mouseMove(svg, { clientX: 40, clientY: 24 });
    expect(screen.getByText(`${expectedLabel}: 7`)).toBeInTheDocument();

    fireEvent.mouseLeave(svg);
    expect(screen.queryByText(`${expectedLabel}: 7`)).not.toBeInTheDocument();

    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });
});
