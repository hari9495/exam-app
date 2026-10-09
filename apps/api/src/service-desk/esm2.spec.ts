import 'reflect-metadata';
import { PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_ANY_KEY, PERMISSIONS_KEY } from '../rbac/permissions.decorator';
import { CARD_BUILDERS } from '../workflow/approval-channels';
import { parseCard, parsePrompts } from './chat.service';
import { fill, unknownFields } from './documents.service';
import { DeskChatController, DeskOrgController, MyChatController } from './esm2.controller';
import { checkMove, parseLifecycle } from './lifecycle';
import { ScheduleError, checkRule, dueBetween, nextRun, preview } from './recurrence';

// Batch 2 pure rules: lifecycle validation and moves (SD-2.11), repeat rules and their edge cases (SD-2.13), document
// fields (SD-2.07), chat cards and prompts (SD-2.19), neutral approval cards (SD-2.06), and every route's key.

const S = {
  newS: '11111111-1111-4111-8111-111111111111',
  work: '22222222-2222-4222-8222-222222222222',
  wait: '33333333-3333-4333-8333-333333333333',
  done: '44444444-4444-4444-8444-444444444444',
  shut: '55555555-5555-4555-8555-555555555555',
};
const statuses = [
  { id: S.newS, label: 'New', systemState: 'new' },
  { id: S.work, label: 'In progress', systemState: 'open' },
  { id: S.wait, label: 'Waiting', systemState: 'pending' },
  { id: S.done, label: 'Resolved', systemState: 'solved' },
  { id: S.shut, label: 'Closed', systemState: 'closed' },
];
const label = (id: string) => statuses.find((s) => s.id === id)?.label ?? id;
const good = {
  startStatusId: S.newS,
  statusIds: [S.newS, S.work, S.done, S.shut],
  transitions: [
    { from: S.newS, to: S.work },
    { from: S.work, to: S.done, require: ['resolution_note'] },
    { from: S.done, to: S.shut, who: 'lead' },
    { from: S.done, to: S.work },
  ],
};

describe('lifecycle (SD-2.11)', () => {
  it('accepts a sound lifecycle', () => {
    expect(parseLifecycle(good, statuses).transitions).toHaveLength(4);
  });

  it.each([
    [{ ...good, startStatusId: S.work }, /starts in a "new" status/],
    [{ ...good, statusIds: [...good.statusIds, S.wait] }, /"Waiting" cannot be reached/],
    [{ ...good, transitions: good.transitions.filter((t) => t.from !== S.done) }, /cannot move on|cannot be reached/],
    [{ ...good, transitions: [...good.transitions, { from: S.newS, to: S.work }] }, /appears twice/],
    [{ ...good, transitions: [...good.transitions, { from: S.newS, to: S.newS }] }, /goes to another status/],
    [{ ...good, statusIds: [S.newS, S.work], transitions: [{ from: S.newS, to: S.work }, { from: S.work, to: S.newS }] }, /resolved or closed/],
    [{ ...good, statusIds: ['not-a-status', S.newS] }, /statuses of this desk/],
    [{ ...good, transitions: [{ from: S.newS, to: S.work, require: ['salary'] }] }, /fields from the list/],
    [{ ...good, extra: 1 }, /unknown part/],
  ])('refuses a broken one (%#)', (draft, message) => {
    expect(() => parseLifecycle(draft, statuses)).toThrow(message as RegExp);
  });

  it('checks each move: allowed, by whom, fields filled, condition met', () => {
    const def = parseLifecycle({ ...good, transitions: [...good.transitions.slice(0, 3), { from: S.done, to: S.work, when: { id: 'g', join: 'and', items: [{ id: 'c', field: 'priority', operator: 'lt', value: 3 }] } }] }, statuses);
    const base = { values: { priority: 4 }, filled: { category: false, group: false, assignee: false, resolution_code: false, resolution_note: false, impact: false, urgency: false }, lead: false };
    expect(checkMove(def, S.newS, S.done, base, label)).toMatch(/cannot move from "New" to "Resolved". It can go to "In progress"/);
    expect(checkMove(def, S.newS, S.work, base, label)).toBeNull();
    expect(checkMove(def, S.work, S.done, base, label)).toBe('Fill in Resolution note first.');
    expect(checkMove(def, S.work, S.done, { ...base, filled: { ...base.filled, resolution_note: true } }, label)).toBeNull();
    expect(checkMove(def, S.done, S.shut, base, label)).toMatch(/Only a team lead/);
    expect(checkMove(def, S.done, S.shut, { ...base, lead: true }, label)).toBeNull();
    expect(checkMove(def, S.done, S.work, base, label)).toMatch(/does not meet the condition/);
    expect(checkMove(def, S.done, S.work, { ...base, values: { priority: 1 } }, label)).toBeNull();
  });
});

