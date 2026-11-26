import { describe, expect, it } from 'vitest';
import { acceptScormMessage } from './scorm-bridge';

// Answer 2781: the app side of the SCORM bridge takes only its own frame's commits, from the content origin, for the
// item it plays, and only the fields we store.
const LAUNCH = 'https://content.yukthix.test/api/v1/scorm/tok/index.html';
type W = { parent: W };
const top = {} as W;
top.parent = top;
const frame = { parent: top } as W;
const inner = { parent: frame } as W;
const other = { parent: top } as W;
const msg = (over: Partial<{ origin: string; source: unknown; data: unknown }> = {}) => ({ origin: 'null', source: frame, data: { yxScorm: 1, item: 'i1', cmi: { 'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': 90, 'cmi.core.student_name': 'x', 'cmi.interactions': {} } }, ...over });

describe('acceptScormMessage', () => {
  it('takes the allowed fields from its frame (opaque or content origin) and frames inside it', () => {
    expect(acceptScormMessage(msg(), frame, LAUNCH, 'i1', '1.2')).toEqual({ 'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': '90' });
    expect(acceptScormMessage(msg({ origin: 'https://content.yukthix.test', source: inner }), frame, LAUNCH, 'i1', '1.2')).not.toBeNull();
  });
  it('ignores a wrong origin, another window, another item, a foreign shape', () => {
    expect(acceptScormMessage(msg({ origin: 'https://evil.test' }), frame, LAUNCH, 'i1', '1.2')).toBeNull();
    expect(acceptScormMessage(msg({ source: other }), frame, LAUNCH, 'i1', '1.2')).toBeNull();
    expect(acceptScormMessage(msg({ source: null }), frame, LAUNCH, 'i1', '1.2')).toBeNull();
    expect(acceptScormMessage(msg(), null, LAUNCH, 'i1', '1.2')).toBeNull();
    expect(acceptScormMessage(msg(), frame, LAUNCH, 'i2', '1.2')).toBeNull();
    expect(acceptScormMessage(msg({ data: 'hello' }), frame, LAUNCH, 'i1', '1.2')).toBeNull();
    expect(acceptScormMessage(msg({ data: { yxScorm: 1, item: 'i1', cmi: null } }), frame, LAUNCH, 'i1', '1.2')).toBeNull();
  });
  it('keeps the fields of the version only, and refuses oversize suspend data', () => {
    expect(acceptScormMessage(msg({ data: { yxScorm: 1, item: 'i1', cmi: { 'cmi.core.lesson_status': 'passed', 'cmi.completion_status': 'completed' } } }), frame, LAUNCH, 'i1', '2004')).toEqual({ 'cmi.completion_status': 'completed' });
    expect(acceptScormMessage(msg({ data: { yxScorm: 1, item: 'i1', cmi: { 'cmi.suspend_data': 'x'.repeat(64_001) } } }), frame, LAUNCH, 'i1', '1.2')).toBeNull();
  });
});
