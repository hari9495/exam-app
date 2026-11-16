import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { ANSWER_SCHEMA, NOT_COVERED, SYSTEM_PROMPT, buildRequest, readReply, type Source } from './assistant-prompt';
import { askClientFromEnv, ASK_KEY_ENV } from './assistant-client';
import { reviewMask } from './assistant.service';

const SOURCES: Source[] = [
  { ref: 'A1', kind: 'article', title: 'Apply for leave', href: '/yx/help/yukthix/yukthix-help/apply-for-leave', text: 'Open Leave, press Apply, choose the dates.' },
  { ref: 'W1', kind: 'whats_new', title: "What's new: Half days", href: null, text: '2026-11-01: half days in leave.' },
];
const ASKER = { role: 'employee', areas: ['Approving leave'] };
const reply = (body: unknown, stop: BetaMessage['stop_reason'] = 'end_turn') => ({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: stop, content: [{ type: 'text', text: typeof body === 'string' ? body : JSON.stringify(body), citations: null }] }) as unknown as BetaMessage;

describe('Ask YukthiX prompt (answers 2102, 2103)', () => {
  it('sends the model setting, structured output, low effort and the refusal fallback; documents before the question', () => {
    const r = buildRequest('claude-opus-5-5', [{ role: 'user', text: 'earlier' }, { role: 'assistant', text: 'earlier answer' }], 'How do I apply for leave?', SOURCES, ASKER);
    expect(r).toMatchObject({ model: 'claude-opus-5-5', system: SYSTEM_PROMPT, output_config: { effort: 'low', format: { type: 'json_schema', schema: ANSWER_SCHEMA } }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    expect(r).not.toHaveProperty('tools');
    expect(r).not.toHaveProperty('temperature');
    const last = r.messages[r.messages.length - 1]!;
    const blocks = last.content as { type: string; title?: string; text?: string }[];
    expect(blocks.map((b) => b.type)).toEqual(['document', 'document', 'text', 'text']);
    expect(blocks[0]!.title).toBe('A1: Apply for leave');
    expect(blocks[3]!.text).toBe('The question:\nHow do I apply for leave?');
    expect(blocks[2]!.text).toContain('their role is "employee"');
  });

  it('another model: no fallback parameter (only models that accept it get it)', () => {
    const r = buildRequest('claude-haiku-5-5', [], 'q', [], ASKER);
    expect(r).not.toHaveProperty('fallbacks');
    expect(r).not.toHaveProperty('betas');
  });

  it('the system prompt treats documents and the question as data and forbids guessing', () => {
    expect(SYSTEM_PROMPT).toMatch(/information only/);
    expect(SYSTEM_PROMPT).toMatch(/Never guess/);
    expect(SYSTEM_PROMPT).toMatch(/cannot take actions/);
  });

  it('an answer keeps only sources it was given', () => {
    const out = readReply(reply({ answer: 'Open Leave and press Apply.', sources: ['A1', 'X9'], outcome: 'answered' }), SOURCES);
    expect(out).toEqual({ text: 'Open Leave and press Apply.', sources: [SOURCES[0]], outcome: 'answered' });
  });

  it('negative: "answered" with no real source is not covered (never a guess)', () => {
    expect(readReply(reply({ answer: 'Probably in Settings.', sources: ['Z1'], outcome: 'answered' }), SOURCES)).toEqual({ text: NOT_COVERED, sources: [], outcome: 'not_covered' });
  });

  it('negative: a refusal, a cut-off answer, broken JSON or an unknown outcome are never shown as answers', () => {
    expect(readReply(reply('x', 'refusal'), SOURCES).outcome).toBe('refused');
    expect(readReply(reply('{"answer":"half', 'max_tokens'), SOURCES).outcome).toBe('error');
    expect(readReply(reply('not json'), SOURCES).outcome).toBe('error');
    expect(readReply(reply({ answer: 'x', sources: [], outcome: 'delete_everything' }), SOURCES).outcome).toBe('error');
  });

  it('the hand-over outcomes come through with their own text', () => {
    expect(readReply(reply({ answer: 'Someone needs to look at your account.', sources: [], outcome: 'needs_person' }), SOURCES).outcome).toBe('needs_person');
    expect(readReply(reply({ answer: 'YukthiX sales can help.', sources: [], outcome: 'buying' }), SOURCES).outcome).toBe('buying');
  });

  it('no key in server config: no client (the assistant is not switched on); never a fallback to other credentials', () => {
    expect(askClientFromEnv({})).toBeNull();
    expect(askClientFromEnv({ [ASK_KEY_ENV]: '   ' })).toBeNull();
    expect(askClientFromEnv({ ANTHROPIC_API_KEY: 'sk-other' })).toBeNull();
    expect(askClientFromEnv({ [ASK_KEY_ENV]: 'sk-test-not-real' })).not.toBeNull();
  });
});


describe('Ask YukthiX staff review masking', () => {
  it('hides phone numbers and email addresses as well as the service desk kinds', () => {
    expect(reviewMask('Call me on 9876543210 or +91 98765 43210, mail asha@kaveri.in')).toBe('Call me on [phone hidden] or [phone hidden], mail [email hidden]');
    expect(reviewMask('Leave for 2 days in 2026')).toBe('Leave for 2 days in 2026');
  });
});
