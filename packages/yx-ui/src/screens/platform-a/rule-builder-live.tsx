// PLT-32 Rule builder, live (E2 part 5): one approval rule of a request type. Its name, the condition on the type's values
// (the P19 ConditionBuilder, "if" part only), and its own steps. Done hands the rule back to the policy editor (PLT-12),
// which saves the whole policy as a new version.
import { useState } from 'react';
import { Scale } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { Card, ObjectHeader } from '../../components/shell';
import { FormField, useTooEarly } from '../../components/field';
import { TextField } from '../../components/inputs';
import { ConditionBuilder } from '../../components/condition';
import { InlineAlert } from '../../components/feedback';
import { emptyGroup, summariseConditions, validateConditions, type Rule, type RuleField } from '../../lib/rules';
import { fromServerGroup, toServerGroup } from '../../lib/forms';
import { Workspace } from './platform-kit';
import { StepDrawer, StepTiles, type StepChoices } from './approval-steps';
import type { PolicyApprover, PolicyRuleInput, PolicyStepInput } from './approval-rules-types';

export interface LiveRuleBuilder {
  /** The request type's name ("Requisition"). */
  typeLabel: string;
  /** The rule being changed; null for a new one. */
  rule: PolicyRuleInput | null;
  /** Its place in the list (1 is checked first). */
  position: number;
  fields: RuleField[];
  kinds: PolicyApprover[];
  choices: StepChoices;
  canEdit: boolean;
  onDone: (rule: PolicyRuleInput) => void;
  onCancel: () => void;
}

export function LiveRuleBuilderScreen({ live }: { live: LiveRuleBuilder }) {
  const [name, setName] = useState(live.rule?.name ?? '');
  const [rule, setRule] = useState<Rule>({ trigger: null, conditions: live.rule ? fromServerGroup(live.rule.when, live.fields) : { ...emptyGroup() }, actions: [] });
  const [steps, setSteps] = useState<PolicyStepInput[]>(live.rule?.steps ?? []);
  const [editing, setEditing] = useState<number | null | undefined>(undefined);
  const [showErrors, setShowErrors] = useState(false);
  const conditionErrors = validateConditions(rule.conditions, live.fields);
  const early = useTooEarly(
    [
      (name.trim().length < 2 || name.trim().length > 60 || /[<>]/.test(name)) && { fieldId: 'rb-name', message: 'Give the rule a name of 2 to 60 characters, without < or >.' },
      !rule.conditions.items.length && { fieldId: 'rb-when', message: 'Add a condition. Requests that match no rule take the "otherwise" steps.' },
      !steps.length && { fieldId: 'rb-steps', message: 'Add at least one step.' },
    ].filter(Boolean) as { fieldId: string; message: string }[],
  );
  const done = () => {
    setShowErrors(true);
    if (early.stop() || Object.keys(conditionErrors).length) return;
    live.onDone({ name: name.trim(), when: toServerGroup(rule.conditions), steps });
  };
  const words = rule.conditions.items.length ? summariseConditions(rule.conditions, live.fields) : '';
  return (
    <div className="yx-plt-stack">
      <ObjectHeader
        name={live.rule ? live.rule.name : 'New rule'}
        icon={Scale}
        secondary={`${live.typeLabel} approvals · rule ${live.position} · checked in order, the first matching rule wins`}
        status={<Badge tone="info">Not saved yet</Badge>}
        actions={
          <>
            <Button onClick={live.onCancel}>{live.canEdit ? 'Cancel' : 'Back'}</Button>
            {live.canEdit && (
              <Button variant="primary" onClick={done}>
                Done
              </Button>
            )}
          </>
        }
      />
      <InlineAlert tone="info" title="Save the policy to use this rule">
        Done brings you back to the policy. Changes apply to new requests only after you save it as a new version.
      </InlineAlert>
      <Workspace
        asideLabel="Rule"
        aside={
          <>
            <h2 className="yx-plt-h">Rule</h2>
            <FormField id="rb-name" label="Rule name" required error={early.errorOf('rb-name')}>
              <TextField value={name} onChange={setName} maxLength={60} readOnly={!live.canEdit} placeholder="For example, Many openings" />
            </FormField>
            <p className="yx-plt-muted">{words ? `In plain words: when ${words}.` : 'Add a condition to see it in plain words.'}</p>
          </>
        }
      >
        <Card title="When">
          <FormField id="rb-when" label="Condition" hideLabel error={early.errorOf('rb-when')}>
            <ConditionBuilder schema={{ triggers: [], fields: live.fields, recipients: [] }} value={rule} onChange={setRule} parts={['if']} showSummary={false} showErrors={showErrors} readOnly={!live.canEdit} />
          </FormField>
        </Card>
        <Card title="Then these steps">
          <FormField id="rb-steps" label="Steps" hideLabel error={early.errorOf('rb-steps')}>
            <StepTiles steps={steps} choices={live.choices} canEdit={live.canEdit} onChange={setSteps} onEdit={setEditing} label="Rule" />
          </FormField>
        </Card>
      </Workspace>
      {editing !== undefined && (
        <StepDrawer
          open
          step={editing === null ? null : steps[editing]!}
          kinds={live.kinds}
          choices={live.choices}
          onClose={() => setEditing(undefined)}
          onDone={(s) => {
            setSteps((xs) => (editing === null ? [...xs, s] : xs.map((x, k) => (k === editing ? s : x))));
            setEditing(undefined);
          }}
        />
      )}
    </div>
  );
}
