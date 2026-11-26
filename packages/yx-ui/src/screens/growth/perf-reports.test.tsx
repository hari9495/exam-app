import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PerformanceReportsScreen } from './perf-reports';

// Performance reports (batch PM6, M06-BUILD-DESIGN §13), a designed screen since batch T2-C.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = async () => ({});

describe('Performance reports', () => {
  it('reports show suppressed cells as hidden and download a CSV', async () => {
    const onDownload = vi.fn(ok);
    render(<PerformanceReportsScreen state="ready" cycles={[{ value: 'c1', label: 'H1' }]} cycleId="c1" onCycle={vi.fn()} kind="distribution" onKind={vi.fn()} report={{ kind: 'distribution', cycle: 'H1', header: ['department', 'band', 'people'], rows: [['Sales', 'Meets', null]] }} onDownload={onDownload} />);
    expect(screen.getByText('Hidden (small group)')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(onDownload).toHaveBeenCalled();
  });

  it('asks for a cycle when there is none, with no download', () => {
    render(<PerformanceReportsScreen state="ready" cycles={[]} cycleId={null} onCycle={vi.fn()} kind="completion" onKind={vi.fn()} report={null} />);
    expect(screen.getByText('Choose a cycle.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download CSV' })).not.toBeInTheDocument();
  });
});
