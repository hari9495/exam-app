import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import {
  AutosaveIndicator,
  ExamShell,
  ExamTimer,
  QuestionNavigator,
  countQuestions,
  formatClock,
  timerAnnouncement,
  timerPhase,
  type ExamQuestionState,
} from './exam';
import { CareersPage, PageBuilder, contrastWithWhite, moveSection, normaliseHex, resolveTenantAccent, type CareersConfig } from './careers';
import { LetterDocument, maskTail, numberToIndianWords } from './print';
import { Logo, PoweredBy } from './brand';

const Q = (answered: boolean, markedForReview = false): ExamQuestionState => ({ answered, markedForReview });

// Regression: the letter body was a raw-HTML sink (dangerouslySetInnerHTML). Content is React
// nodes now, so markup arriving as text -- a tenant template, a name -- is shown, never run.
describe('LetterDocument', () => {
  it('renders HTML-looking text as text, never as markup', () => {
    const payload = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const { container } = render(
      <LetterDocument
        data={{
          company: { name: 'Acme', address: ['1 Road'] },
          date: new Date('2026-10-06'),
          reference: 'R/1',
          recipient: { name: payload, lines: [] },
          subject: 'Offer',
          body: <p>{payload}</p>,
          signatory: { name: 'P', designation: 'HR' },
        }}
      />,
    );
    expect(container.querySelector('img, script')).toBeNull();
    expect(screen.getAllByText(payload, { exact: false }).length).toBeGreaterThan(0);
  });
});

describe('ExamTimer', () => {
  it('formats mm:ss and switches phase at 5 minutes and 1 minute', () => {
    expect(formatClock(5400)).toBe('90:00');
    expect(formatClock(301)).toBe('05:01');
    expect(formatClock(-3)).toBe('00:00');
    expect(timerPhase(301)).toBe('normal');
    expect(timerPhase(300)).toBe('warning');
    expect(timerPhase(61)).toBe('warning');
    expect(timerPhase(60)).toBe('final');
  });

  it('announces only at the 5-minute and 1-minute thresholds', () => {
    const seen = new Set([900, 600, 301, 300, 299, 120, 61, 60, 30, 0].map(timerAnnouncement));
    expect([...seen]).toEqual(['', '5 minutes left', '1 minute left']);
  });

  it('shows warning tone with words and a live region that changes only at thresholds', () => {
    const { container, rerender } = render(<ExamTimer seconds={301} />);
    const timer = container.querySelector('.yx-exam-timer')!;
    const live = screen.getByRole('status');
    expect(timer).toHaveAttribute('data-phase', 'normal');
    expect(live).toHaveTextContent('');
    expect(screen.getByText('05:01')).toBeInTheDocument();

    rerender(<ExamTimer seconds={300} />);
    expect(timer).toHaveAttribute('data-phase', 'warning');
    expect(live).toHaveTextContent('5 minutes left');

    rerender(<ExamTimer seconds={200} />);
    expect(live).toHaveTextContent('5 minutes left'); // unchanged: no new announcement

    rerender(<ExamTimer seconds={60} />);
    expect(live).toHaveTextContent('1 minute left');
  });
});

describe('AutosaveIndicator', () => {
  it('shows saving, saved with 12-hour time, and offline states', () => {
    const { rerender } = render(<AutosaveIndicator status="saving" />);
    expect(screen.getByRole('status')).toHaveTextContent('Saving…');
    rerender(<AutosaveIndicator status="saved" savedAt="10:42" />);
    expect(screen.getByRole('status')).toHaveTextContent('Saved 10:42 am');
    rerender(<AutosaveIndicator status="offline" />);
    expect(screen.getByRole('status')).toHaveTextContent('Offline — answers kept on this device, will sync');
  });
});

