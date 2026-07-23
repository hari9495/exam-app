import { render, screen } from '@testing-library/react';
import { GroupedBarChart } from './GroupedBarChart';

describe('GroupedBarChart', () => {
  const groups = [
    {
      label: 'Backend Round',
      series: [
        { key: 'passRate', value: 70, color: '#0d9488' },
        { key: 'avgScore', value: 62, color: '#d4a017' },
      ],
    },
    {
      label: 'Frontend Round',
      series: [
        { key: 'passRate', value: 55, color: '#0d9488' },
        { key: 'avgScore', value: 48, color: '#d4a017' },
      ],
    },
  ];

  it('renders one bar per series per group', () => {
    const { container } = render(<GroupedBarChart groups={groups} />);
    expect(container.querySelectorAll('rect')).toHaveLength(4);
  });

  it('renders a value label above each bar', () => {
    render(<GroupedBarChart groups={groups} />);
    expect(screen.getByText('70')).toBeInTheDocument();
    expect(screen.getByText('62')).toBeInTheDocument();
    expect(screen.getByText('55')).toBeInTheDocument();
    expect(screen.getByText('48')).toBeInTheDocument();
  });

  it('renders without crashing for empty groups', () => {
    const { container } = render(<GroupedBarChart groups={[]} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelectorAll('rect')).toHaveLength(0);
  });
});
