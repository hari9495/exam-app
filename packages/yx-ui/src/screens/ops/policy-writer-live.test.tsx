import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { PolicyWriterScreen } from './cases-more';
import { WRITER_DRAFT, WRITER_HOME, WRITER_RESOLVED, liveWriter } from './policy-writer-live-samples';

// HLP-14 Write policies with AI, live (the designed screen with sample records): positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

async function answerCompany() {
  await ue.click(screen.getByRole('combobox', { name: /Industry/ }));
  await ue.click(await screen.findByRole('option', { name: 'Food and consumer goods' }));
  await ue.click(screen.getByRole('combobox', { name: /States where people work/ }));
  await ue.click(await screen.findByRole('option', { name: 'Karnataka' }));
  await ue.keyboard('{Escape}');
  await ue.type(screen.getByRole('textbox', { name: /Headcount/ }), '248');
}

describe('HLP-14 questionnaire (live)', () => {
  it('Continue too early says what is missing and drafts nothing', async () => {
    const onGenerate = vi.fn();
    show(<PolicyWriterScreen live={liveWriter({ onGenerate })} />);
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Choose your industry.')).toBeInTheDocument();
    expect(screen.getByText('Choose at least one state where people work.')).toBeInTheDocument();
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('answers go to the AI as fixed choices and numbers; the page opens the new draft', async () => {
    const onGenerate = vi.fn().mockResolvedValue({ id: 'd9' });
    const onOpenDraft = vi.fn();
    show(<PolicyWriterScreen live={liveWriter({ onGenerate, onOpenDraft })} />);
    await answerCompany();
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(
      screen.getByRole('radio', {
        name: 'Office and plant shifts, including nights',
      }),
    );
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.type(screen.getByRole('textbox', { name: /Anything else/ }), 'Plant staff work Sundays.');
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText(/Only these answers go to your company’s AI/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Draft policies' }));
    expect(onGenerate).toHaveBeenCalledWith({
      mode: 'ai',
      type: 'leave',
      industry: 'fmcg',
      states: ['IN-KA'],
      headcount: 248,
      workPattern: 'shift',
      notes: 'Plant staff work Sundays.',
      earned: 15,
      sick: 12,
      casual: 12,
      carry: 45,
    });
    expect(onOpenDraft).toHaveBeenCalledWith('d9');
  });

  it('AI off: the page says so plainly and offers the starter', async () => {
    const onGenerate = vi.fn().mockResolvedValue({ id: 'd9' });
    show(
      <PolicyWriterScreen
        live={liveWriter({
          onGenerate,
          home: {
            ...WRITER_HOME,
            ai: 'not_set_up',
            latest: {
              id: 'd1',
              type: 'Leave',
              createdAt: '2026-11-04T05:30:00.000Z',
            },
          },
        })}
      />,
    );
    expect(screen.getByText('Your company has no AI set up')).toBeInTheDocument();
    expect(screen.getByText(/started 4 Nov 2026/)).toBeInTheDocument();
    await answerCompany();
    for (let i = 0; i < 3; i++) await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('button', { name: 'Use a starter' }));
    expect(onGenerate.mock.calls[0][0]).toMatchObject({ mode: 'starter' });
  });

  it('a refusal from the server shows and the answers stay', async () => {
    const onGenerate = vi.fn().mockRejectedValue(new Error('Leave people’s names out of the notes. Only your answers go to the AI.'));
    show(<PolicyWriterScreen live={liveWriter({ onGenerate })} />);
    await answerCompany();
    for (let i = 0; i < 3; i++) await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('button', { name: 'Draft policies' }));
    expect(await screen.findByText(/Leave people’s names out/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Draft policies' })).toBeInTheDocument();
  });
});

describe('HLP-14 draft (live)', () => {
  it('an open law finding blocks approval; "Use the legal minimum" saves the fix', async () => {
    const onSave = vi.fn().mockResolvedValue({ version: 4 });
    const onApprove = vi.fn();
    show(
      <PolicyWriterScreen
        live={liveWriter({
          draftId: 'd1',
          draft: WRITER_DRAFT,
          onSave,
          onApprove,
        })}
      />,
    );
    expect(screen.getByText('Law check (1 open)')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Approve & load' }));
    expect((await screen.findAllByText('Fix the open law-check finding first.')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('dialog')).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Use the legal minimum' }));
    expect(onSave).toHaveBeenCalledWith('d1', { version: 3, earned: 18 });
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('rule and law lines are read-only; prose edits are saved; HTML in a clause stays text', async () => {
    const onSave = vi.fn().mockResolvedValue({ version: 4 });
    const draft = {
      ...WRITER_DRAFT,
      clauses: WRITER_DRAFT.clauses.map((c) => (c.id === 'p1' ? { ...c, text: '<script>alert(1)</script>Purpose' } : c)),
    };
    const { container } = show(<PolicyWriterScreen live={liveWriter({ draftId: 'd1', draft, onSave })} />);
    expect(screen.getByRole('textbox', { name: 'Earned leave' })).toHaveAttribute('readonly');
    expect(screen.getByRole('textbox', { name: 'The law in Karnataka' })).toHaveAttribute('readonly');
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Purpose' })).toHaveValue('<script>alert(1)</script>Purpose');
    const how = screen.getByRole('textbox', { name: 'How to apply' });
    await ue.clear(how);
    await ue.type(how, 'Apply in YukthiX.');
    await ue.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(onSave).toHaveBeenCalledWith('d1', {
      version: 3,
      clauses: [{ id: 'p2', text: 'Apply in YukthiX.' }],
    });
    expect(await screen.findByText('Draft saved')).toBeInTheDocument();
  });

  it('findings fixed: Approve & load asks first, then loads it for a second person (toast) and opens Policy admin', async () => {
    const onApprove = vi.fn().mockResolvedValue({
      policyId: 'pol1',
      code: 'POL-01',
      title: 'Leave policy',
      number: 1,
    });
    const onOpenPolicy = vi.fn();
    show(
      <PolicyWriterScreen
        live={liveWriter({
          draftId: 'd1',
          draft: WRITER_RESOLVED,
          onApprove,
          onOpenPolicy,
        })}
      />,
    );
    await ue.click(screen.getByRole('button', { name: 'Approve & load' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Another person with publish rights (not you)');
    await ue.click(screen.getAllByRole('button', { name: 'Approve & load' }).at(-1)!);
    expect(onApprove).toHaveBeenCalledWith('d1', 3);
    expect(await screen.findByText('Leave policy v1 is waiting to be published')).toBeInTheDocument();
    expect(onOpenPolicy).toHaveBeenCalledWith('pol1');
  });

  it('a refused approval stays in the dialog with the reason', async () => {
    const onApprove = vi.fn().mockRejectedValue(new Error('Leave policy already has v2 being written. Finish or send it back in Policy admin first.'));
    show(
      <PolicyWriterScreen
        live={liveWriter({
          draftId: 'd1',
          draft: WRITER_RESOLVED,
          onApprove,
          start: { approveOpen: true },
        })}
      />,
    );
    await ue.click(screen.getAllByRole('button', { name: 'Approve & load' }).at(-1)!);
    expect(await screen.findByText(/already has v2 being written/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('an approved draft is read-only and says the approver cannot publish it', () => {
    show(
      <PolicyWriterScreen
        live={liveWriter({
          draftId: 'd1',
          draft: {
            ...WRITER_RESOLVED,
            status: 'approved',
            approvedBy: 'Lakshmi Iyer',
            approvedAt: '2026-11-04T06:00:00.000Z',
            approvedByMe: true,
            target: {
              ...WRITER_RESOLVED.target,
              policyId: 'pol1',
              code: 'POL-01',
            },
          },
        })}
      />,
    );
    expect(screen.getByText('Approved by you on 4 Nov 2026')).toBeInTheDocument();
    expect(screen.getByText(/you can’t/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve & load' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'How to apply' })).toHaveAttribute('readonly');
  });

  it('no access and a draft from another company (Not found) show their states', () => {
    const { unmount } = show(<PolicyWriterScreen live={liveWriter({ state: 'no-access', home: null })} />);
    expect(screen.getByText(/HR with policy rights for the whole company/)).toBeInTheDocument();
    unmount();
    show(<PolicyWriterScreen live={liveWriter({ draftId: 'x', draftState: 'error' })} />);
    expect(screen.getByText('We couldn’t load this draft.')).toBeInTheDocument();
  });
});
