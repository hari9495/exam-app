import '../components/kanban.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { KanbanBoard, type KanbanColumn } from '../components/kanban';
import { formatINR } from '../lib/format';

const meta: Meta = { title: 'Workflow/Kanban', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;

const lpa = (n: number) => `${formatINR(n)} expected`;

const HIRING: KanbanColumn[] = [
  {
    id: 'applied',
    title: 'Applied',
    slaDays: 3,
    addable: true,
    cards: [
      { id: 'c1', name: 'Priya Sharma', facts: ['6 yrs · Brightline Advisory', lpa(1400000)], daysInStage: 1 },
      { id: 'c2', name: 'Rahul Menon', facts: ['4 yrs · Meru Software BPM', lpa(950000)], daysInStage: 5 },
      { id: 'c3', name: 'Farah Siddiqui', facts: ['CA, 3 yrs · Ledgerwise LLP', lpa(1200000)], daysInStage: 2 },
    ],
  },
  {
    id: 'screen',
    title: 'Phone screen',
    slaDays: 5,
    cards: [
      { id: 'c4', name: 'Karthik Subramanian', facts: ['7 yrs · Kaveri Auto Steel', lpa(1650000)], daysInStage: 9 },
      { id: 'c5', name: 'Nandini Iyer', facts: ['5 yrs · Sahyadri Tech', lpa(1300000)], daysInStage: 3 },
    ],
  },
  {
    id: 'interview',
    title: 'Interview',
    wipLimit: 3,
    slaDays: 7,
    cards: [
      { id: 'c6', name: 'Arjun Kulkarni', facts: ['8 yrs · Deccan Motors', lpa(1800000)], daysInStage: 4 },
      { id: 'c7', name: 'Sneha Reddy', facts: ['6 yrs · HUL', lpa(1500000)], daysInStage: 12 },
      { id: 'c8', name: 'Imran Qureshi', facts: ['5 yrs · Axis Bank', lpa(1350000)], daysInStage: 2 },
      { id: 'c9', name: 'Venkata Subrahmanya Lakshminarayana', facts: ['9 yrs · Larsen & Toubro Infotech, Chennai', lpa(2100000)], daysInStage: 1 },
    ],
  },
  { id: 'offer', title: 'Offer', slaDays: 5, cards: [], emptyText: 'No offers out. Move a candidate here after the final interview.' },
  { id: 'hired', title: 'Hired', cards: [{ id: 'c10', name: 'Divya Raghunathan', facts: ['Joins 05 Oct 2026', formatINR(1450000)], daysInStage: 6 }] },
  { id: 'rejected', title: 'Rejected', requiresReason: true, cards: [{ id: 'c11', name: 'Rohit Bhat', facts: ['2 yrs · Freelance', lpa(800000)], daysInStage: 14 }] },
];

const board = (extra: Partial<Parameters<typeof KanbanBoard>[0]> = {}) => (
  <KanbanBoard
    aria-label="Hiring pipeline, Senior Accountant"
    defaultColumns={HIRING}
    noun="candidate"
    addCardLabel="Add candidate"
    onAddCard={() => {}}
    onOpenCard={() => {}}
    {...extra}
  />
);

export const HiringPipeline: S = { name: 'Hiring pipeline with SLA warnings', render: () => board() };
export const MoveMenuOpen: S = { name: 'Move menu open', render: () => board({ defaultMoveMenuFor: 'c4' }) };
export const RejectReasonOpen: S = { name: 'Reject reason open', render: () => board({ defaultReasonFor: { cardId: 'c2', to: 'rejected' } }) };
export const Collapsed: S = { name: 'Collapsed columns', render: () => board({ defaultCollapsed: ['hired', 'rejected'] }) };
export const EmptyColumn: S = {
  name: 'Empty columns',
  render: () => board({ defaultColumns: HIRING.map((c) => (c.id === 'applied' || c.id === 'offer' ? c : { ...c, cards: [] })) }),
};
export const CardFocus: S = { name: 'Card name focus', parameters: { pseudo: { focusVisible: ['.yx-kanban__name'] } }, render: () => board() };
export const Mobile: S = {
  name: 'Hiring pipeline, mobile',
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  render: () => board(),
};

const HELPDESK: KanbanColumn[] = [
  {
    id: 'new',
    title: 'New',
    slaDays: 1,
    addable: true,
    cards: [
      { id: 't1', name: 'Anita Rao', facts: ['HD-2041 · Payslip shows wrong LOP', 'Payroll'], daysInStage: 2 },
      { id: 't2', name: 'Suresh Pillai', facts: ['HD-2042 · Form 16 not downloadable', 'Tax'], daysInStage: 0 },
    ],
  },
  {
    id: 'progress',
    title: 'In progress',
    wipLimit: 4,
    slaDays: 3,
    cards: [
      { id: 't3', name: 'Meera Krishnan', facts: ['HD-2033 · Update bank account', 'Payroll'], daysInStage: 1 },
      { id: 't4', name: 'Harpreet Singh', facts: ['HD-2029 · Leave balance mismatch', 'Leave'], daysInStage: 4 },
    ],
  },
  { id: 'waiting', title: 'Waiting on employee', cards: [{ id: 't5', name: 'Lakshmi Venkatesan', facts: ['HD-2018 · Upload rent receipts', 'Tax'], daysInStage: 6 }] },
  { id: 'resolved', title: 'Resolved', cards: [] },
  { id: 'closed', title: "Won't fix", requiresReason: true, cards: [] },
];
export const Helpdesk: S = {
  name: 'Helpdesk board',
  render: () => <KanbanBoard aria-label="HR helpdesk" defaultColumns={HELPDESK} noun="ticket" addCardLabel="Add ticket" onAddCard={() => {}} onOpenCard={() => {}} />,
};
