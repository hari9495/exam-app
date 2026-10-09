import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReadyToOnboardQueue } from './onboarding';
import { READY_TO_ONBOARD } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-12 · Ready to onboard', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Queue: S = { name: 'Queue by person type', render: () => <ReadyToOnboardQueue rows={READY_TO_ONBOARD} /> };
export const CreateNew: S = { name: 'Create employee (new person)', render: () => <ReadyToOnboardQueue rows={READY_TO_ONBOARD} defaultOpenId="r4" /> };
export const Rehire: S = { name: 'Create employee (rehire impact preview)', render: () => <ReadyToOnboardQueue rows={READY_TO_ONBOARD} defaultOpenId="r2" /> };
export const RehireOverride: S = { name: 'Rehire with an override (reason required)', render: () => <ReadyToOnboardQueue rows={READY_TO_ONBOARD} defaultOpenId="r2" overridden /> };
export const Conversion: S = { name: 'Contract worker conversion', render: () => <ReadyToOnboardQueue rows={READY_TO_ONBOARD} defaultOpenId="r3" /> };
export const Empty: S = { name: '· empty', render: () => <ReadyToOnboardQueue rows={[]} /> };
