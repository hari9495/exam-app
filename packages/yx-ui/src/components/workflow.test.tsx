import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrgChart, buildOrgTree, type OrgPerson } from './orgchart';
import { KanbanBoard, moveCard, type KanbanColumn } from './kanban';
import { SetupChecklist, Stepper, checklistProgress, type ChecklistSection } from './stepper';
import { DocumentViewer, documentKind, esignSummary } from './document';

/* ---------- Org chart ---------- */

const PEOPLE: OrgPerson[] = [
  { id: 'ceo', name: 'Anita Rao', role: 'CEO', department: 'Leadership' },
  { id: 'cfo', name: 'Suresh Pillai', role: 'CFO', department: 'Finance', managerId: 'ceo' },
  { id: 'coo', name: 'Arjun Kulkarni', role: 'COO', department: 'Operations', managerId: 'ceo' },
  { id: 'fc', name: 'Lakshmi Venkatesan', role: 'Controller', department: 'Finance', managerId: 'cfo' },
  { id: 'acc', name: 'Meera Krishnan', role: 'Accountant', department: 'Finance', managerId: 'fc' },
  { id: 'vac', name: '', role: 'Senior Accountant', department: 'Finance', managerId: 'fc', vacant: true },
  { id: 'scm', name: 'Rahul Menon', role: 'Supply Chain', department: 'Finance', managerId: 'coo', dottedManagerId: 'cfo' },
];
const item = (name: RegExp) => screen.getByRole('treeitem', { name });

