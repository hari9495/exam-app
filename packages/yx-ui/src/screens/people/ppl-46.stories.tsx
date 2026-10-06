import type { Meta, StoryObj } from '@storybook/react-vite';
import { InternationalBankPhone, InternationalBankTab, PersonWorkspace } from './record';
import { SPLITS, TODAY } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-46 · International bank details', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const SplitPay: S = { name: 'HR · IBAN and split pay across 3 accounts', render: () => <InternationalBankTab persona="hr" splits={SPLITS} net={49812} /> };
export const OnPayTab: S = { name: 'On the Pay tab', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} defaultTab="pay" international /> };
export const InvalidIban: S = { name: 'Invalid IBAN and BIC', render: () => <InternationalBankTab persona="hr" splits={SPLITS} net={49812} defaultIban="AE07 0331 2345 6789 0123 457" defaultBic="ECB1" /> };
export const OverSplit: S = { name: 'Split more than net pay', render: () => <InternationalBankTab persona="hr" splits={[SPLITS[0], { ...SPLITS[1], value: 45000 }, { ...SPLITS[2], value: 40 }]} net={49812} /> };
export const Phone: S = { name: 'Employee · phone', ...phone, render: () => <InternationalBankPhone /> };
export const PhoneInvalid: S = { name: 'Employee · phone, invalid IBAN', ...phone, render: () => <InternationalBankPhone defaultIban="AE07 0331" /> };
