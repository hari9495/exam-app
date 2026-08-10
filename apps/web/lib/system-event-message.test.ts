import { plainEnglish } from './system-event-message';
import type { SystemEventEntry } from './hooks/useSystemEvents';

function event(message: string): SystemEventEntry {
  return {
    id: 'evt-1',
    organizationId: 'org-1',
    service: 'candidate-browser',
    severity: 'error',
    message,
    context: null,
    occurredAt: '2026-08-08T04:43:00.000Z',
  };
}

describe('plainEnglish', () => {
  // These six are every distinct message shape present in production as of
  // 2026-08-08 (88 events, surveyed directly). If a new shape starts appearing,
  // add it here and to RULES rather than letting it fall through to the fallback.
  it('explains a bare cross-origin "Script error." without blaming the exam app', () => {
    const plain = plainEnglish(event('js_error: Script error.'));
    expect(plain.summary).toBe("Something in the candidate's browser crashed (no details available)");
    expect(plain.meaning).toMatch(/browser extension/);
    expect(plain.whatToDo).toMatch(/^Nothing/);
  });

  it('names the code editor failure for the Monaco double-load error', () => {
    const plain = plainEnglish(event('js_error: Error: Can only have one anonymous define call per script file'));
    expect(plain.summary).toBe('The code editor failed to load for this candidate');
    expect(plain.whatToDo).toMatch(/refresh the page/);
  });

  it('reads the attempt status out of a rejected answer save', () => {
    const plain = plainEnglish(event('answer_save_failed: Cannot answer — attempt status is "paused"'));
    expect(plain.summary).toBe('The candidate tried to answer while their exam was paused');
    expect(plain.whatToDo).toMatch(/resume the attempt/i);
  });

  it('converts the code-review timeout to seconds and says the score is unaffected', () => {
    const plain = plainEnglish(
      event(
        'ServiceUnavailableException: Exam runtime internal call to http://127.0.0.1:3003/api/v1/internal/attempts/answers/abc/generate-code-review timed out after 5000ms',
      ),
    );
    expect(plain.summary).toBe('AI code review took too long and was skipped');
    expect(plain.meaning).toMatch(/within 5 seconds/);
    expect(plain.meaning).toMatch(/score are not affected/);
  });

  it('falls back to a generic internal-timeout explanation for other runtime calls', () => {
    const plain = plainEnglish(
      event('ServiceUnavailableException: Exam runtime internal call to http://127.0.0.1:3003/api/v1/internal/attempts/unblock timed out after 5000ms'),
    );
    expect(plain.summary).toBe('One part of the system did not answer in time');
    expect(plain.meaning).toMatch(/5 seconds/);
  });

  it('names the blocked-port cause for a run failure with no HTTP status', () => {
    const plain = plainEnglish(event('code_run_failed: Something unexpected went wrong (error 0). Please try again.'));
    expect(plain.summary).toBe("The candidate's network blocked the code runner");
    expect(plain.meaning).toMatch(/port \(3002\)/);
    expect(plain.meaning).toMatch(/could still type it and submit it/);
  });

  it('falls back to quoting the message for a run failure that DID get a real status', () => {
    const plain = plainEnglish(event('code_run_failed: You have used all 30 runs for this question.'));
    expect(plain.summary).toBe("The candidate couldn't run their code");
    expect(plain.meaning).toMatch(/all 30 runs/);
    expect(plain.whatToDo).toMatch(/HTTP status/);
  });

  it('quotes the browser text for a js_error that does carry a real message', () => {
    const plain = plainEnglish(event('js_error: Cannot read properties of undefined'));
    expect(plain.summary).toBe("An error occurred on the candidate's exam page");
    expect(plain.meaning).toMatch(/Cannot read properties of undefined/);
  });

  // An unrecognised message must still read as words -- never a raw token, and never blank.
  it('strips the engineering prefix from an unknown message instead of showing it raw', () => {
    const plain = plainEnglish(event('TypeError: cannot connect to the grading queue'));
    expect(plain.summary).toBe('Cannot connect to the grading queue');
    expect(plain.whatToDo).toMatch(/developers/);
  });

  it('never returns an empty summary, even for a message that is only a prefix', () => {
    expect(plainEnglish(event('TypeError:')).summary).toBe('TypeError:');
    expect(plainEnglish(event('weird_kind:')).summary).toBe('Weird_kind:');
  });
});
