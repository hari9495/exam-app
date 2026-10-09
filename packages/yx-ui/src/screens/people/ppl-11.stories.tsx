import type { Meta, StoryObj } from '@storybook/react-vite';
import { BOARD, OnboardingBoard } from './onboarding';

const meta: Meta = { title: 'Screens/People/PPL-11 · Onboarding board', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Default: S = { name: 'Board with progress rings', render: () => <OnboardingBoard columns={BOARD} /> };
export const Loading: S = { name: '· loading', render: () => <OnboardingBoard columns={BOARD} state="loading" /> };
export const Empty: S = { name: '· empty', render: () => <OnboardingBoard columns={BOARD.map((c) => ({ ...c, cards: [] }))} /> };
