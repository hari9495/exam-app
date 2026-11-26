import { BadRequestException } from '@nestjs/common';
import { OTHERWISE, POLICY_TYPES, checkBody, checkSteps, declaredFields, pick, toStepSpec } from './approval-policies';
import { MERGE_FIELDS, mergeNotice } from './approval-notices';
import { noticeEvent, SENT_BACK } from './approvals-engine.service';

// E2 parts 4, 5 and 7: the editor's type list, the checks on a saved policy, which rule a request takes, and the notice
// merge. The database checks (limits, ranks, groups, pay keys) are in test/workflow-e2-editor.e2e-spec.ts.
const when = (field: string, operator: string, value: unknown) => ({ id: 'g1', join: 'and', items: [{ id: 'c1', field, operator, value }] });
const HR = { name: 'HR look', approver: 'hr', mode: 'any' };

describe('E2 part 4: the request types the editor covers', () => {
  const mode = (k: string) => POLICY_TYPES.find((t) => t.key === k)?.mode;
  it('pay types are read-only or add-on only (answer 2785); hiring, plans and positions are fully editable', () => {
    for (const k of ['payroll.run', 'payroll.period_reopen', 'payroll.correction', 'payroll.payment_mode', 'payroll.reports_access']) expect(mode(k)).toBe('locked');
    for (const k of ['payroll.one_time', 'payroll.loan', 'exit.resignation', 'exit.company', 'letter.issue']) expect(mode(k)).toBe('addon');
    for (const k of ['ats.requisition', 'ats.offer', 'ats.headcount_plan', 'org.position_change']) expect(mode(k)).toBe('full');
    expect(mode('org.position.change')).toBeUndefined();
  });
  it('arrears and pay revisions are not in the list (review item 5)', () => {
    expect(POLICY_TYPES.some((t) => /arrears|revision|salary/.test(t.key))).toBe(false);
  });
});

describe('E2 part 5: checking a policy', () => {
  it('a rule needs a name, a condition on a declared value and its steps', () => {
    const body = checkBody('ats.requisition', { rules: [{ name: 'Big ask', when: when('openings', 'gt', 3), steps: [HR] }], steps: [{ name: 'Manager', approver: 'hiring_manager', mode: 'any' }] });
    expect(body.rules[0]!.name).toBe('Big ask');
    expect(() => checkBody('ats.requisition', { rules: [{ name: 'X', when: when('openings', 'gt', 3), steps: [HR] }], steps: [HR] })).toThrow(BadRequestException);
    expect(() => checkBody('ats.requisition', { rules: [{ name: 'Big ask', when: when('salary', 'gt', 3), steps: [HR] }], steps: [HR] })).toThrow(/Choose a field/);
    expect(() => checkBody('ats.requisition', { rules: [{ name: 'Big ask', when: { id: 'g', join: 'and', items: [] }, steps: [HR] }], steps: [HR] })).toThrow(/add a condition/);
    // An id is carried but never compared.
    expect(() => checkBody('ats.requisition', { rules: [{ name: 'HM', when: when('hiring_manager_id', 'is', 'x'), steps: [HR] }], steps: [HR] })).toThrow(/Choose a field/);
  });
  it('a type that sends no values has one route only', () => {
    expect(() => checkBody('leave.cancel', { rules: [{ name: 'Any', when: when('days', 'gt', 1), steps: [HR] }], steps: [HR] })).toThrow(/one route/);
  });
  it('approver kinds: their parts, the type they fit, and one-person kinds only with "Any one"', () => {
    expect(() => checkSteps([{ name: 'People', approver: 'users', mode: 'any', userIds: [] }])).toThrow(/1 to 25 people/);
    expect(() => checkSteps([{ name: 'Holders', approver: 'key_holders', mode: 'any', key: 'payroll.run.approve', scope: 'country' }])).toThrow(/legal entity, department or location/);
    expect(() => checkSteps([{ name: 'Up', approver: 'chain_limit', mode: 'any' }], 'leave.request')).toThrow(/no amount/);
    expect(() => checkSteps([{ name: 'Up', approver: 'chain_limit', mode: 'any' }], 'ats.requisition')).toThrow(/no amount/);
    expect(checkSteps([{ name: 'Up', approver: 'chain_limit', mode: 'any' }], 'expense.claim')[0]).toMatchObject({ family: 'expense' });
    expect(() => checkSteps([{ name: 'HM', approver: 'hiring_manager', mode: 'any' }], 'leave.request')).toThrow(/hiring manager/);
    expect(() => checkSteps([{ name: 'Boss', approver: 'manager', mode: 'all' }])).toThrow(/Any one/);
    expect(() => checkSteps([{ name: 'Two', approver: 'hr', mode: 'count', count: 0 }])).toThrow(/how many/);
  });
  it('self-approval is never kept (review item 3)', () => {
    const [s] = checkSteps([{ ...HR, selfApproval: 'allowed' }]);
    expect(toStepSpec(s!, 24, 48).selfApproval).toBe('never');
  });
  it('the first matching rule wins; otherwise the default route', () => {
    const body = checkBody('ats.offer', {
      rules: [
        { name: 'Above range', when: when('above_range', 'is', 'yes'), steps: [HR] },
        { name: 'Big pay', when: when('amount', 'gt', 2_000_000), steps: [{ name: 'CEO', approver: 'manager_2', mode: 'any' }] },
      ],
      steps: [{ name: 'Hiring manager', approver: 'hiring_manager', mode: 'any' }],
    });
    const f = declaredFields('ats.offer');
    expect(pick(body, { above_range: 'yes', amount: 3_000_000 }, f).name).toBe('Above range');
    expect(pick(body, { above_range: 'no', amount: 3_000_000 }, f).name).toBe('Big pay');
    expect(pick(body, { above_range: 'no', amount: 100 }, f).name).toBe(OTHERWISE);
    expect(pick(body, {}, f).name).toBe(OTHERWISE);
  });
});

describe('E2 part 7: notices', () => {
  it('fills only title, requester, step and link', () => {
    expect(MERGE_FIELDS).toEqual(['title', 'requester', 'step', 'link']);
    expect(mergeNotice('{requester} asks: {title} ({step}) {link} {summary}', { title: 'Requisition: QA', requester: 'Priya', step: 'Finance', link: 'https://x/y' })).toBe('Priya asks: Requisition: QA (Finance) https://x/y {summary}');
  });
  it('knows which event a notice is', () => {
    expect(noticeEvent({ type: 'workflow.approval.needed', text: 'Finance' })).toBe('requested');
    expect(noticeEvent({ type: 'workflow.approval.needed', text: 'Escalated to you: Finance' })).toBe('escalated');
    expect(noticeEvent({ type: 'workflow.approval.reminder', text: 'Finance' })).toBe('reminder');
    expect(noticeEvent({ type: 'workflow.approval.decided', text: 'Approved', toRequester: 'u' })).toBe('approved');
    expect(noticeEvent({ type: 'workflow.approval.decided', text: SENT_BACK, toRequester: 'u' })).toBe('sent_back');
    expect(noticeEvent({ type: 'workflow.approval.decided', text: 'Not approved', toRequester: 'u' })).toBe('turned_down');
    expect(noticeEvent({ type: 'workflow.approval.no_approver', text: 'x' })).toBeNull();
  });
});
