import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { ProbationQueue } from './onboarding';
import { PROBATIONS, TODAY } from './people-data';
import { ME } from '../_kit/data';

// PPL-17: the review opens in the probation queue's drawer (as in the app), here on Rohit, Divya's report.
const meta: Meta = { title: 'Screens/People/PPL-17 · Probation review', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };
const review = () => <ProbationQueue rows={PROBATIONS.filter((p) => p.manager === ME.name)} today={TODAY} persona="mgr" defaultOpenId="p6" />;
const pick =
  (outcome: RegExp, then?: (dlg: ReturnType<typeof within>) => Promise<void>): S['play'] =>
  async ({ canvasElement }) => {
    const dlg = within(await within(canvasElement.ownerDocument.body).findByRole('dialog'));
    await userEvent.click(dlg.getByRole('radio', { name: outcome }));
    if (then) await then(dlg);
  };
const overLimit = pick(/Extend/, async (dlg) => {
  await userEvent.type(dlg.getByRole('textbox', { name: /Extend by/ }), '9');
  await userEvent.click(dlg.getByRole('button', { name: 'Extend probation' }));
});

export const Confirm: S = { name: 'Manager · confirm', render: review };
export const ExtendOverLimit: S = { name: 'Extend beyond the policy maximum', render: review, play: overLimit };
export const Terminate: S = { name: 'End employment (goes to HR)', render: review, play: pick(/Recommend ending employment/) };
export const Phone: S = { name: '· phone', ...phone, render: review };
export const PhoneExtend: S = { name: '· phone, extend 3 months', ...phone, render: review, play: pick(/Extend/, async (dlg) => userEvent.type(dlg.getByRole('textbox', { name: /Extend by/ }), '3')) };
