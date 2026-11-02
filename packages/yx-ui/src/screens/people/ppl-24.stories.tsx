import type { Meta, StoryObj } from '@storybook/react-vite';
import { AbscondingTimeline, DispatchProofDialog, StartAbscondingDialog } from './exits';
import { date, fails, ok, pick, play, press, type } from './popup-play';
import { d, TODAY } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-24 · Absconding timeline', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Running: S = { name: 'Running (day 9, notice 1 sent)', render: () => <AbscondingTimeline today={TODAY} /> };
export const StopDialog: S = { name: 'Stop with reason', render: () => <AbscondingTimeline today={TODAY} stopOpen /> };
export const Stopped: S = { name: 'Stopped (returned)', render: () => <AbscondingTimeline today={TODAY} stopped /> };
export const Deemed: S = { name: 'Deemed abandonment (day 23)', render: () => <AbscondingTimeline today={d(2026, 10, 13)} /> };

// HR's dialogs on the page (the live ones): start a timeline, and the dispatch proof of a notice sent by registered post.
const PEOPLE = [{ value: 'rd', label: 'Rohit Das, Warehouse Associate' }, { value: 'ak', label: 'Arjun Kulkarni, Senior Quality Inspector' }];
const start = (onStart: (id: string, last: string) => Promise<void> = ok) => <StartAbscondingDialog people={PEOPLE} today={TODAY} onStart={onStart} onClose={() => undefined} />;
export const Start: S = { name: 'Start a timeline · open', render: () => start() };
export const StartMissing: S = { name: 'Start a timeline · Start pressed with nothing filled', render: () => start(), play: play(press('Start timeline')) };
export const StartFailed: S = { name: 'Start a timeline · the server refuses (one already running)', render: () => start(fails('A timeline is already running for this person.')), play: play(pick('Person', /Rohit Das/), date('Last day present', '19 Sep 2026'), press('Start timeline')) };
const proof = (onSave: (ref: string) => Promise<void> = ok) => <DispatchProofDialog name="Rohit Das" notice="Notice 1" onSave={onSave} onClose={() => undefined} />;
export const DispatchProof: S = { name: 'Dispatch proof · open', render: () => proof() };
export const DispatchProofMissing: S = { name: 'Dispatch proof · Save pressed with no article number', render: () => proof(), play: play(press('Save')) };
export const DispatchProofFailed: S = { name: 'Dispatch proof · the server refuses (timeline changed)', render: () => proof(fails('This timeline changed meanwhile. Reload it.')), play: play(type(/^Article number/, 'RK 4471 2291 IN'), press('Save')) };
