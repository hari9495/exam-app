import { render, screen } from '@testing-library/react';
import { WorkfoxMark } from './WorkfoxMark';

it('renders an accessible svg mark that inherits currentColor', () => {
  render(<WorkfoxMark title="Workfox" size={16} />);
  const svg = screen.getByRole('img', { name: 'Workfox' });
  expect(svg.tagName.toLowerCase()).toBe('svg');
  expect(svg.getAttribute('width')).toBe('16');
  expect(svg.querySelector('path')?.getAttribute('stroke')).toBe('currentColor');
});
