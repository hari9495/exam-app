import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { LinksFrame, type StoryLink } from '../_kit/story-frame';
import { play, press, pressFirst } from '../_kit/story-play';
import { ItBudgetsScreen, type ItBudgetsScreenProps } from './it-budgets';
import { IT_BUDGETS } from './data';

// Helpdesk › IT budgets (GLPI 7, answer 2719): each department's yearly IT budget with what IT desks spent (time at the
// team's hourly rate, fixed and material costs on tickets) and what is left, as /yx/desk/it-budgets renders it.
const meta: Meta = { title: 'Screens/Helpdesk/IT budgets', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const LINKS: StoryLink[] = [
  { id: 'desk-tickets', label: 'Tickets', href: '#tickets', group: 'Service desk' },
  { id: 'desk-setup', label: 'Desk set-up', href: '#setup', group: 'Service desk' },
  { id: 'desk-it-budgets', label: 'IT budgets', href: '#it-budgets', group: 'Service desk' },
];
function Screen(p: Partial<ItBudgetsScreenProps>) {
  const [year, setYear] = useState(2026);
  return (
    <LinksFrame active="desk-it-budgets" links={LINKS}>
      <ItBudgetsScreen state="ready" data={year === 2026 ? IT_BUDGETS : { ...IT_BUDGETS, year, rows: [], noDepartment: null }} year={year} thisYear={2026} onYear={setYear} onSet={async () => undefined} {...p} />
    </LinksFrame>
  );
}

export const Budgets: S = { name: 'IT budgets · spent and left, one over budget', render: () => <Screen /> };
export const SetBudget: S = { name: 'IT budgets · set a budget for a department', render: () => <Screen />, play: play(press('Set a budget')) };
export const SetBudgetTooEarly: S = { name: 'IT budgets · Save pressed with nothing filled', render: () => <Screen />, play: play(press('Set a budget'), press('Save budget')) };
export const ChangeBudget: S = { name: 'IT budgets · change a department budget', render: () => <Screen />, play: play(pressFirst('Change')) };
export const NextYearEmpty: S = { name: 'IT budgets · next year, nothing yet', render: () => <Screen year={2027} data={{ ...IT_BUDGETS, year: 2027, rows: [], noDepartment: null }} /> };
export const Loading: S = { render: () => <Screen state="loading" data={null} /> };
export const NoAccess: S = { name: 'No access (no IT budget key)', render: () => <Screen state="no-access" data={null} /> };
export const LoadFailed: S = { name: 'Could not load', render: () => <Screen state="error" data={null} onRetry={() => undefined} /> };
