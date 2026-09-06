// Focused render + interaction test for the group-approver picker added to ChainEditor. Avoids
// rendering page.tsx directly: page.tsx pulls Cb from DataTable.tsx, which imports
// @tanstack/react-table at module scope -- a known jest/ESM friction point on this repo. ChainEditor
// itself has no such import, so we drive it here via a thin state-owning harness (mirrors how
// page.tsx's GateCard actually wires steps/dispatch).
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import * as useUserDirectoryHooks from '../../../../../lib/hooks/useUserDirectory';
import * as useUserGroupsHooks from '../../../../../lib/hooks/useUserGroups';
import { ChainEditor, chainReducer, type EditorStep, type ChainAction } from './ChainEditor';

jest.mock('../../../../../lib/hooks/useUserDirectory');
jest.mock('../../../../../lib/hooks/useUserGroups');

const mockedUseTeammates = useUserDirectoryHooks.useTeammates as jest.Mock;
const mockedUseUserGroupDirectory = useUserGroupsHooks.useUserGroupDirectory as jest.Mock;

const GROUPS = [
  { id: 'g1', name: 'Interviewers', memberIds: ['u1'] },
  { id: 'g2', name: 'Panel B', memberIds: [] },
];

function Harness({ initial }: { initial: EditorStep[] }) {
  const [steps, setSteps] = useState(initial);
  const dispatch = (action: ChainAction) => setSteps((s) => chainReducer(s, action));
  return <ChainEditor steps={steps} dispatch={dispatch} />;
}

describe('ChainEditor group approver', () => {
  beforeEach(() => {
    mockedUseTeammates.mockReturnValue({ data: [] });
    mockedUseUserGroupDirectory.mockReturnValue({ data: GROUPS });
  });

  it('selecting approverType=group reveals the group picker fed by useUserGroupDirectory', () => {
    const step: EditorStep = { name: 'Legal', approverType: 'users', approverUserIds: [], managerLevel: null };
    render(<Harness initial={[step]} />);

    expect(screen.queryByText('Select')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Users' })); // opens the approver-type combobox
    fireEvent.click(screen.getByText('Group')); // picks 'group'

    // The group combobox now renders, unselected (placeholder 'Select').
    expect(screen.getByText('Select')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Select'));
    expect(screen.getByText('Interviewers')).toBeInTheDocument();
    expect(screen.getByText('Panel B')).toBeInTheDocument();
  });

  it('picking a group in the picker updates that step, ready for page.tsx to forward as groupId on save', () => {
    const step: EditorStep = { name: 'Legal', approverType: 'group', approverUserIds: [], managerLevel: null, groupId: undefined };
    render(<Harness initial={[step]} />);

    fireEvent.click(screen.getByText('Select'));
    fireEvent.click(screen.getByText('Interviewers'));

    // Dropdown closes and the combobox now shows the picked group as its current value.
    expect(screen.getByText('Interviewers')).toBeInTheDocument();
    expect(screen.queryByText('Select')).not.toBeInTheDocument();
  });

  it('an existing (seeded) group step renders its selected group without any interaction', () => {
    const step: EditorStep = { name: 'Legal', approverType: 'group', approverUserIds: [], managerLevel: null, groupId: 'g2' };
    render(<Harness initial={[step]} />);

    expect(screen.getByText('Panel B')).toBeInTheDocument();
  });

  it('does not render the group picker for non-group approver types', () => {
    const step: EditorStep = { name: 'A', approverType: 'users', approverUserIds: [], managerLevel: null };
    render(<Harness initial={[step]} />);
    expect(screen.queryByText('Interviewers')).not.toBeInTheDocument();
    expect(screen.queryByText('Panel B')).not.toBeInTheDocument();
  });
});

describe('chainReducer group support', () => {
  it('carries groupId through an edit patch, unaffected by other fields', () => {
    const step: EditorStep = { name: 'Legal', approverType: 'group', approverUserIds: [], managerLevel: null, groupId: undefined };
    const edited = chainReducer([step], { type: 'edit', index: 0, patch: { groupId: 'g1' } });
    expect(edited[0]).toEqual({ name: 'Legal', approverType: 'group', approverUserIds: [], managerLevel: null, groupId: 'g1' });
  });
});
