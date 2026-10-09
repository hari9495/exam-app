import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Calculator, CameraFrame, CodeAnswer, ConnectionStatus, EvidenceFrame, FlagTimeline, IdCapture, IntegrityScoreCard, ProctorTile, QrPlaceholder, ScreenThumb, SystemCheckList } from '../proctoring-kit';
import { EVENTS_SNEHA, LIVE_TILES, READINESS_CHECKS, SIGNALS_SNEHA } from '../proctoring-data';
import '../screens.css';

const meta: Meta = { title: 'Screens/Proctoring/Kit · Proctoring building blocks', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;

export const Cameras: S = {
  render: () => (
    <div className="yx-prc-grid4">
      {(['live', 'no-face', 'multiple', 'phone', 'off', 'connecting', 'captured'] as const).map((s) => (
        <CameraFrame key={s} state={s} label="Webcam" />
      ))}
      <CameraFrame kind="id" state="captured" label="PAN card" />
      <CameraFrame kind="room" label="Room scan" />
      <ScreenThumb note="Q 14 of 40" />
    </div>
  ),
};

export const SystemCheck: S = { name: 'System check rows', render: () => <SystemCheckList checks={READINESS_CHECKS} onRetry={() => {}} /> };

export const IntegrityScore: S = { name: 'Integrity score card', render: () => <div style={{ maxWidth: 360 }}><IntegrityScoreCard signals={SIGNALS_SNEHA} /></div> };
export const IntegrityClear: S = { name: 'Integrity score card, no signals', render: () => <div style={{ maxWidth: 360 }}><IntegrityScoreCard signals={[]} /></div> };

export const Tiles: S = {
  name: 'Live proctor tiles',
  render: () => (
    <div className="yx-prc-tiles">
      {LIVE_TILES.slice(0, 8).map((t, i) => (
        <ProctorTile key={t.id} tile={t} index={i} selected={i === 1} />
      ))}
    </div>
  ),
};

function TimelineDemo() {
  const [at, setAt] = useState(1395);
  return <FlagTimeline duration={2700} events={EVENTS_SNEHA} current={at} onSeek={setAt} />;
}
export const Timeline: S = { name: 'Flag timeline', render: () => <TimelineDemo /> };

export const Evidence: S = {
  render: () => (
    <div className="yx-prc-grid4">
      <EvidenceFrame at="23:15" source="camera" label="More than one face" flagged />
      <EvidenceFrame at="25:20" source="camera" label="Phone detected" flagged />
      <EvidenceFrame at="20:40" source="audio" label="Second voice" />
      <EvidenceFrame at="10:10" source="screen" label="Tab switch" />
    </div>
  ),
};

export const Connection: S = {
  render: () => (
    <div className="yx-prc-stack">
      <ConnectionStatus state="online" />
      <ConnectionStatus state="weak" />
      <ConnectionStatus state="reconnecting" queued={3} />
      <ConnectionStatus state="offline" offlineSeconds={95} />
    </div>
  ),
};

export const CalculatorTool: S = { name: 'Calculator', render: () => <Calculator onClose={() => {}} /> };

function CodeDemo() {
  const [v, setV] = useState('public List<String> topK(List<String> words, int k) {\n  return words.stream()\n    .collect(groupingBy(w -> w, counting()))\n    .entrySet().stream()\n    .sorted(comparingByValue(reverseOrder()))\n    .limit(k).map(Map.Entry::getKey).toList();\n}');
  return (
    <CodeAnswer
      language="Java 17"
      value={v}
      onChange={setV}
      runs={4}
      onRun={() => {}}
      results={[
        { name: 'Sample 1: k = 2', status: 'pass', detail: '0.12 s' },
        { name: 'Sample 2: ties sorted alphabetically', status: 'fail', detail: 'Expected [apple, mango], got [mango, apple]' },
        { name: 'Hidden tests (6)', status: 'hidden' },
      ]}
    />
  );
}
export const Code: S = { name: 'Code answer', render: () => <CodeDemo /> };

export const QrAndId: S = {
  name: 'QR and ID capture',
  render: () => (
    <div className="yx-prc-grid3">
      <QrPlaceholder seed="pair-INV-3400" label="Scan with your phone to pair it" />
      <IdCapture docType="PAN card" state="waiting" />
      <IdCapture docType="PAN card" masked="XXXXXX234F" state="captured" />
      <IdCapture docType="Driving licence" state="blurry" />
    </div>
  ),
};
