import type { ReactElement } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { EnrolmentSheet, type Course } from './learn-me';
import { LiveCourseBuilderScreen, LiveCoursePlayerScreen, LiveMyLearningScreen, type LiveBuilder, type LivePlayer } from './learn-live';

// Answer 2781: a SCORM package in the player (sandboxed frame, status from the package, commits through the bridge)
// and in the course builder; LRN-06: the designed enrolment sheet, live, in its decline and nominate modes.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const course = (o: Partial<Course> = {}): Course => ({ id: 'c1', title: 'Fire drill', type: 'Self-paced', source: 'Kaveri Foods', duration: '15 min', skills: [], cost: 0, certificate: true, ...o });
const LAUNCH = 'https://content.yukthix.test/api/v1/scorm/tok/index.html';

describe('SCORM in the course player (answer 2781)', () => {
  const player = (o: Partial<LivePlayer> = {}, launchUrl: string | null = LAUNCH, status: 'incomplete' | 'failed' = 'incomplete'): LivePlayer => ({
    state: 'ready',
    onRetry: vi.fn(),
    onOpenItem: vi.fn(),
    onDone: vi.fn(async () => undefined),
    onDownload: vi.fn(),
    data: {
      enrolment: { id: 'e1', status: 'In progress', due: null },
      course: course(),
      items: [{ id: 's1', title: 'Drill package', kind: 'SCORM', minutes: 15, required: true, done: false, url: null, scorm: { version: '1.2', status, score: null, launchUrl } }],
      certificate: null,
    },
    ...o,
  });

  it('opens in a sandboxed frame on the content origin; no Mark as done; the package reports its status', async () => {
    const onScorm = vi.fn(async () => ({ status: 'completed' as const, score: '90 of 100' }));
    wrap(<LiveCoursePlayerScreen live={player({ onScorm })} />);
    expect(screen.getByText('SCORM package runs in a sandboxed frame')).toBeInTheDocument();
    expect(screen.getByText('Package reports: incomplete')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as done' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Open' }));
    const frame = screen.getByTitle('SCORM package: Drill package') as HTMLIFrameElement;
    expect(frame.getAttribute('src')).toBe(LAUNCH);
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-forms');
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
    // A commit from another window or origin is ignored; the frame's own is saved, allowed fields only.
    const data = { yxScorm: 1, item: 's1', cmi: { 'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': '90', 'cmi.core.student_name': 'x' } };
    act(() => void window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.test', source: frame.contentWindow, data })));
    act(() => void window.dispatchEvent(new MessageEvent('message', { origin: 'null', source: window, data })));
    expect(onScorm).not.toHaveBeenCalled();
    act(() => void window.dispatchEvent(new MessageEvent('message', { origin: 'null', source: frame.contentWindow, data })));
    await waitFor(() => expect(onScorm).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), { 'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': '90' }));
    expect(await screen.findByText('Package reports: completed · score 90 of 100')).toBeInTheDocument();
  });

  it('a failed package says to retake it; without a launch link it cannot open', () => {
    const { unmount } = wrap(<LiveCoursePlayerScreen live={player({}, LAUNCH, 'failed')} />);
    expect(screen.getByText('Package reports: failed')).toBeInTheDocument();
    expect(screen.getByText(/Retake the package/)).toBeInTheDocument();
    unmount();
    wrap(<LiveCoursePlayerScreen live={player({}, null)} />);
    expect(screen.getByRole('button', { name: 'Open' })).toBeDisabled();
    expect(screen.getByText(/The SCORM player is not set up on this server yet/)).toBeInTheDocument();
  });
});

