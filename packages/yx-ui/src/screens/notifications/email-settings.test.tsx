import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmailSettingsScreen, brandingErrors, contrastWithWhite, type EmailSettingsScreenProps } from './email-settings';
import { EMAIL_OVERVIEW, EMAIL_PREVIEW_HTML } from './data';

const preview = vi.fn().mockResolvedValue({ subject: 'Reset your Kaveri Foods password', html: EMAIL_PREVIEW_HTML, fromName: 'Kaveri Foods via YukthiX', to: 'arjun@kaveri.example' });

function Screen(over: Partial<EmailSettingsScreenProps>) {
  return (
    <EmailSettingsScreen
      state="ready"
      overview={EMAIL_OVERVIEW}
      onSaveBranding={vi.fn().mockResolvedValue(undefined)}
      onSaveWording={vi.fn().mockResolvedValue(undefined)}
      onResetWording={vi.fn().mockResolvedValue(undefined)}
      onPreview={preview}
      onTest={vi.fn().mockResolvedValue({ to: 'arjun@kaveri.example' })}
      {...over}
    />
  );
}

describe('EmailSettingsScreen', () => {
  it('lists the emails by group with whose wording each uses', () => {
    render(<Screen />);
    expect(screen.getByRole('heading', { name: 'Emails' })).toBeTruthy();
    const account = screen.getByRole('table', { name: 'Your account' });
    expect(within(account).getByText('Invitation')).toBeTruthy();
    expect(within(account).getByText('Your wording')).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'Sign-in codes' })).getByText('YukthiX wording')).toBeTruthy();
  });

  it('edits one email: shows what is locked, previews the draft in a sandboxed frame, adds a placeholder at the cursor and saves', async () => {
    const ue = userEvent.setup();
    const onSaveWording = vi.fn().mockResolvedValue(undefined);
    render(<Screen onSaveWording={onSaveWording} />);
    await ue.click(screen.getByRole('button', { name: 'Edit Password reset' }));
    expect(screen.getByRole('heading', { name: 'Password reset' })).toBeTruthy();
    expect(screen.getByText(/Where the button goes · How long the link works/)).toBeTruthy();
    const frame = await screen.findByTitle('Preview of Password reset');
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(screen.getByText('Kaveri Foods via YukthiX')).toBeTruthy();

    const heading = screen.getByLabelText(/^Heading/);
    await ue.clear(heading);
    await ue.type(heading, 'Hello ');
    await ue.click(screen.getByRole('button', { name: /Add First name/ }));
    expect((heading as HTMLInputElement).value).toBe('Hello {{firstName}}');
    await waitFor(() => expect(preview).toHaveBeenLastCalledWith('password_reset', { wording: expect.objectContaining({ heading: 'Hello {{firstName}}' }) }));

    await ue.click(screen.getByRole('button', { name: 'Save wording' }));
    expect(onSaveWording).toHaveBeenCalledWith('password_reset', expect.objectContaining({ heading: 'Hello {{firstName}}', buttonLabel: 'Reset password' }));
    expect(await screen.findByText(/The next password reset email uses your wording/)).toBeTruthy();
  });

  it('shows the API’s problem next to the field, sends a test to the admin and resets custom wording after confirming', async () => {
    const ue = userEvent.setup();
    const bad = Object.assign(new Error('Some fields need changes.'), { body: { errors: { subject: "{{code}} can't be used in this email." } } });
    const onResetWording = vi.fn().mockResolvedValue(undefined);
    render(<Screen onSaveWording={vi.fn().mockRejectedValue(bad)} onResetWording={onResetWording} />);
    await ue.click(screen.getByRole('button', { name: 'Edit Invitation' }));
    const subject = screen.getByLabelText(/^Subject/);
    await ue.type(subject, ' {{code}}');
    await ue.click(screen.getByRole('button', { name: 'Save wording' }));
    expect(await screen.findByText("{{code}} can't be used in this email.")).toBeTruthy();

    await ue.click(screen.getByRole('button', { name: 'Send me a test' }));
    expect(await screen.findByText(/Test sent to arjun@kaveri.example/)).toBeTruthy();

    await ue.click(screen.getByRole('button', { name: 'Reset to YukthiX wording' }));
    await ue.click(within(await screen.findByRole('dialog', { name: /Reset Invitation/ })).getByRole('button', { name: 'Reset wording' }));
    expect(onResetWording).toHaveBeenCalledWith('invite');
  });

  it('branding: an unreadable button colour or a YukthiX-looking sender name is refused before saving', async () => {
    const ue = userEvent.setup();
    const onSaveBranding = vi.fn().mockResolvedValue(undefined);
    render(<Screen onSaveBranding={onSaveBranding} />);
    await ue.type(screen.getByPlaceholderText('#3B5FE3'), '#FFD966');
    await ue.type(screen.getByPlaceholderText('Kaveri Foods HR'), 'Kaveri People');
    expect(screen.getByText('People see: Kaveri People via YukthiX. Emails always come from YukthiX’s own address.')).toBeTruthy();
    await ue.click(screen.getByRole('button', { name: 'Save branding' }));
    expect(screen.getByText(/hard to read on this colour/)).toBeTruthy();
    expect(onSaveBranding).not.toHaveBeenCalled();
    const colour = screen.getByPlaceholderText('#3B5FE3');
    await ue.clear(colour);
    await ue.type(colour, '#0b6e4f');
    await ue.click(screen.getByRole('button', { name: 'Save branding' }));
    expect(onSaveBranding).toHaveBeenCalledWith({ showLogo: true, accentColor: '#0B6E4F', senderName: 'Kaveri People', replyTo: null });
  });

  it('rules mirror the API', () => {
    expect(contrastWithWhite('#3B5FE3')).toBeGreaterThan(4.5);
    expect(contrastWithWhite('#FFD966')).toBeLessThan(4.5);
    expect(brandingErrors({ showLogo: true, accentColor: null, senderName: 'YukthiX Payroll', replyTo: 'nope' })).toEqual({ senderName: expect.any(String), replyTo: 'Enter a valid email address' });
    expect(brandingErrors({ showLogo: true, accentColor: null, senderName: 'secure-bank.example', replyTo: null })).toEqual({ senderName: 'Use a name, not a web address.' });
    expect(brandingErrors({ showLogo: true, accentColor: '#0B6E4F', senderName: 'Kaveri Foods Pvt. Ltd.', replyTo: 'hr@kaveri.example' })).toEqual({});
  });
});
