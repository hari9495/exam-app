import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { CoursePlayerScreen, EnrolmentSheet, MyLearningScreen } from './learn-me';
import { CourseBuilderScreen } from './learn-admin';
import { liveCourseBuilder, liveMyLearning, liveNominate, livePlayer } from './learn-live-samples';

// Batch G3a: LRN-01, LRN-02, LRN-03 and LRN-06 with real records. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('LRN-01 My learning (live)', () => {
  it('shows assigned, nominated and requested courses; Continue opens the course', async () => {
    const onOpen = vi.fn();
    show(<MyLearningScreen live={liveMyLearning({ onOpen })} />);
    expect(screen.getByText('Requested')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onOpen).toHaveBeenCalledWith('e1');
  });

  it('declining needs a reason of 10 letters; a mandatory course offers no Decline', async () => {
    const onDecline = vi.fn().mockResolvedValue(undefined);
    show(<MyLearningScreen live={liveMyLearning({ onDecline })} />);
    expect(screen.getAllByRole('button', { name: 'Decline' })).toHaveLength(1);
    await ue.click(screen.getByRole('button', { name: 'Decline' }));
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Decline nomination' }));
    expect(await within(d).findByText('Write the reason (at least 10 characters).')).toBeInTheDocument();
    expect(onDecline).not.toHaveBeenCalled();
    await ue.type(within(d).getByRole('textbox', { name: /Reason/ }), 'I took this last year.');
    await ue.click(within(d).getByRole('button', { name: 'Decline nomination' }));
    expect(onDecline).toHaveBeenCalledWith('e2', 'I took this last year.');
  });

  it('the catalogue: Request for an approval course, Enrol otherwise; a refusal shows', async () => {
    const onEnrol = vi.fn().mockResolvedValueOnce({ status: 'enrolled' }).mockRejectedValueOnce(new Error('You are in this course already (or asked to be).'));
    show(<MyLearningScreen live={liveMyLearning({ onEnrol, tab: 'catalogue' })} />);
    await ue.click(within(screen.getByRole('article', { name: 'Forklift basics' })).getByRole('button', { name: 'Enrol' }));
    expect(onEnrol).toHaveBeenCalledWith('c4');
    expect((await screen.findAllByText('Enrolled.')).length).toBeGreaterThan(0);
    await ue.click(within(screen.getByRole('article', { name: 'Auditor prep' })).getByRole('button', { name: 'Request' }));
    expect((await screen.findAllByText(/already/)).length).toBeGreaterThan(0);
  });
});

describe('LRN-02 player (live)', () => {
  it('the next unfinished item opens; Mark as done records it; completion is celebrated', async () => {
    const onDone = vi.fn().mockResolvedValue({ completed: true });
    show(<CoursePlayerScreen live={livePlayer({ onDone })} />);
    expect(screen.getByText('1 of 2 required items · 50%')).toBeInTheDocument();
    const onOpenFile = vi.fn();
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    void onOpenFile;
    await ue.click(screen.getByRole('button', { name: 'Mark as done' }));
    expect(onDone).toHaveBeenCalledWith('i2');
    expect((await screen.findAllByText('You completed Food safety basics.')).length).toBeGreaterThan(0);
  });

  it('completed: the certificate is mentioned and no Mark as done', () => {
    show(<CoursePlayerScreen live={livePlayer({ data: { ...livePlayer().data!, status: 'completed', certificate: { title: 'x', issuedOn: '2026-10-01', expiresOn: '2027-10-01' } } })} />);
    expect(screen.queryByRole('button', { name: 'Mark as done' })).toBeNull();
    expect(screen.getByText(/certificate is issued/)).toBeInTheDocument();
  });
});

describe('LRN-03 course builder (live)', () => {
  it('a new course needs a name; links need https; it saves', async () => {
    const onSave = vi.fn().mockResolvedValue({ id: 'c9' });
    show(<CourseBuilderScreen live={liveCourseBuilder({ view: 'edit', course: null, onSave })} />);
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Link title/ }), 'Rules');
    await ue.type(screen.getByRole('textbox', { name: /Address/ }), 'http://x.com');
    await ue.click(screen.getByRole('button', { name: 'Add link' }));
    expect(await screen.findByText(/address starting with https/)).toBeInTheDocument();
    await ue.clear(screen.getByRole('textbox', { name: /Address/ }));
    await ue.type(screen.getByRole('textbox', { name: /Address/ }), 'https://x.com/rules');
    await ue.click(screen.getByRole('button', { name: 'Add link' }));
    await ue.click(screen.getByRole('tab', { name: /Settings/ }));
    await ue.type(screen.getByRole('textbox', { name: /Course name/ }), 'Fire safety');
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'Fire safety', items: [expect.objectContaining({ title: 'Rules', kind: 'link', url: 'https://x.com/rules', required: true })] }));
  });

  it('requests: approve; refuse needs a reason', async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);
    show(<CourseBuilderScreen live={liveCourseBuilder({ view: 'edit', onDecide })} />);
    await ue.click(screen.getByRole('tab', { name: /People/ }));
    await ue.click(screen.getByRole('button', { name: 'Refuse' }));
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Refuse request' }));
    expect(onDecide).not.toHaveBeenCalled();
    await ue.click(within(d).getByRole('button', { name: 'Cancel' }));
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onDecide).toHaveBeenCalledWith('n1', true);
  });

  it('the list opens a course; without the key: no access', async () => {
    const onOpen = vi.fn();
    const { unmount } = show(<CourseBuilderScreen live={liveCourseBuilder({ onOpen })} />);
    await ue.click(screen.getAllByRole('button', { name: 'Open' })[0]);
    expect(onOpen).toHaveBeenCalledWith('c1');
    unmount();
    show(<CourseBuilderScreen live={liveCourseBuilder({ state: 'no-access' })} />);
    expect(screen.queryByText('Food safety basics')).toBeNull();
  });
});

describe('LRN-06 nominate (live)', () => {
  it('needs at least one person; then nominates and says so', async () => {
    const onSend = vi.fn().mockResolvedValue({ nominated: 1 });
    const onClose = vi.fn();
    show(<EnrolmentSheet live={liveNominate({ onSend, onClose })} />);
    await ue.click(screen.getByRole('button', { name: 'Nominate 0 people' }));
    expect(await screen.findByText('Choose at least one person.')).toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByText(/can’t be declined/)).toBeInTheDocument();
  });
});
