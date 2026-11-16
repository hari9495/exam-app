import { ANSWER_QUEUE_KEY, enqueue, loadQueue, saveQueue, settle, type AnswerQueue } from './answer-queue';

// AS-4a: answers kept on the device while offline.
const a = (t: string, ids = ['x']) => ({ selectedOptionIds: ids, clientSavedAt: t });

describe('answer queue', () => {
  it('a newer answer replaces the waiting one; an older one never does', () => {
    let q: AnswerQueue = {};
    q = enqueue(q, 'q1', a('2026-11-16T10:00:00.000Z', ['a']));
    q = enqueue(q, 'q1', a('2026-11-16T10:01:00.000Z', ['b']));
    expect(q.q1!.selectedOptionIds).toEqual(['b']);
    q = enqueue(q, 'q1', a('2026-11-16T09:59:00.000Z', ['c']));
    expect(q.q1!.selectedOptionIds).toEqual(['b']);
  });

  it('settles only the copy that was sent, keeping a newer one queued meanwhile', () => {
    let q = enqueue({}, 'q1', a('2026-11-16T10:01:00.000Z'));
    expect(settle(q, 'q1', '2026-11-16T10:00:00.000Z')).toBe(q);
    q = settle(q, 'q1', '2026-11-16T10:01:00.000Z');
    expect(q).toEqual({});
  });

  it('survives a reload through storage; unreadable or blocked storage is an empty queue', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    saveQueue(enqueue({}, 'q1', a('2026-11-16T10:00:00.000Z')), storage);
    expect(Object.keys(loadQueue(storage))).toEqual(['q1']);
    saveQueue({}, storage);
    expect(store.has(ANSWER_QUEUE_KEY)).toBe(false);
    store.set(ANSWER_QUEUE_KEY, '{not json');
    expect(loadQueue(storage)).toEqual({});
    expect(loadQueue({ getItem: () => { throw new Error('blocked'); } })).toEqual({});
  });
});
