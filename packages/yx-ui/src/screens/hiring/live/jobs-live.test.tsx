import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HiringJobsScreen, type HiringJobsScreenProps } from './jobs';

// Recruitment batch AT1 (M10-BUILD-DESIGN §3): the jobs list that replaces /v2/jobs.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = async () => ({});
const sp = (o: Partial<HiringJobsScreenProps> = {}): HiringJobsScreenProps => ({
  state: 'ready',
  jobs: [
    { id: 'j1', title: 'Senior accountant', status: 'open', createdAt: '2026-10-01T09:00:00Z', stageSummary: '2 Interview' },
    { id: 'j2', title: 'Plant supervisor', status: 'pending_approval', createdAt: '2026-10-08T09:00:00Z', stageSummary: 'No candidates yet' },
  ],
  filter: 'all',
  onFilter: vi.fn(),
  canManage: true,
  onOpen: vi.fn(),
  onCreate: vi.fn(ok),
  onDelete: vi.fn(ok),
  departments: [{ value: 'd1', label: 'Finance' }],
  locations: [],
  designations: [],
  managers: [],
  pipelines: [{ value: 'p1', label: 'Standard', isDefault: true }],
  customFields: [{ id: 'cf1', label: 'Cost centre', fieldType: 'text', options: null, required: true }],
  ...o,
});

describe('Hiring jobs (AT1)', () => {
  it('searches, filters with a single choice, opens and deletes after confirming', async () => {
    const p = sp();
    render(<HiringJobsScreen {...p} />);
    await ue.type(screen.getByRole('textbox', { name: 'Search jobs' }), 'plant');
    expect(screen.queryByText('Senior accountant')).not.toBeInTheDocument();
    expect(screen.getByText('Waiting for approval')).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: 'Open' }));
    expect(p.onFilter).toHaveBeenCalledWith('open');
    await ue.click(screen.getByRole('button', { name: 'Open' }));
    expect(p.onOpen).toHaveBeenCalledWith('j2');
    await ue.click(screen.getByRole('button', { name: 'Delete' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(p.onDelete).toHaveBeenCalledWith('j2');
  });

  it('a new job links the department master, takes free-text location without masters, and needs required fields', async () => {
    const p = sp();
    render(<HiringJobsScreen {...p} />);
    await ue.click(screen.getByRole('button', { name: 'New job' }));
    const d = screen.getByRole('dialog');
    await ue.type(within(d).getByRole('textbox', { name: /Job title/ }), 'Accountant');
    await ue.click(within(d).getByRole('combobox', { name: 'Department' }));
    await ue.click(screen.getByRole('option', { name: 'Finance' }));
    await ue.type(within(d).getByRole('textbox', { name: /^Location/ }), 'Madurai');
    await ue.click(within(d).getByRole('button', { name: 'Create' }));
    expect(within(d).getByText('Enter the Cost centre.')).toBeInTheDocument();
    expect(p.onCreate).not.toHaveBeenCalled();
    await ue.type(within(d).getByRole('textbox', { name: /Cost centre/ }), 'CC-12');
    await ue.click(within(d).getByRole('button', { name: 'Create' }));
    expect(p.onCreate).toHaveBeenCalledWith(expect.objectContaining({ title: 'Accountant', departmentId: 'd1', location: 'Madurai', pipelineId: 'p1', customFields: { cf1: 'CC-12' } }));
  });

  it('without the manage right there is no New job and no Delete', () => {
    render(<HiringJobsScreen {...sp({ canManage: false })} />);
    expect(screen.queryByRole('button', { name: 'New job' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });
});