describe('repeat rules (SD-2.13)', () => {
  const iso = (d: Date[]) => d.map((x) => x.toISOString());

  it('monthly on the 31st skips short months', () => {
    expect(iso(preview({ rule: 'FREQ=MONTHLY;BYMONTHDAY=31', zone: 'Asia/Kolkata', startsAt: new Date('2026-01-31T04:30:00Z') }, 3, new Date('2026-01-01T00:00:00Z')))).toEqual(['2026-01-31T04:30:00.000Z', '2026-03-31T04:30:00.000Z', '2026-05-31T04:30:00.000Z']);
  });

  it('keeps the wall time across summer time (Europe/London)', () => {
    const s = { rule: 'FREQ=WEEKLY;BYDAY=MO', zone: 'Europe/London', startsAt: new Date('2026-03-16T09:00:00Z') };
    expect(iso(dueBetween(s, new Date('2026-03-15T00:00:00Z'), new Date('2026-04-07T00:00:00Z')))).toEqual(['2026-03-16T09:00:00.000Z', '2026-03-23T09:00:00.000Z', '2026-03-30T08:00:00.000Z', '2026-04-06T08:00:00.000Z']);
  });

  it('yearly on 29 February happens only in leap years', () => {
    expect(iso(preview({ rule: 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29', zone: 'UTC', startsAt: new Date('2028-02-29T10:00:00Z') }, 2, new Date('2027-01-01T00:00:00Z')))).toEqual(['2028-02-29T10:00:00.000Z', '2032-02-29T10:00:00.000Z']);
  });

  it('the first Monday of each month; ends after COUNT; never twice for the same time', () => {
    const s = { rule: 'FREQ=MONTHLY;BYDAY=1MO;COUNT=2', zone: 'Asia/Kolkata', startsAt: new Date('2026-10-01T04:30:00Z') };
    expect(iso(preview(s, 5, new Date('2026-09-01T00:00:00Z')))).toEqual(['2026-10-05T04:30:00.000Z', '2026-11-02T04:30:00.000Z']);
    expect(nextRun(s, new Date('2026-11-02T04:30:00Z'))).toBeNull();
    expect(dueBetween(s, new Date('2026-10-05T04:30:00Z'), new Date('2026-10-20T00:00:00Z'))).toEqual([]);
  });

  it('an outage catches up at most ten due times, oldest first', () => {
    const due = dueBetween({ rule: 'FREQ=DAILY', zone: 'UTC', startsAt: new Date('2026-01-01T06:00:00Z') }, new Date('2025-12-31T00:00:00Z'), new Date('2026-02-01T00:00:00Z'));
    expect(due).toHaveLength(10);
    expect(due[0].toISOString()).toBe('2026-01-01T06:00:00.000Z');
  });

  it.each(['FREQ=SECONDLY', 'FREQ=HOURLY', 'FREQ=DAILY;BYHOUR=3', 'FREQ=DAILY;COUNT=5000', 'FREQ=DAILY;COUNT=2;UNTIL=20270101', 'FREQ=WEEKLY;BYDAY=XX', 'FREQ=MONTHLY;BYMONTHDAY=0', 'FREQ=DAILY;FREQ=WEEKLY', ''])('refuses %p', (rule) => {
    expect(() => checkRule(rule)).toThrow(ScheduleError);
  });

  it('refuses an unknown time zone', () => {
    expect(() => nextRun({ rule: 'FREQ=DAILY', zone: 'Mars/Olympus', startsAt: new Date() }, new Date())).toThrow(/time zone/);
  });
});

describe('document fields (SD-2.07)', () => {
  it('fills known fields and lists what is missing (YX-DOC-07: no silent blanks)', () => {
    expect(fill('Dear {{ for_name }}, joined {{joined_on}}. {{answer.reason}}', { for_name: 'Asha', joined_on: null, 'answer.reason': 'Visa' })).toEqual({ text: 'Dear Asha, joined . Visa', missing: ['joined_on'] });
    expect(unknownFields('{{for_name}} {{salary}} {{answer.ok}} {{bank.account}}')).toEqual(['salary', 'bank.account']);
  });
});

describe('chat cards and prompts (SD-2.19)', () => {
  it('cards carry plain words and reply buttons only', () => {
    expect(parseCard({ title: 'Reset done', buttons: [{ label: 'It works' }] })).toEqual({ title: 'Reset done', buttons: [{ label: 'It works', reply: 'It works' }] });
    expect(() => parseCard({ html: '<b>x</b>' })).toThrow(/unknown part/);
    expect(() => parseCard({})).toThrow(/empty/);
    expect(() => parseCard({ buttons: new Array(6).fill({ label: 'x' }) })).toThrow(/5 buttons/);
    // Personal data typed into a card is masked like any message (YX-SD-15).
    expect(parseCard({ text: 'PAN ABCPE1234F' })!.text).not.toContain('ABCPE1234F');
  });

  it('prompts are page paths, words and a delay', () => {
    expect(parsePrompts([{ pathPrefix: '/yx/desk/help', text: 'Need help?', afterSeconds: 20 }])).toEqual([{ id: 'p1', pathPrefix: '/yx/desk/help', text: 'Need help?', afterSeconds: 20 }]);
    expect(() => parsePrompts([{ pathPrefix: 'javascript:alert(1)', text: 'x' }])).toThrow(/starts with \//);
  });
});

describe('approval cards (SD-2.06)', () => {
  it('a neutral card shows no title or summary in Teams, Slack or a push', () => {
    const card = { title: 'An approval is waiting for you', lines: [], neutral: true, url: 'https://app.example/yx/approvals', expiresAt: new Date() };
    for (const p of ['teams', 'slack', 'push'] as const) expect(JSON.stringify(CARD_BUILDERS[p](card))).not.toMatch(/Payslip|salary/i);
    expect(CARD_BUILDERS.push({ ...card, neutral: false, title: 'New laptop for Arjun', lines: [{ label: 'Cost', value: '₹85,000' }] })).toEqual({ title: 'Approval waiting', body: 'New laptop for Arjun', data: { url: card.url } });
  });
});

describe('every batch-2 desk route declares its key (YX-SEC-01)', () => {
  const routes = (c: { prototype: object }) => Object.getOwnPropertyNames(c.prototype).filter((m) => m !== 'constructor' && Reflect.getMetadata(PATH_METADATA, (c.prototype as Record<string, object>)[m]) !== undefined);
  const keyed = (c: { prototype: object }, m: string) => {
    const fn = (c.prototype as Record<string, object>)[m];
    return [...(Reflect.getMetadata(PERMISSIONS_KEY, fn) ?? []), ...(Reflect.getMetadata(PERMISSIONS_ANY_KEY, fn) ?? [])];
  };
  it.each([DeskOrgController, DeskChatController])('%p', (c) => {
    expect(routes(c).length).toBeGreaterThan(5);
    expect(routes(c).filter((m) => !keyed(c, m).length)).toEqual([]);
  });
  it('the requester routes are implicit (own chats and documents only)', () => {
    expect(routes(MyChatController).filter((m) => !keyed(MyChatController, m).length).sort()).toEqual(['end', 'file', 'fileLink', 'list', 'myDocuments', 'one', 'prompt', 'queues', 'rate', 'sign', 'signCode', 'start']);
    expect(keyed(DeskOrgController, 'move')).toEqual(['desk.ticket.move']);
    expect(keyed(DeskOrgController, 'hrSummary')).toEqual(['desk.hr_summary.view']);
    expect(keyed(DeskOrgController, 'lifecyclePublish')).toEqual(['desk.lifecycle.manage']);
    expect(keyed(DeskChatController, 'accept')).toEqual(['desk.chat.work']);
  });
});
