import { composeStories } from '@storybook/react-vite';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import * as ppl15 from './ppl-15.stories';
import * as ppl17 from './ppl-17.stories';
import * as ppl28 from './ppl-28.stories';
import * as ppl30 from './ppl-30.stories';
import * as ppl31 from './ppl-31.stories';
import * as ppl29 from './ppl-29.stories';

// PPL-15 / 17 / 28 / 29: each design story is the one live component (the Change status drawer, the review drawer,
// the issue sheet, the template workspace) with sample data.
const s15 = composeStories(ppl15);
const s17 = composeStories(ppl17);
const s28 = composeStories(ppl28);
const s30 = composeStories(ppl30);
const s31 = composeStories(ppl31);
const s29 = composeStories(ppl29);
// The open template lives in the address (?template=…); each story starts from the list.
afterEach(() => window.history.replaceState(null, '', '/'));
type Story = { (): JSX.Element; play?: (ctx: { canvasElement: HTMLElement }) => Promise<void> };
async function show(S: unknown) {
  const Story = S as Story;
  const { container } = render(<Story />);
  await Story.play?.({ canvasElement: container });
}

describe('PPL-28 issue sheet stories (live = design)', () => {
  it('approval: the sheet offers the type, names who approves', async () => {
    await show(s28.Approval);
    const sheet = within(await screen.findByRole('dialog'));
    expect(sheet.getByText('Issue a letter')).toBeInTheDocument();
    expect(await sheet.findByText('Lakshmi Venkatesan')).toBeInTheDocument();
    expect(sheet.getByRole('button', { name: 'Send for approval' })).toBeInTheDocument();
  });
  it('missing fields: says what to fill on the record, and Issue stays off', async () => {
    await show(s28.Missing);
    const sheet = within(await screen.findByRole('dialog'));
    expect(await sheet.findByText(/Fill these on Arjun's record first/)).toBeInTheDocument();
    expect(sheet.getByRole('button', { name: 'Send for approval' })).toBeDisabled();
  });
});

describe('PPL-29 template workspace stories (live = design)', () => {
  it('upload: the validation report offers the suggestion', async () => {
    await show(s29.Upload);
    expect(await screen.findByRole('button', { name: 'Use suggestion' })).toBeInTheDocument();
    expect(screen.getByText(/emp_nme/)).toBeInTheDocument();
  });
  it('the field cheat-sheet opens on a saved template', async () => {
    await show(s29.Fields);
    expect(await screen.findByText('{{employee_name}}')).toBeInTheDocument();
  });
  it('the editor loads the template made in the app', async () => {
    await show(s29.Editor);
    expect(await screen.findByText(/This is to certify that/)).toBeInTheDocument();
  });
});

describe('PPL-15 Change status stories (live = design)', () => {
  it('withdraw with no reason: the journey record with the drawer open and the error', async () => {
    await show(s15.Withdraw);
    const drawer = within(screen.getByRole('dialog'));
    expect(drawer.getByText('Change pre-boarding for Kavya Reddy')).toBeInTheDocument();
    expect(drawer.getByText(/requisition for Quality Inspector reopens/)).toBeInTheDocument();
    expect(drawer.getByText('Enter a reason. It goes on the withdrawal letter and the audit log.')).toBeInTheDocument();
  });
  it('rehire: says what the unwind leaves alone', async () => {
    await show(s15.Rehire);
    expect(screen.getByText(/Suresh's old employment, code KF-0077 and UAN stay as they were/)).toBeInTheDocument();
  });
});

describe('PPL-17 review stories (live = design)', () => {
  it('extending past the maximum says the limit', async () => {
    await show(s17.ExtendOverLimit);
    expect(await screen.findByText(/Extend by 1 to 6 months/)).toBeInTheDocument();
  });
});

describe('PPL-30 / PPL-31 stories (live = design)', () => {
  it('upload from a row: the fixed type is text, not a control', async () => {
    await show(s30.UploadVersion);
    const dialog = within(await screen.findByRole('dialog', { name: 'Upload Forklift licence' }));
    expect(dialog.queryByRole('combobox')).toBeNull();
  });
  it('upload from the page: Upload pressed with nothing chosen says what is missing', async () => {
    await show(s30.UploadNew);
    expect(await screen.findByText('Choose the document type.')).toBeInTheDocument();
  });
  it('a certificate already waiting: Send to HR says so under the choice', async () => {
    await show(s31.AlreadyWaiting);
    expect(await screen.findByText(/It is still waiting for Lakshmi Venkatesan/)).toBeInTheDocument();
  });
});
