import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import {
  BiasFlagList,
  CoachCard,
  EnpsScale,
  GoalTree,
  NineBox,
  PollBlock,
  PostCard,
  ProgressRing,
  QrTile,
  RatingScale,
  ScoreBand,
  SkillLevel,
  StageTrack,
  SuppressedNotice,
} from './growth-kit';
import { detectBiasFlags } from './growth-logic';
import { GOALS, MY_STAGES, NUDGES, d } from './perf-data';
import { POSTS } from './engage-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Performance/Kit · Growth building blocks', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;

const box = { display: 'flex', flexDirection: 'column' as const, gap: 24, maxWidth: 900 };

export const ProgressRings: S = {
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
      <ProgressRing value={null} label="Not measured" size="sm" />
      <ProgressRing value={35} label="At risk" size="md" tone="warning" />
      <ProgressRing value={12} label="Off track" size="md" tone="danger" />
      <ProgressRing value={71} label="On track" size="lg" />
      <ProgressRing value={100} label="Done" size="lg" tone="success" />
    </div>
  ),
};
export const GoalTreeAlignment: S = { name: 'Goal tree', render: () => <div style={box}><GoalTree goals={GOALS} aria-label="Goals" onCheckIn={() => {}} /></div> };
export const GoalTreeCompact: S = { name: 'Goal tree · compact map', render: () => <div style={box}><GoalTree goals={GOALS} aria-label="Goals" compact /></div> };
export const Rating: S = {
  render: () => {
    const [v, setV] = useState<number | null>(3);
    return (
      <div style={box}>
        <RatingScale label="Rating" value={v} onChange={setV} />
        <ScoreBand score={v} />
        <ScoreBand score={null} />
      </div>
    );
  },
};
export const Stages: S = { render: () => <div style={box}><StageTrack stages={MY_STAGES} nextStep="360° feedback" /></div> };
export const NineBoxGrid: S = {
  name: '9-box',
  render: () => (
    <div style={box}>
      <NineBox
        people={[
          { id: '1', name: 'Kavya Reddy', performance: 3, potential: 3 },
          { id: '2', name: 'Divya Raghunathan', performance: 3, potential: 2 },
          { id: '3', name: 'Meera Iyer', performance: 2, potential: 3 },
          { id: '4', name: 'Rohit Bhat', performance: 2, potential: 2 },
          { id: '5', name: 'Sneha Ghosh', performance: 2, potential: 2, protectedLeave: true },
          { id: '6', name: 'Imran Qureshi', performance: 1, potential: 1 },
        ]}
      />
    </div>
  ),
};
export const NineBoxMoveReason: S = {
  name: '9-box · move asks for a reason',
  render: () => <NineBox people={[{ id: '1', name: 'Rohit Bhat', performance: 2, potential: 2 }]} defaultPending={{ id: '1', performance: 3, potential: 2 }} />,
};
export const Enps: S = {
  name: 'eNPS scale and suppression',
  render: () => (
    <div style={box}>
      <EnpsScale score={20} promoters={78} passives={62} detractors={41} previous={14} />
      <EnpsScale score={-12} promoters={20} passives={30} detractors={30} />
      <SuppressedNotice what="eNPS" count={4} />
    </div>
  ),
};
export const Qr: S = { name: 'Rotating QR', render: () => <QrTile sessionId="S-2031" slot={2} tick={17} secondsLeft={21} /> };
export const Skills: S = {
  name: 'Skill level',
  render: () => (
    <div style={box}>
      <SkillLevel level={4} required={3} label="Meets" />
      <SkillLevel level={2} required={4} label="Gap" />
      <SkillLevel level={null} required={3} label="Not assessed" />
    </div>
  ),
};
export const Posts: S = { name: 'Feed posts', render: () => <div style={box}>{POSTS.slice(0, 4).map((p) => <PostCard key={p.id} post={p} now={TODAY} onReport={() => {}} />)}</div> };
export const Poll: S = { render: () => <div style={box}><PollBlock poll={{ question: 'Breakfast on 20 Oct?', options: ['Idli and vada', 'Pongal', 'Poori'], votes: [22, 14, 9], closes: d(3, 9) }} /><PollBlock poll={{ question: 'Closed poll', options: ['Yes', 'No'], votes: [30, 12], closed: true }} /></div> };
export const Coach: S = { name: 'Coach card', render: () => <div style={box}><CoachCard nudges={NUDGES} weekOf={d(28)} /><CoachCard nudges={[]} weekOf={d(28)} /><CoachCard nudges={NUDGES} weekOf={d(28)} optedOut /></div> };
export const Bias: S = { name: 'Bias flags', render: () => <div style={box}><BiasFlagList flags={detectBiasFlags('Good job overall but abrasive in meetings; young and energetic. Missed two deadlines and delayed the audit.', 4)} decided={{ 'Vague, no example-good job': 'ignored' }} /><BiasFlagList flags={[]} /></div> };
