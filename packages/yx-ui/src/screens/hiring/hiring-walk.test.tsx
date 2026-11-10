import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { CandidateListScreen } from './hiring-candidates';
import { BiasAuditScreen } from './hiring-offers';
import { sourceText } from './hiring-pipeline';
import { JobsScreen } from './hiring-plan';
import { JOBS } from './hiring-data';
import { SettingsPageScreen } from '../settings/settings-screens';
import { SETTINGS_GROUPS } from '../settings/settings-groups';

// Hiring walk (answer 476): a page opened by someone the API refuses says "no access", never a load error or an empty
// list (candidates, bias audits, Settings › Hiring).
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('no-access states found on the Hiring walk', () => {
  it('Candidates: no table, no actions, the no-access message', () => {
    show(<CandidateListScreen rows={[]} duplicates={[]} state="no-access" />);
    expect(screen.getByText("You don't have access to candidates")).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add candidate' })).not.toBeInTheDocument();
  });

  it('Candidates live: the API refusal shows the same message', () => {
    show(<CandidateListScreen rows={[]} duplicates={[]} live={{ state: 'no-access', onRetry: vi.fn(), total: 0, page: 1, pageSize: 25, onPage: vi.fn(), search: '', onSearch: vi.fn(), status: 'active', onStatus: vi.fn(), stage: null, onStage: vi.fn(), tab: 'candidates', onTab: vi.fn() } as never} />);
    expect(screen.getByText("You don't have access to candidates")).toBeInTheDocument();
  });

  it('Bias audits: no-access, not "could not be loaded"', () => {
    show(<BiasAuditScreen feature="x" nycOn lastAudit={null} auditor={null} summaryUrl={null} sex={[]} race={[]} today={new Date()} live={{ state: 'no-access', onRetry: vi.fn(), canEdit: false, lawName: '', categories: { sex: [], race: [] }, validUntil: null, onRecord: vi.fn() }} />);
    expect(screen.getByText("You don't have access to bias audits")).toBeInTheDocument();
    expect(screen.queryByText('Bias audits could not be loaded.')).not.toBeInTheDocument();
  });

  it('Settings › Hiring: no-access, no "View only" badge and no form', () => {
    show(<SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.1" readOnly state="no-access" />);
    expect(screen.getByText("You don't have access to Hiring settings")).toBeInTheDocument();
    expect(screen.queryByText('View only')).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn't load/)).not.toBeInTheDocument();
  });
});

describe('wording and totals found on the Hiring walk', () => {
  it('a candidate source shows in words, never the code', () => {
    expect(sourceText('manual')).toBe('Added by the team');
    expect(sourceText('application')).toBe('Careers site');
    expect(sourceText('referral')).toBe('Referral');
    expect(sourceText(null)).toBe('Added by the team');
    expect(sourceText('something-new')).toBe('something-new');
  });

  it('the jobs list totals name jobs and add up both counts, on one line', () => {
    const rows = JOBS.slice(0, 3);
    show(<JobsScreen rows={rows} />);
    const foot = document.querySelector('tfoot')!;
    expect(foot.textContent).toContain('Total · 3 jobs');
    const tds = [...foot.querySelectorAll('td')];
    expect((tds[0] as HTMLElement).style.whiteSpace).toBe('nowrap');
    expect(foot.textContent).toContain(String(rows.reduce((s, r) => s + r.inPipeline, 0)));
  });
});
