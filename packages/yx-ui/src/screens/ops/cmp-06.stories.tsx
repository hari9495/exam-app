import type { Meta, StoryObj } from '@storybook/react-vite';
import { Form16BulkScreen } from './compliance';
import { F16_ROWS } from './compliance-data';

const meta: Meta = { title: 'Screens/Compliance/CMP-06 · Form 16 bulk', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const PartA: S = { name: 'Part A import (1 missing)', render: () => <Form16BulkScreen rows={F16_ROWS} /> };
export const WrongQuarter: S = { name: 'Q2 return linked · blocked', render: () => <Form16BulkScreen rows={F16_ROWS} current="q4" q2Linked /> };
export const Sign: S = { name: 'Sign with DSC', render: () => <Form16BulkScreen rows={F16_ROWS} current="sign" /> };
export const Publish: S = { name: 'Publish', render: () => <Form16BulkScreen rows={F16_ROWS} current="publish" /> };
export const NotYetAvailable: S = { name: 'Form 130 · not available yet', render: () => <Form16BulkScreen rows={[]} notYet /> };