describe('QuestionNavigator', () => {
  const qs = [Q(true), Q(false), Q(true, true), Q(false, true), Q(true), Q(false)];

  it('counts each status once, and unanswered includes marked-for-review without an answer', () => {
    expect(countQuestions(qs)).toEqual({ answered: 2, notAnswered: 2, review: 2, unanswered: 3 });
  });

  it('labels every button with its status and shows legend counts', () => {
    render(<QuestionNavigator questions={qs} current={1} onNavigate={() => {}} />);
    expect(screen.getByRole('button', { name: 'Question 1, answered' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Question 2, not answered, current' })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('button', { name: 'Question 3, marked for review' })).toBeInTheDocument();
    const legend = screen.getByRole('list', { name: 'Summary' });
    expect(within(legend).getByText('Answered').closest('li')).toHaveTextContent('Answered 2');
    expect(within(legend).getByText('Not answered').closest('li')).toHaveTextContent('Not answered 2');
    expect(within(legend).getByText('Marked for review').closest('li')).toHaveTextContent('Marked for review 2');
  });

  it('moves with arrow keys (roving focus) and opens with Enter', async () => {
    const u = userEvent.setup();
    const onNavigate = vi.fn();
    render(<QuestionNavigator questions={qs} current={0} onNavigate={onNavigate} columns={3} />);
    const first = screen.getByRole('button', { name: /Question 1,/ });
    expect(first).toHaveAttribute('tabindex', '0');
    first.focus();
    await u.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: /Question 2,/ })).toHaveFocus();
    await u.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: /Question 5,/ })).toHaveFocus();
    await u.keyboard('{End}');
    expect(screen.getByRole('button', { name: /Question 6,/ })).toHaveFocus();
    await u.keyboard('{Enter}');
    expect(onNavigate).toHaveBeenCalledWith(5);
  });

  it('finish confirmation lists the unanswered count and finishes only on confirm', async () => {
    const u = userEvent.setup();
    const onFinish = vi.fn();
    render(
      <ExamShell testName="Accounts executive aptitude" candidateName="Meera Iyer" seconds={1200} saveStatus="saved" savedAt="10:42" questions={qs} current={0} onNavigate={() => {}} onFinish={onFinish}>
        <p>Question</p>
      </ExamShell>,
    );
    await u.click(screen.getByRole('button', { name: 'Finish test' }));
    const dialog = screen.getByRole('dialog', { name: 'Finish the test?' });
    expect(dialog).toHaveTextContent('You have 3 unanswered questions and 2 questions marked for review.');
    await u.click(within(dialog).getByRole('button', { name: 'Keep answering' }));
    expect(onFinish).not.toHaveBeenCalled();
    await u.click(screen.getByRole('button', { name: 'Finish test' }));
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Finish test' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

describe('Tenant accent contrast', () => {
  it('normalises hex input', () => {
    expect(normaliseHex('1f6f4a')).toBe('#1F6F4A');
    expect(normaliseHex('#abc')).toBe('#AABBCC');
    expect(normaliseHex('green')).toBeNull();
  });

  it('accepts dark accents and falls back for light or invalid ones', () => {
    expect(contrastWithWhite('#000000')).toBeCloseTo(21, 0);
    expect(resolveTenantAccent('#1F6F4A')).toMatchObject({ accent: '#1F6F4A' });
    const light = resolveTenantAccent('F5B400');
    expect(light.accent).toBeNull();
    expect(light.reason).toBe('too-light');
    expect(light.ratio).toBeLessThan(4.5);
    expect(resolveTenantAccent('not a colour')).toEqual({ accent: null, ratio: null, reason: 'invalid' });
    expect(resolveTenantAccent(undefined)).toEqual({ accent: null, ratio: null });
  });

  it('sets --yx-tenant-accent only when the accent passes', () => {
    const base: CareersConfig = { companyName: 'Nilgiri Foods', theme: 'classic', sections: [{ id: 'about-1', type: 'about', title: 'About us', text: 'We make biscuits in Coimbatore.' }] };
    const { container, rerender } = render(<CareersPage config={{ ...base, accent: '#1F6F4A' }} jobs={[]} />);
    const root = container.querySelector('.yx-careers') as HTMLElement;
    expect(root.style.getPropertyValue('--yx-tenant-accent')).toBe('#1F6F4A');
    expect(root).toHaveAttribute('data-accent', 'tenant');
    rerender(<CareersPage config={{ ...base, accent: '#F5B400' }} jobs={[]} />);
    expect(root.style.getPropertyValue('--yx-tenant-accent')).toBe('');
    expect(root).toHaveAttribute('data-accent', 'default');
    expect(root).toHaveAttribute('data-accent-fallback');
  });
});

describe('numberToIndianWords', () => {
  it.each([
    [0, 'Rupees Zero only'],
    [15, 'Rupees Fifteen only'],
    [100000, 'Rupees One lakh only'],
    [112450, 'Rupees One lakh twelve thousand four hundred fifty only'],
    [123456789, 'Rupees Twelve crore thirty-four lakh fifty-six thousand seven hundred eighty-nine only'],
    [1234.5, 'Rupees One thousand two hundred thirty-four and fifty paise only'],
    [0.75, 'Seventy-five paise only'],
    [99.999, 'Rupees One hundred only'],
    [1000000000, 'Rupees One hundred crore only'],
  ])('%d -> %s', (n, words) => {
    expect(numberToIndianWords(n)).toBe(words);
  });

  it('masks identifiers to the last four characters', () => {
    expect(maskTail('ABCDE1234F')).toBe('XXXXXX234F');
    expect(maskTail('1001 2345 6789')).toBe('XXXXXXXX6789');
  });
});

const BUILDER_CONFIG: CareersConfig = {
  companyName: 'Nilgiri Foods',
  theme: 'classic',
  sections: [
    { id: 'hero-1', type: 'hero', title: 'Bake with us', text: 'Join 1,200 people across three plants.' },
    { id: 'benefits-1', type: 'benefits', title: 'Benefits', items: [{ icon: 'health', title: 'Health cover', text: '₹5,00,000 family floater' }] },
    { id: 'jobs-1', type: 'jobs', title: 'Open jobs' },
    { id: 'footer-1', type: 'footer', title: 'Contact', text: 'Coimbatore' },
  ],
};

function Builder({ onChange }: { onChange?: (c: CareersConfig) => void }) {
  const [c, setC] = useState(BUILDER_CONFIG);
  return (
    <PageBuilder
      value={c}
      onChange={(n) => {
        setC(n);
        onChange?.(n);
      }}
      jobs={[]}
      status="draft"
    />
  );
}

describe('PageBuilder', () => {
  it('moveSection is pure and ignores impossible moves', () => {
    const s = BUILDER_CONFIG.sections;
    expect(moveSection(s, 'jobs-1', -1).map((x) => x.id)).toEqual(['hero-1', 'jobs-1', 'benefits-1', 'footer-1']);
    expect(moveSection(s, 'hero-1', -1)).toBe(s);
    expect(s.map((x) => x.id)).toEqual(['hero-1', 'benefits-1', 'jobs-1', 'footer-1']);
  });

  it('moves sections up and down with buttons and Alt + arrows, and announces it', async () => {
    const u = userEvent.setup();
    const { container } = render(<Builder />);
    const rows = () => Array.from(container.querySelectorAll('.yx-page-builder__row-name')).map((n) => n.textContent);
    expect(rows()).toEqual(['Hero', 'Benefits', 'Open jobs', 'Footer']);
    expect(screen.getByRole('button', { name: 'Move Hero up' })).toBeDisabled();

    await u.click(screen.getByRole('button', { name: 'Move Open jobs up' }));
    expect(rows()).toEqual(['Hero', 'Open jobs', 'Benefits', 'Footer']);
    expect(container.querySelector('[role="status"].yx-visually-hidden')).toHaveTextContent('Open jobs moved to position 2 of 4');

    await u.click(screen.getByRole('button', { name: 'Move Hero down' }));
    expect(rows()).toEqual(['Open jobs', 'Hero', 'Benefits', 'Footer']);

    const benefits = screen.getByRole('button', { name: /^Benefits/ });
    benefits.focus();
    fireEvent.keyDown(benefits, { key: 'ArrowUp', altKey: true });
    expect(rows()).toEqual(['Open jobs', 'Benefits', 'Hero', 'Footer']);
  });

  it('hides and shows a section; hidden sections leave the preview', async () => {
    const u = userEvent.setup();
    const { container } = render(<Builder />);
    const preview = container.querySelector('.yx-page-builder__frame')!;
    expect(within(preview as HTMLElement).getByRole('heading', { name: 'Benefits' })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Hide Benefits' }));
    expect(within(preview as HTMLElement).queryByRole('heading', { name: 'Benefits' })).not.toBeInTheDocument();
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Show Benefits' }));
    expect(within(preview as HTMLElement).getByRole('heading', { name: 'Benefits' })).toBeInTheDocument();
  });

  it('removes a section only after confirmation', async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    render(<Builder onChange={onChange} />);
    await u.click(screen.getByRole('button', { name: 'Remove Benefits' }));
    const group = screen.getByRole('group', { name: 'Remove Benefits' });
    await u.click(within(group).getByRole('button', { name: 'Cancel' }));
    expect(onChange).not.toHaveBeenCalled();
    await u.click(screen.getByRole('button', { name: 'Remove Benefits' }));
    await u.click(within(screen.getByRole('group', { name: 'Remove Benefits' })).getByRole('button', { name: 'Remove' }));
    expect(onChange.mock.calls.at(-1)![0].sections.map((s: { id: string }) => s.id)).toEqual(['hero-1', 'jobs-1', 'footer-1']);
  });
});

describe('Brand placeholders', () => {
  it('has one accessible name and hides Powered by when white-labelled', () => {
    render(<Logo />);
    expect(screen.getByRole('img', { name: 'YukthiX' })).toBeInTheDocument();
    const { container } = render(<PoweredBy whiteLabel />);
    expect(container).toBeEmptyDOMElement();
    render(<PoweredBy />);
    expect(screen.getByRole('link', { name: 'Powered by YukthiX' })).toBeInTheDocument();
  });
});
