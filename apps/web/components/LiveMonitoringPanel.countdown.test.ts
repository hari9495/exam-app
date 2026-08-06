import { displayedRemainingSeconds } from './LiveMonitoringPanel';
import { RosterRow } from '../lib/types';

function row(overrides: Partial<RosterRow> = {}): RosterRow {
  return {
    candidateId: 'c1',
    candidateName: 'Candidate One',
    invitationId: 'i1',
    attemptId: 'a1',
    status: 'in_progress',
    online: true,
    remainingSeconds: 600,
    answeredCount: 2,
    totalQuestions: 10,
    proctoringBypassed: false,
    ...overrides,
  } as RosterRow;
}

const SNAPSHOT_AT = 1_000_000;

describe('displayedRemainingSeconds', () => {
  it('counts down between snapshots for a running attempt', () => {
    // The server only re-sends every 15s; without this the clock would visibly jump.
    expect(displayedRemainingSeconds(row(), SNAPSHOT_AT, SNAPSHOT_AT)).toBe(600);
    expect(displayedRemainingSeconds(row(), SNAPSHOT_AT, SNAPSHOT_AT + 5_000)).toBe(595);
    expect(displayedRemainingSeconds(row(), SNAPSHOT_AT, SNAPSHOT_AT + 14_000)).toBe(586);
  });

  // The point of the whole feature: a stopped candidate's clock must not drain.
  it('freezes a paused attempt at the server value', () => {
    const paused = row({ status: 'paused' });
    expect(displayedRemainingSeconds(paused, SNAPSHOT_AT, SNAPSHOT_AT + 60_000)).toBe(600);
  });

  it('freezes a blocked attempt at the server value', () => {
    const blocked = row({ status: 'blocked' });
    expect(displayedRemainingSeconds(blocked, SNAPSHOT_AT, SNAPSHOT_AT + 60_000)).toBe(600);
  });

  it('resumes counting down once the server reports in_progress again', () => {
    // After resume the server banks the paused duration and sends a fresh figure; the local
    // countdown simply continues from whatever that new snapshot said.
    const resumed = row({ status: 'in_progress', remainingSeconds: 540 });
    expect(displayedRemainingSeconds(resumed, SNAPSHOT_AT, SNAPSHOT_AT + 10_000)).toBe(530);
  });

  it('never goes negative when a snapshot is stale', () => {
    expect(displayedRemainingSeconds(row({ remainingSeconds: 5 }), SNAPSHOT_AT, SNAPSHOT_AT + 60_000)).toBe(0);
  });

  it('keeps "no attempt yet" as null rather than inventing a clock', () => {
    expect(displayedRemainingSeconds(row({ remainingSeconds: null }), SNAPSHOT_AT, SNAPSHOT_AT + 5_000)).toBeNull();
  });

  it('shows the raw value before any snapshot timestamp exists', () => {
    expect(displayedRemainingSeconds(row(), null, SNAPSHOT_AT + 5_000)).toBe(600);
  });

  it('does not run backwards if the clock skews behind the snapshot', () => {
    expect(displayedRemainingSeconds(row(), SNAPSHOT_AT, SNAPSHOT_AT - 5_000)).toBe(600);
  });
});
