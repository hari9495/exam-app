import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SendSmsModal } from './SendSmsModal';

const sendMutate = jest.fn();
jest.mock('../../../../lib/hooks/useCandidateSms', () => ({
  useSendSms: () => ({ mutate: sendMutate, isPending: false }),
}));
jest.mock('../../../../lib/hooks/useSmsTemplates', () => ({
  useSmsTemplates: () => ({ data: [] }),
}));
jest.mock('../../../../lib/hooks/useSmsConfig', () => ({
  useSmsConfig: () => ({ data: { smsEnabled: true, smsAccountSid: 'AC1', smsFromNumber: '+15550000000', configured: true }, isSuccess: true }),
}));

const toast = jest.fn();
jest.mock('../../../../components/ui', () => ({ useToast: () => ({ toast }) }));

describe('SendSmsModal', () => {
  beforeEach(() => {
    sendMutate.mockClear();
    toast.mockClear();
  });

  it('sends { templateId, body } -- no subject field anywhere in the payload', async () => {
    render(<SendSmsModal entryId="entry-1" candidateId="cand-1" candidateName="Asha" onClose={() => {}} />);

    // fireEvent.change instead of userEvent.type -- curly braces in the body are literal template
    // tokens, not userEvent's special key-sequence syntax.
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'Hi {{candidateName}}, see you soon.' } });
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(sendMutate).toHaveBeenCalledWith(
      { templateId: null, body: 'Hi {{candidateName}}, see you soon.' },
      expect.anything(),
    );
    const [payload] = sendMutate.mock.calls[0];
    expect(payload).not.toHaveProperty('subject');
  });

  it('pre-fills the body from an initial pendingSmsMessage without requiring a template pick', () => {
    render(
      <SendSmsModal
        entryId="entry-1"
        candidateId="cand-1"
        candidateName="Asha"
        onClose={() => {}}
        initial={{ templateId: 'tpl-1', body: 'Moving you to interview.' }}
      />,
    );
    expect(screen.getByLabelText('Body')).toHaveValue('Moving you to interview.');
  });
});
