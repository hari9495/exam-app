import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FormField } from '../../components/field';
import { NumberField } from '../../components/inputs';
import { AttendanceLegend, AttendanceMonth, CameraFrame, ClockCard, DayCardBody, DueBadge, GeoMap, PunchList, ShiftBar } from './time-kit';
import { DAY_10_PUNCHES, DAY_21_PUNCHES, DAY_22_PUNCHES, FULL_DAY_PUNCHES, GENERAL_SHIFT, NOW_MIN, SEPTEMBER, TODAY, TODAY_PUNCHES } from './time-data';

// Time kit components (reusable pieces the library lacks).
const meta: Meta<typeof ClockCard> = {
  title: 'Screens/Time/Kit',
  component: ClockCard,
  args: { now: NOW_MIN, seconds: 15, date: TODAY, shift: GENERAL_SHIFT },
  decorators: [(S) => <div style={{ maxWidth: 720, padding: 24 }}><S /></div>],
};
export default meta;
type S = StoryObj<typeof ClockCard>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };
/** 29 Sep for every ClockCard, PunchList and ShiftBar story: the same 9:38 am web clock-in (TODAY_PUNCHES), then the rest of the day. */
const SEP_29 = [TODAY_PUNCHES[0], ...FULL_DAY_PUNCHES.slice(1)];

export const ClockNotIn: S = { name: 'ClockCard · not clocked in' };
export const ClockWorking: S = { name: 'ClockCard · working', args: { defaultState: 'working', defaultPunches: TODAY_PUNCHES } };
export const ClockBreak: S = { name: 'ClockCard · on break', args: { defaultState: 'break', now: 13 * 60 + 30, defaultPunches: SEP_29.slice(0, 2) } };
export const ClockOut: S = { name: 'ClockCard · clocked out', args: { defaultState: 'out', now: 19 * 60, defaultPunches: SEP_29 } };
export const ClockOutside: S = { name: 'ClockCard · outside office', args: { inside: false, distanceM: 850 } };
export const ClockEarly: S = { name: 'ClockCard · shift not started', args: { now: 8 * 60 } };
export const ClockDevice: S = { name: 'ClockCard · device not approved', args: { deviceApproved: false } };
export const ClockPage: S = { name: 'ClockCard · page variant', args: { variant: 'page', defaultState: 'working', defaultPunches: TODAY_PUNCHES } };
export const ClockPhone: S = { name: 'ClockCard · narrow', args: { defaultState: 'working', defaultPunches: TODAY_PUNCHES }, ...phone };

export const Month: StoryObj = { name: 'AttendanceMonth + legend', render: () => <div className="yx-tim-stack"><AttendanceMonth month={SEPTEMBER[0].date} days={SEPTEMBER} /><AttendanceLegend days={SEPTEMBER} onFixDay={() => {}} /></div> };
export const MonthCompact: StoryObj = { name: 'AttendanceMonth · compact', render: () => <AttendanceMonth month={SEPTEMBER[0].date} days={SEPTEMBER} compact selected={SEPTEMBER[9].date} />, ...phone };
export const Punches: StoryObj = { name: 'PunchList', render: () => <PunchList punches={SEP_29} showMapIndex /> };
export const PunchesEmpty: StoryObj = { name: 'PunchList · empty', render: () => <PunchList punches={[]} /> };
export const Bar: StoryObj = { name: 'ShiftBar', render: () => <ShiftBar start="09:30" end="18:30" punches={SEP_29} /> };
export const BarLive: StoryObj = { name: 'ShiftBar · in progress', render: () => <ShiftBar start="09:30" end="18:30" punches={TODAY_PUNCHES} now={NOW_MIN} /> };
export const Map: StoryObj = { name: 'GeoMap · pin, accuracy, geofence', // Same scale as the zone (33 px = 200 m): 850 m away ≈ 140 px, 20 m accuracy ≈ 3 px (inside the pin, so the caption carries it).
render: () => <GeoMap fences={[{ id: 'a', label: 'Chennai office · 200 m', x: 150, y: 100, r: 33 }]} pins={[{ id: 'y', label: 'You', x: 272, y: 30, kind: 'you', accuracy: 3 }]} caption="Accuracy 20 m · 850 m from Chennai office" /> };
export const MapTrail: StoryObj = { name: 'GeoMap · trail and visits', render: () => <GeoMap fences={[{ id: 'o', label: 'Office', x: 60, y: 150, r: 16 }]} pins={[{ id: '1', label: 'Visit 1', x: 150, y: 110, kind: 'visit' }, { id: '2', label: 'Visit 2', x: 200, y: 80, kind: 'visit' }]} trail={[[60, 150], [110, 130], [150, 110], [200, 80]]} caption="2 of 6 visits done · 4.8 km" /> };
/** 40 px = 200 m (5 m a px); the number field is the keyboard and phone way to set the same radius. */
function EditableMap() {
  const [m, setM] = useState(200);
  const set = (v: number) => setM(Math.min(450, Math.max(20, Math.round(v))));
  return (
    <div className="yx-tim-stack">
      <GeoMap editable fences={[{ id: 'a', label: `Main block · ${m} m`, x: 150, y: 100, r: m / 5, active: true }]} pins={[]} caption={`Drag the edge to change the ${m} m radius`} onRadiusChange={(_, r) => set(r * 5)} radiusMin={20} radiusMax={450} />
      <FormField label="Radius" helper="20 to 450 m">
        <NumberField size="sm" value={m} min={20} max={450} suffix="m" onChange={(v) => v !== null && set(v)} />
      </FormField>
    </div>
  );
}
export const MapEditable: StoryObj = { name: 'GeoMap · editable', render: () => <EditableMap /> };
export const Camera: StoryObj = { name: 'CameraFrame · states', render: () => <div className="yx-tim-row" style={{ alignItems: 'flex-start', gap: 'var(--yx-space-6)' }}><CameraFrame state="ready" /><CameraFrame state="captured" stamp="12:08 pm" /><CameraFrame state="denied" /><CameraFrame state="later" /></div> };
export const DayCard: StoryObj = { name: 'DayCardBody', render: () => <DayCardBody day={SEPTEMBER[9]} punches={DAY_10_PUNCHES} shift={GENERAL_SHIFT} onFix={() => {}} /> };
export const DayCardPending: StoryObj = { name: 'DayCardBody · regularisation pending', render: () => <DayCardBody day={SEPTEMBER[21]} punches={DAY_22_PUNCHES} shift={GENERAL_SHIFT} onViewRequest={() => {}} onWithdraw={() => {}} /> };
export const DayCardOnDuty: StoryObj = { name: 'DayCardBody · on duty at Hosur plant', render: () => <DayCardBody day={SEPTEMBER[20]} punches={DAY_21_PUNCHES} shift={GENERAL_SHIFT} /> };
export const DayCardLocked: StoryObj = { name: 'DayCardBody · locked month (HR)', render: () => <DayCardBody day={{ date: new Date(2026, 7, 21), code: 'A' }} punches={[]} shift={GENERAL_SHIFT} viewer="hr" locked /> };
export const Due: StoryObj = {
  name: 'DueBadge · relative dates',
  render: () => (
    <div className="yx-tim-row">
      <DueBadge date={new Date(2026, 8, 27)} prefix="Expired" />
      <DueBadge date={new Date(2026, 8, 29)} />
      <DueBadge date={new Date(2026, 8, 30)} prefix="Freezes" />
      <DueBadge date={new Date(2026, 9, 5)} />
      <DueBadge date={new Date(2026, 9, 14)} prefix="Expires" />
    </div>
  ),
};