describe('SCORM in the course builder (answer 2781)', () => {
  it('Upload SCORM package sends the zip as a SCORM item; the version shows on the item', async () => {
    const live: LiveBuilder = {
      state: 'ready',
      onRetry: vi.fn(),
      data: { course: { ...course(), status: 'draft', version: 1, description: null, durationMinutes: 15, certificateMonths: 12 }, items: [{ id: 's1', title: 'Drill package', kind: 'SCORM', scormVersion: '2004', minutes: 15, required: true, url: null, file: 'drill.zip' }] },
      onSave: vi.fn(async () => undefined),
      onStatus: vi.fn(async () => undefined),
      onAddItem: vi.fn(async () => undefined),
      onItem: vi.fn(async () => undefined),
      onRemove: vi.fn(async () => undefined),
      onBack: vi.fn(),
    };
    wrap(<LiveCourseBuilderScreen live={live} />);
    expect(screen.getByText(/SCORM 2004 · 15 min · drill.zip/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Upload SCORM package' }));
    const dialog = await screen.findByRole('dialog', { name: 'Upload a SCORM package' });
    await ue.click(within(dialog).getByRole('button', { name: 'Add item' }));
    expect(within(dialog).getByText('Choose the zip.')).toBeInTheDocument();
    await ue.type(within(dialog).getByRole('textbox', { name: /Title/ }), 'Allergen package');
    const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    const zip = new File(['PK'], 'allergens.zip', { type: 'application/zip' });
    fireEvent.change(input, { target: { files: [zip] } });
    // The upload settles, then Add item sends it.
    await waitFor(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Add item' }));
      expect(live.onAddItem).toHaveBeenCalledWith({ title: 'Allergen package', kind: 'scorm', minutes: 10, required: true }, zip);
    });
  });
});

describe('The enrolment sheet, live (LRN-06)', () => {
  it('decline: a reason of 10 characters; never for a mandatory course', async () => {
    const onDecline = vi.fn(async () => undefined);
    const onClose = vi.fn();
    const { unmount } = wrap(<EnrolmentSheet live={{ mode: 'decline', course: course({ title: 'Risk-based testing' }), onClose, onDecline }} />);
    const sheet = await screen.findByRole('dialog', { name: 'Decline nomination: Risk-based testing' });
    const go = within(sheet).getByRole('button', { name: 'Decline nomination' });
    expect(go).toBeDisabled();
    await ue.type(within(sheet).getByRole('textbox', { name: /Reason/ }), 'Shift clash');
    await ue.click(go);
    await waitFor(() => expect(onDecline).toHaveBeenCalledWith('Shift clash'));
    expect(onClose).toHaveBeenCalled();
    unmount();
    wrap(<EnrolmentSheet live={{ mode: 'decline', course: course({ mandatory: true }), onClose, onDecline }} />);
    expect(await screen.findByText('Mandatory courses can’t be declined')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline nomination' })).toBeDisabled();
  });

  it('nominate from the catalogue: a session, people, and each one’s seat or waitlist place', async () => {
    const onNominate = vi.fn(async () => undefined);
    const onSessions = vi.fn(async () => [{ id: 's1', label: '8 Oct, Hall B', seats: 1, enrolled: 0, waitlist: 0 }]);
    wrap(
      <LiveMyLearningScreen
        live={{
          state: 'ready',
          onRetry: vi.fn(),
          onTab: vi.fn(),
          onOpen: vi.fn(),
          onDownload: vi.fn(),
          onEnrol: vi.fn(),
          onSessions,
          onNominate,
          team: [
            { value: 'p1', label: 'Arjun' },
            { value: 'p2', label: 'Imran' },
          ],
          tab: 'catalogue',
          data: { today: '2026-10-21', employee: true, enrolments: [], certificates: [], catalogue: [course({ id: 'c5', title: 'Risk-based testing', type: 'Classroom' })] },
        }}
      />,
    );
    await ue.click(screen.getByRole('button', { name: 'Nominate' }));
    const sheet = await screen.findByRole('dialog', { name: 'Nominate for Risk-based testing' });
    expect(within(sheet).getByRole('button', { name: 'Nominate 0 people' })).toBeDisabled();
    await ue.click(within(sheet).getByRole('combobox', { name: /People/ }));
    await ue.click(await screen.findByRole('option', { name: 'Arjun' }));
    await ue.click(await screen.findByRole('option', { name: 'Imran' }));
    expect(within(sheet).getByText('Arjun: Enrolled')).toBeInTheDocument();
    expect(within(sheet).getByText('Imran: Waitlist, position 1')).toBeInTheDocument();
    await ue.click(within(sheet).getByRole('button', { name: 'Nominate 2 people' }));
    await waitFor(() => expect(onNominate).toHaveBeenCalledWith(expect.objectContaining({ id: 'c5' }), 's1', ['p1', 'p2']));
  });
});
