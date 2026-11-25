import type { Meta, StoryObj } from '@storybook/react-vite';
import { StepUpDialog } from './mfa';
import { AuthFrame, RecoveryCodes } from './kit';
import { RECOVERY_CODES } from './data';
import { NoAccessState, SalaryCheckContext } from '../../components/feedback';

const meta: Meta = { title: 'Screens/Security/Confirm it’s you', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = (ms = 600) => new Promise<void>((r) => setTimeout(r, ms));
const props = { open: true, onCancel: () => {}, getPasskey: () => wait(), submit: () => wait(), setupHref: '#me-security' };

export const StepUp: S = { name: 'Step-up · passkey and app', render: () => <StepUpDialog {...props} factors={['passkey', 'totp']} /> };
export const StepUpLoading: S = { name: 'Step-up · loading', render: () => <StepUpDialog {...props} factors={null} /> };
export const StepUpNoFactor: S = { name: 'Step-up · nothing set up', render: () => <StepUpDialog {...props} factors={[]} /> };
export const StepUpError: S = {
  name: 'Step-up · wrong code',
  render: () => (
    <StepUpDialog
      {...props}
      factors={['totp']}
      submit={async () => {
        await wait(200);
        throw new Error('That code is not right. Try again.');
      }}
    />
  ),
};
export const StepUpPhone: S = { name: 'Step-up · phone', globals: { viewport: { value: 'phone' } }, render: () => <StepUpDialog {...props} factors={['passkey', 'totp']} /> };

export const Codes: S = {
  name: 'Recovery codes · shown once',
  render: () => (
    <AuthFrame title="Two-step verification is on" subtitle="Last step: keep a way back in.">
      <RecoveryCodes codes={RECOVERY_CODES} onDone={() => {}} doneLabel="Continue" />
    </AuthFrame>
  ),
};
export const CodesPhone: S = { ...Codes, name: 'Recovery codes · phone', globals: { viewport: { value: 'phone' } } };

// Answer 2370: "Confirm it's you" was cancelled on a salary page; the page asks again instead of "no access".
export const SalaryCancelled: S = {
  name: 'Step-up · cancelled on a salary page',
  render: () => (
    <SalaryCheckContext.Provider value={{ cancelled: true, onRetry: () => {} }}>
      <NoAccessState grantedBy="your Payroll Admin" what="pay runs" />
    </SalaryCheckContext.Provider>
  ),
};
