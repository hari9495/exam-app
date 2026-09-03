'use client';

// Step-list editor for an approval chain (requisition or offer gate). The reducer below is the
// unit-tested piece — kept pure (no side effects, no id generation) so chain-reducer.test.ts can
// exercise it directly. The component is a thin, stateless renderer driven by (steps, dispatch)
// from the parent page, which owns seeding from useApprovalChains and the Save mutation.
import { ChevronUp, ChevronDown, Trash2, Plus } from 'lucide-react';
import { Combobox, type ComboOption } from '../../../../../components/ui-v2/Combobox';
import { TextField } from '../../../../../components/ui-v2/TextField';
import { useTeammates } from '../../../../../lib/hooks/useUserDirectory';

export type ApproverType = 'users' | 'reporting_manager' | 'hiring_manager';

export type EditorStep = {
  name: string;
  approverType: ApproverType;
  approverUserIds: string[];
  managerLevel: number | null;
};

export type ChainAction =
  | { type: 'add' }
  | { type: 'remove'; index: number }
  | { type: 'move'; from: number; to: number }
  | { type: 'edit'; index: number; patch: Partial<EditorStep> };

const blankStep = (): EditorStep => ({ name: '', approverType: 'users', approverUserIds: [], managerLevel: null });

export function chainReducer(steps: EditorStep[], action: ChainAction): EditorStep[] {
  switch (action.type) {
    case 'add':
      return [...steps, blankStep()];
    case 'remove':
      return steps.filter((_, i) => i !== action.index);
    case 'move': {
      if (action.from === action.to || action.from < 0 || action.from >= steps.length || action.to < 0 || action.to >= steps.length) return steps;
      const next = steps.slice();
      const [moved] = next.splice(action.from, 1);
      next.splice(action.to, 0, moved);
      return next;
    }
    case 'edit':
      return steps.map((s, i) => (i === action.index ? { ...s, ...action.patch } : s));
    default:
      return steps;
  }
}

const APPROVER_TYPE_OPTIONS: ComboOption[] = [
  { value: 'users', label: 'Users' },
  { value: 'reporting_manager', label: 'Reporting manager' },
  { value: 'hiring_manager', label: 'Hiring manager' },
];

const MANAGER_LEVEL_OPTIONS: ComboOption[] = [
  { value: '1', label: 'Direct manager' },
  { value: '2', label: 'Skip-level manager' },
];

const muted = 'var(--muted)';
const row: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10, padding: '12px 0', borderBottom: '1px solid var(--hair)' };
const iconBtn: React.CSSProperties = { display: 'inline-grid', placeItems: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid var(--hair)', background: 'var(--paper)', color: 'var(--ink)', cursor: 'pointer' };

export function ChainEditor({ steps, dispatch }: { steps: EditorStep[]; dispatch: (action: ChainAction) => void }) {
  const { data: teammateData } = useTeammates();
  const teammates = (teammateData ?? []).filter((u) => u.status === 'active');

  return (
    <div>
      {steps.length === 0 && <p style={{ fontSize: 13, color: muted, margin: '0 0 8px' }}>No steps yet — add one below.</p>}
      {steps.map((step, index) => (
        <div key={index} style={row}>
          <div style={{ minWidth: 160, flex: '1 1 160px' }}>
            <TextField
              id={`step-name-${index}`}
              label="Step name"
              value={step.name}
              onChange={(v) => dispatch({ type: 'edit', index, patch: { name: v } })}
            />
          </div>

          <div>
            <label className="v2-label">Approver</label>
            <Combobox
              options={APPROVER_TYPE_OPTIONS}
              value={step.approverType}
              onChange={(v) => dispatch({ type: 'edit', index, patch: { approverType: v as ApproverType } })}
              width={180}
            />
          </div>

          {step.approverType === 'users' ? (
            <div style={{ minWidth: 220, flex: '2 1 220px' }}>
              <label className="v2-label">Users</label>
              {teammates.length === 0 ? (
                <p style={{ fontSize: 12.5, color: muted, margin: 0 }}>No teammates found.</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {teammates.map((u) => {
                    const on = step.approverUserIds.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => dispatch({
                          type: 'edit',
                          index,
                          patch: { approverUserIds: on ? step.approverUserIds.filter((id) => id !== u.id) : [...step.approverUserIds, u.id] },
                        })}
                        aria-pressed={on}
                        style={{
                          borderRadius: 99, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
                          border: `1px solid ${on ? 'var(--org-primary)' : 'var(--hair)'}`,
                          background: on ? 'color-mix(in srgb, var(--org-primary) 10%, transparent)' : 'var(--paper)',
                          color: on ? 'var(--org-primary)' : muted,
                        }}
                      >
                        {u.name ?? u.email}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="v2-label">Level</label>
              <Combobox
                options={MANAGER_LEVEL_OPTIONS}
                value={step.managerLevel != null ? String(step.managerLevel) : ''}
                onChange={(v) => dispatch({ type: 'edit', index, patch: { managerLevel: Number(v) } })}
                width={170}
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            <button type="button" style={iconBtn} disabled={index === 0} onClick={() => dispatch({ type: 'move', from: index, to: index - 1 })} aria-label="Move step up">
              <ChevronUp size={15} />
            </button>
            <button type="button" style={iconBtn} disabled={index === steps.length - 1} onClick={() => dispatch({ type: 'move', from: index, to: index + 1 })} aria-label="Move step down">
              <ChevronDown size={15} />
            </button>
            <button type="button" style={{ ...iconBtn, color: 'var(--danger)', borderColor: 'color-mix(in srgb, var(--danger) 35%, var(--hair))' }} onClick={() => dispatch({ type: 'remove', index })} aria-label="Remove step">
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        className="v2-hoverbtn"
        onClick={() => dispatch({ type: 'add' })}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 13, fontWeight: 500, padding: '8px 14px', borderRadius: 9, border: '1px solid var(--org-primary)', background: 'var(--paper)', color: 'var(--org-primary)', cursor: 'pointer' }}
      >
        <Plus size={15} /> Add step
      </button>
    </div>
  );
}
