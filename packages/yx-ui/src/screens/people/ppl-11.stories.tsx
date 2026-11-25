import type { Meta, StoryObj } from '@storybook/react-vite';
import { BOARD, OnboardingBoard } from './onboarding';
import { AddJoinerDrawer, ImportDrawer } from './live/lifecycle';
import { IMPORT_CSV, IMPORT_PREVIEW, JOINER_PLACES, TODAY_KEY } from './people-data';
import { date, fails, ok, pick, play, press, type } from './popup-play';

const meta: Meta = { title: 'Screens/People/PPL-11 · Onboarding board', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Default: S = { name: 'Board with progress rings', render: () => <OnboardingBoard columns={BOARD} /> };
export const Loading: S = { name: '· loading', render: () => <OnboardingBoard columns={BOARD} state="loading" /> };
export const Empty: S = { name: '· empty', render: () => <OnboardingBoard columns={BOARD.map((c) => ({ ...c, cards: [] }))} /> };

// Add a joiner and Import joiners (People › Onboarding): the live drawers with sample data.
const addJoiner = (onAdd: Parameters<typeof AddJoinerDrawer>[0]['onAdd'] = ok) => <AddJoinerDrawer places={JOINER_PLACES} today={TODAY_KEY} onClose={() => undefined} onAdd={onAdd} />;
const fillJoiner = [type(/^First name/, 'Kavya'), type(/^Last name/, 'Reddy'), type(/^Personal email/, 'kavya.r@mail.test'), type(/^Mobile/, '+91 98450 22233'), date('Joining day', '05 Oct 2026'), pick('Legal entity', 'Kaveri Foods Pvt Ltd (Tamil Nadu)'), pick('Location', 'Hosur plant'), pick('Department', 'Quality'), pick('Designation', 'Quality Analyst'), pick('Employment type', 'Permanent'), pick('Manager', /Divya Raghunathan/)];
export const AddJoiner: S = { name: 'Add a joiner · open', render: () => addJoiner() };
export const AddJoinerFilled: S = { name: 'Add a joiner · filled', render: () => addJoiner(), play: play(...fillJoiner) };
export const AddJoinerMissing: S = { name: 'Add a joiner · Add pressed with nothing filled', render: () => addJoiner(), play: play(type(/^Personal email/, 'kavya.r@'), press('Add joiner')) };
export const AddJoinerFailed: S = { name: 'Add a joiner · the server refuses', render: () => addJoiner(fails('Kavya Reddy is already waiting to join on 5 Oct 2026.')), play: play(...fillJoiner, press('Add joiner')) };
const importJoiners = (onImport: Parameters<typeof ImportDrawer>[0]['onImport'] = async () => IMPORT_PREVIEW) => <ImportDrawer onClose={() => undefined} onImport={onImport} onDone={() => undefined} />;
export const Import: S = { name: 'Import joiners · open', render: () => importJoiners() };
export const ImportMissing: S = { name: 'Import joiners · Check pressed with no file', render: () => importJoiners(), play: play(press('Check the file')) };
export const ImportChecked: S = { name: 'Import joiners · checked: 2 ready, 1 problem', render: () => importJoiners(), play: play(type(/^Or paste the rows/, IMPORT_CSV), press('Check the file')) };
export const ImportFailed: S = { name: 'Import joiners · the file could not be read', render: () => importJoiners(fails('Line 1 must be the column names.')), play: play(type(/^Or paste the rows/, 'Kavya,Reddy'), press('Check the file')) };
