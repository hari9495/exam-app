import type { Meta, StoryObj } from '@storybook/react-vite';
import { DisabilityDeclaration, DisabilityPhone } from './selfservice';

const meta: Meta = { title: 'Screens/People/PPL-38 · Disability declaration', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Form: S = { name: 'Employee · consent first', render: () => <DisabilityDeclaration /> };
export const Declared: S = { name: 'Employee · declared (withdraw)', render: () => <DisabilityDeclaration declared /> };
export const Hr: S = { name: 'HR diversity role · list', render: () => <DisabilityDeclaration persona="hr" /> };
export const Phone: S = { name: '· phone', ...phone, render: () => <DisabilityPhone /> };
