import { composeStories } from '@storybook/react-vite';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as ppl03 from './ppl-03.stories';

// PPL-03 record dialogs as their stories draw them (the stories are the live dialogs with sample data).
const s = composeStories(ppl03);
type Story = { (): JSX.Element; play?: (ctx: { canvasElement: HTMLElement }) => Promise<void> };
async function show(S: Story) {
  const { container } = render(<S />);
  await S.play?.({ canvasElement: container });
}

describe('PPL-03 record dialog stories', () => {
  it('work phone: a wrong number shows the error on the field; a refusal stays in the dialog', async () => {
    await show(s.WorkPhoneWrong as Story);
    expect((await screen.findAllByText(/Enter the number with the country code/)).length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: /Work phone/ }));
  });
  it('work phone refused', async () => {
    await show(s.WorkPhoneFailed as Story);
    expect(await screen.findByText('You can change the work phone only for people in your scope.')).toBeInTheDocument();
  });
  it('ask for a document: nothing chosen, the error; refused, the message', async () => {
    await show(s.AskDocumentMissing as Story);
    expect((await screen.findAllByText('Choose the document to ask for.')).length).toBeGreaterThan(0);
  });
  it('ask for a document refused', async () => {
    await show(s.AskDocumentFailed as Story);
    expect(await screen.findByText('Arjun already has an open request for the PAN card.')).toBeInTheDocument();
  });
  it('send back: no reason, the error; refused, the message', async () => {
    await show(s.SendBackMissing as Story);
    expect((await screen.findAllByText('Choose a reason.')).length).toBeGreaterThan(0);
  });
  it('send back refused', async () => {
    await show(s.SendBackFailed as Story);
    expect(await screen.findByText('This document was already verified by Priya Nair.')).toBeInTheDocument();
  });
  it('upload: nothing chosen, the document error; a passport asks for the expiry date', async () => {
    await show(s.UploadForMissing as Story);
    expect((await screen.findAllByText('Choose the document.')).length).toBeGreaterThan(0);
  });
  it('upload: passport shows the expiry date field', async () => {
    await show(s.UploadForExpiry as Story);
    expect(await screen.findByRole('textbox', { name: /Expiry date/ })).toBeInTheDocument();
  });
});
