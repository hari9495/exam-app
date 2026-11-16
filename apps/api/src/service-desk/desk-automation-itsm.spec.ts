import { DeskAutomation } from './desk-automation';

// Helpdesk ITSM-4: change and problem moments reach the desk's own rules as triggers on the change or problem ticket.
describe('desk automation: ITSM triggers', () => {
  const desk = new DeskAutomation(null as never, null as never, null as never, null as never, null as never);
  const ticketId = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

  it('maps each ITSM event to its trigger and lists it for rules', () => {
    expect(desk.fromEvent('helpdesk.change.scheduled', { ticketId })).toEqual({ recordId: ticketId, trigger: 'change_scheduled' });
    expect(desk.fromEvent('helpdesk.change.finished', { ticketId, outcome: 'done' })).toEqual({ recordId: ticketId, trigger: 'change_finished' });
    expect(desk.fromEvent('helpdesk.change.overrun', { ticketId })?.trigger).toBe('change_overrun');
    expect(desk.fromEvent('helpdesk.problem.linked', { ticketId })?.trigger).toBe('problem_linked');
    expect(desk.fromEvent('helpdesk.problem.known_error', { ticketId })?.trigger).toBe('problem_known_error');
    expect(desk.triggers.map((t) => t.key)).toEqual(expect.arrayContaining(['change_scheduled', 'change_finished', 'change_overrun', 'problem_linked', 'problem_known_error']));
  });

  it('ignores other events and events without a ticket', () => {
    expect(desk.fromEvent('helpdesk.change.raised', { ticketId })).toBeNull();
    expect(desk.fromEvent('helpdesk.change.scheduled', { ticketId: 'not-a-uuid' })).toBeNull();
    expect(desk.fromEvent('helpdesk.problem.linked', {})).toBeNull();
  });
});
