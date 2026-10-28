import type { Meta, StoryObj } from '@storybook/react-vite';
import { PreboardingBatches } from './onboarding';
import { BATCHES } from './people-data';
import { AddMembersDialog, BatchDialog } from './live/special';
import { ENTITY_CHOICES, LIVE_BATCH, TODAY_KEY, WAITING_JOINERS } from './people-data';
import { clear, date, fails, ok, pick, play, press, tick, type } from './popup-play';

const meta: Meta = { title: 'Screens/People/PPL-14 · Pre-boarding batches', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Default: S = { name: 'Campus batches', render: () => <PreboardingBatches rows={BATCHES} /> };
export const ChangeDate: S = { name: 'Change batch joining date (re-anchor)', render: () => <PreboardingBatches rows={BATCHES} defaultChangeId="b3" defaultDate={new Date(2026, 10, 2)} /> };
export const ChangeDateNoReason: S = { name: 'Change batch joining date · Move pressed with no reason', render: () => <PreboardingBatches rows={BATCHES} defaultChangeId="b3" defaultDate={new Date(2026, 10, 2)} />, play: play(press('Move 12 members')) };
export const ChangeDateSameDay: S = { name: 'Change batch joining date · Move pressed on the same day', render: () => <PreboardingBatches rows={BATCHES} defaultChangeId="b3" />, play: play(press('Move 12 members')) };
export const Empty: S = { name: '· empty', render: () => <PreboardingBatches rows={[]} /> };

// New batch / Change the batch and Add joiners (People › Batches): the live dialogs with sample data.
const batch = (b: typeof LIVE_BATCH | null, onSave: Parameters<typeof BatchDialog>[0]['onSave'] = ok) => <BatchDialog batch={b} entities={ENTITY_CHOICES} today={TODAY_KEY} onClose={() => undefined} onSave={onSave} />;
const fillBatch = [type(/^Name/, 'Campus 2027 · Quality trainees'), pick('Legal entity', 'Kaveri Foods Pvt Ltd (Tamil Nadu)'), date('Joining day', '01 Jul 2027'), press('Add a touchpoint'), date('Touchpoint 1 day', '01 Jun 2027'), type(/^Touchpoint 1(?! day)/, 'Welcome call')];
export const NewBatch: S = { name: 'New batch · open', render: () => batch(null) };
export const NewBatchFilled: S = { name: 'New batch · filled', render: () => batch(null), play: play(...fillBatch) };
export const NewBatchMissing: S = { name: 'New batch · Save pressed with nothing filled', render: () => batch(null), play: play(press('Add a touchpoint'), press('Save batch')) };
export const NewBatchFailed: S = { name: 'New batch · the server refuses', render: () => batch(null, fails('A batch with this name already exists for this legal entity.')), play: play(...fillBatch, press('Save batch')) };
export const ChangeBatch: S = { name: 'Change the batch · day moved, reason asked', render: () => batch(LIVE_BATCH), play: play(clear('Joining day'), date('Joining day', '02 Nov 2026'), press('Save batch')) };
const members = (joiners = WAITING_JOINERS, onAdd: Parameters<typeof AddMembersDialog>[0]['onAdd'] = ok) => <AddMembersDialog batch={LIVE_BATCH} joiners={joiners} onClose={() => undefined} onAdd={onAdd} />;
export const AddMembers: S = { name: 'Add joiners · open', render: () => members() };
export const AddMembersPicked: S = { name: 'Add joiners · two picked', render: () => members(), play: play(tick(/Rahul Verma/), tick(/Meena Iyer/)) };
export const AddMembersMissing: S = { name: 'Add joiners · nobody picked, Add pressed', render: () => members(), play: play(press('Add joiners')) };
export const AddMembersNone: S = { name: 'Add joiners · nobody waiting, Add pressed', render: () => members([]), play: play(press('Add joiners')) };
export const AddMembersFailed: S = { name: 'Add joiners · the server refuses', render: () => members(WAITING_JOINERS, fails('Rahul Verma joins another legal entity.')), play: play(tick(/Rahul Verma/), press('Add joiners')) };