describe('OrgChart', () => {
  it('builds views: vacancies only in Position, departments group people, team size counts people', () => {
    const rep = buildOrgTree(PEOPLE, 'reporting');
    expect(rep).toHaveLength(1);
    expect(rep[0].size).toBe(5); // vacancy not counted
    const pos = buildOrgTree(PEOPLE, 'position');
    expect(JSON.stringify(pos)).toContain('Vacant · Senior Accountant');
    expect(JSON.stringify(rep)).not.toContain('Vacant');
    const dept = buildOrgTree(PEOPLE, 'department');
    expect(dept.map((d) => d.title)).toEqual(['Leadership', 'Finance', 'Operations']);
    // Rahul (Finance) reports to the COO (Operations), so he tops the Finance department alongside the CFO
    expect(dept[1].children.map((c) => c.title)).toEqual(['Suresh Pillai', 'Rahul Menon']);
  });

  it('moves with arrow keys: down to first child, right to sibling, up to parent; Enter opens', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<OrgChart people={PEOPLE} layout="tree" onOpenPerson={onOpen} />);
    item(/^Anita Rao/).focus();
    await user.keyboard('{ArrowDown}');
    expect(item(/^Suresh Pillai/)).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(item(/^Arjun Kulkarni/)).toHaveFocus();
    await user.keyboard('{ArrowLeft}{ArrowDown}'); // Lakshmi is collapsed by default: Down expands and moves in
    expect(item(/^Lakshmi Venkatesan/)).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(item(/^Meera Krishnan/)).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(item(/^Suresh Pillai/)).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'cfo' }));
  });

  it('search jumps to a person: expands collapsed ancestors and highlights them', async () => {
    const user = userEvent.setup();
    render(<OrgChart people={PEOPLE} layout="tree" defaultExpanded={[]} />);
    expect(screen.queryByRole('treeitem', { name: /^Meera Krishnan/ })).toBeNull();
    await user.type(screen.getByRole('searchbox', { name: 'Find a person' }), 'meera');
    await user.click(within(screen.getByRole('list', { name: 'Matching people' })).getByRole('button', { name: /Meera Krishnan/ }));
    const meera = item(/^Meera Krishnan/);
    expect(meera).toHaveFocus();
    expect(meera).toHaveAttribute('aria-selected', 'true');
    for (const n of [/^Anita Rao/, /^Suresh Pillai/, /^Lakshmi Venkatesan/]) expect(item(n)).toHaveAttribute('aria-expanded', 'true');
  });

  it('list layout drills down and back', async () => {
    const user = userEvent.setup();
    render(<OrgChart people={PEOPLE} layout="list" rootLabel="Suryodaya Foods" />);
    await user.click(screen.getByRole('button', { name: /Anita Rao/ }));
    expect(screen.getByRole('heading', { name: 'Direct reports (2)' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Suresh Pillai/ }));
    expect(screen.getByRole('heading', { name: 'Direct reports (1)' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Direct reports (2)' })).toBeInTheDocument();
  });
});

/* ---------- Kanban ---------- */

const COLS: KanbanColumn[] = [
  { id: 'applied', title: 'Applied', slaDays: 3, cards: [{ id: 'c1', name: 'Priya Sharma', facts: ['6 yrs', 'Pune'], daysInStage: 5 }] },
  { id: 'interview', title: 'Interview', cards: [] },
  { id: 'rejected', title: 'Rejected', requiresReason: true, cards: [] },
];
const col = (title: string) => screen.getByRole('region', { name: title });

describe('KanbanBoard', () => {
  it('moveCard reorders within a column and moves across', () => {
    const cols: KanbanColumn[] = [{ id: 'a', title: 'A', cards: ['1', '2', '3'].map((id) => ({ id, name: id, facts: ['x'], daysInStage: 0 })) }, { id: 'b', title: 'B', cards: [] }];
    expect(moveCard(cols, '1', 'a', 3)[0].cards.map((c) => c.id)).toEqual(['2', '3', '1']);
    expect(moveCard(cols, '2', 'b').map((c) => c.cards.length)).toEqual([2, 1]);
  });

  it('flags cards past the SLA in text, and moves via the "Move to" menu', async () => {
    const onMove = vi.fn();
    const user = userEvent.setup();
    render(<KanbanBoard aria-label="Hiring" defaultColumns={COLS} onMove={onMove} noun="candidate" />);
    expect(screen.getByText(/5 days in stage · over 3 days target/)).toBeInTheDocument();
    expect(within(col('Interview')).getByText('No candidates in this stage')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Move Priya Sharma' }));
    await user.click(screen.getByRole('menuitem', { name: 'Interview' }));
    expect(onMove).toHaveBeenCalledWith('c1', 'applied', 'interview', undefined);
    expect(within(col('Interview')).getByText('Priya Sharma')).toBeInTheDocument();
    expect(screen.getByText('Moved Priya Sharma to Interview')).toBeInTheDocument();
  });

  it('moving to Rejected requires a reason', async () => {
    const onMove = vi.fn();
    const user = userEvent.setup();
    render(<KanbanBoard aria-label="Hiring" defaultColumns={COLS} onMove={onMove} />);
    await user.click(screen.getByRole('button', { name: 'Move Priya Sharma' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rejected' }));
    const dialog = await screen.findByRole('form', { name: 'Move Priya Sharma to Rejected?' });
    await user.click(within(dialog).getByRole('button', { name: 'Move to Rejected' }));
    expect(onMove).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/Enter a reason/)).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Salary expectation too high');
    await user.click(within(dialog).getByRole('button', { name: 'Move to Rejected' }));
    expect(onMove).toHaveBeenCalledWith('c1', 'applied', 'rejected', 'Salary expectation too high');
    expect(within(col('Rejected')).getByText('Priya Sharma')).toBeInTheDocument();
  });

  it('collapses a column', async () => {
    const user = userEvent.setup();
    render(<KanbanBoard aria-label="Hiring" defaultColumns={COLS} />);
    await user.click(screen.getByRole('button', { name: 'Collapse Applied' }));
    expect(within(col('Applied')).queryByText('Priya Sharma')).toBeNull();
    expect(screen.getByRole('button', { name: 'Expand Applied' })).toHaveAttribute('aria-expanded', 'false');
  });
});

/* ---------- Stepper ---------- */

function Wizard(props: { onContinue?: (id: string) => boolean | void }) {
  return (
    <Stepper
      title="Add employee"
      finishLabel="Add employee"
      review={{}}
      onContinue={props.onContinue}
      steps={[
        { id: 'personal', title: 'Personal details', content: <label>Full name<input /></label>, summary: 'Meera Krishnan' },
        { id: 'bank', title: 'Bank details', content: <label>IFSC<input /></label>, summary: 'HDFC0001234' },
      ]}
    />
  );
}
const current = () => screen.getByRole('button', { current: 'step' });

describe('Stepper', () => {
  it('Back keeps typed data', async () => {
    const user = userEvent.setup();
    render(<Wizard />);
    await user.type(screen.getByRole('textbox', { name: 'Full name' }), 'Meera Krishnan');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(current()).toHaveTextContent('Bank details');
    expect(screen.getByRole('heading', { name: 'Bank details' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('textbox', { name: 'Full name' })).toHaveValue('Meera Krishnan');
  });

  it('stays when validation fails; review Edit links jump back', async () => {
    const user = userEvent.setup();
    let ok = false;
    render(<Wizard onContinue={() => ok} />);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(current()).toHaveTextContent('Personal details');
    ok = true;
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(current()).toHaveTextContent('Review');
    expect(screen.getByRole('region', { name: 'Bank details' })).toHaveTextContent('HDFC0001234');
    await user.click(screen.getByRole('button', { name: 'Edit Personal details' }));
    expect(current()).toHaveTextContent('Personal details');
    // steps already visited stay reachable from the step list
    expect(screen.getByRole('button', { name: /Review/ })).toBeEnabled();
  });
});

/* ---------- Setup checklist ---------- */

const SECTIONS: ChecklistSection[] = [
  {
    id: 'a',
    title: 'Company',
    tasks: [
      { id: '1', title: 'Add company details', status: 'done' },
      { id: '2', title: 'Upload your logo', status: 'todo', optional: true },
      { id: '3', title: 'Add work locations', status: 'in-progress' },
    ],
  },
  { id: 'b', title: 'People', tasks: [{ id: '4', title: 'Invite employees', status: 'blocked', blockedReason: 'Import employees first' }] },
];

describe('SetupChecklist', () => {
  it('counts required tasks only and collapses done tasks', async () => {
    expect(checklistProgress(SECTIONS)).toEqual({ done: 1, total: 3 });
    const onStart = vi.fn();
    const onSkip = vi.fn();
    const user = userEvent.setup();
    render(<SetupChecklist sections={SECTIONS} onStart={onStart} onSkip={onSkip} />);
    expect(screen.getByRole('meter', { name: 'Setup progress' })).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByRole('meter', { name: 'Setup progress' })).toHaveAttribute('aria-valuemax', '3');
    expect(screen.queryByText('Add company details')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show done tasks (1)' }));
    expect(screen.getByText('Add company details')).toBeInTheDocument();
    expect(screen.getByText(/Blocked · Import employees first/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue Add work locations' }));
    expect(onStart).toHaveBeenCalledWith('3');
    await user.click(screen.getByRole('button', { name: 'Skip Upload your logo for now' }));
    expect(onSkip).toHaveBeenCalledWith('2');
  });
});

/* ---------- Document viewer ---------- */

describe('DocumentViewer', () => {
  it('detects type, summarises e-sign and switches versions', async () => {
    expect(documentKind('scan.JPG')).toBe('image');
    expect(documentKind('offer.pdf')).toBe('pdf');
    expect(documentKind('form.docx')).toBe('other');
    expect(esignSummary('signed', [{ name: 'A', status: 'signed', at: new Date(2026, 8, 28) }]).text).toBe('Signed on 28 Sep 2026');
    expect(esignSummary('waiting', [{ name: 'Meera Krishnan', status: 'waiting' }]).text).toBe('Waiting for Meera Krishnan');
    const user = userEvent.setup();
    const at = new Date(2026, 8, 28, 16, 5);
    render(
      <DocumentViewer
        fileName="letter.png"
        versions={[
          { id: 'v2', label: 'Version 2', url: 'data:image/png;base64,a', uploadedBy: 'Sana Nizami', uploadedAt: at, size: 2048 },
          { id: 'v1', label: 'Version 1', url: 'data:image/png;base64,b', uploadedBy: 'Imran Qureshi', uploadedAt: at, size: 1024 },
        ]}
      />,
    );
    expect(screen.getByRole('img', { name: 'letter.png, Version 2' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Version 1/ }));
    expect(screen.getByRole('img', { name: 'letter.png, Version 1' })).toBeInTheDocument();
    expect(screen.getByText('Imran Qureshi')).toBeInTheDocument();
  });

  it('shows the unsupported state with a download button', () => {
    render(<DocumentViewer fileName="form.docx" versions={[{ id: 'v', label: 'Version 1', url: '#', uploadedBy: 'Sana Nizami', uploadedAt: new Date(2026, 8, 28), size: 1 }]} />);
    expect(screen.getByText("We can't preview .docx files here.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
  });
});
