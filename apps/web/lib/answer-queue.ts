// Assessments AS-4a (PRC-26): answers kept on the candidate's device until the server has them. Every save carries the
// time the device made it; while the connection is down the answers wait here (they survive a reload) and are sent
// when it returns. The server never lets an older copy overwrite a newer one. Cleared once the test is submitted.

export interface QueuedAnswer {
  selectedOptionIds: string[];
  answerText?: string;
  codeLanguage?: string;
  markedForReview?: boolean;
  /** ISO time the device saved it. */
  clientSavedAt: string;
}
export type AnswerQueue = Record<string, QueuedAnswer>;

export const ANSWER_QUEUE_KEY = 'yx-exam-answers';

/** The queue on this device; empty when storage is missing, blocked or unreadable. */
export function loadQueue(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): AnswerQueue {
  try {
    const raw = storage?.getItem(ANSWER_QUEUE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as AnswerQueue) : {};
  } catch {
    return {};
  }
}

export function saveQueue(queue: AnswerQueue, storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = globalThis.localStorage): void {
  try {
    if (Object.keys(queue).length) storage?.setItem(ANSWER_QUEUE_KEY, JSON.stringify(queue));
    else storage?.removeItem(ANSWER_QUEUE_KEY);
  } catch {
    // Storage full or blocked: the answer still goes to the server when it can; only the reload safety is lost.
  }
}

/** Puts an answer in the queue; a copy older than the one already waiting never replaces it. */
export function enqueue(queue: AnswerQueue, questionId: string, answer: QueuedAnswer): AnswerQueue {
  const waiting = queue[questionId];
  if (waiting && waiting.clientSavedAt > answer.clientSavedAt) return queue;
  return { ...queue, [questionId]: answer };
}

/** Takes an answer out once the server has it, unless a newer one was queued meanwhile. */
export function settle(queue: AnswerQueue, questionId: string, sentSavedAt: string): AnswerQueue {
  const waiting = queue[questionId];
  if (!waiting || waiting.clientSavedAt !== sentSavedAt) return queue;
  const { [questionId]: _sent, ...rest } = queue;
  return rest;
}
