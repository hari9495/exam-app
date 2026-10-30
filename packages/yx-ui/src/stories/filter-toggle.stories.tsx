import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { FilterToggle } from '../components/filter-toggle';
import { Row, Section, Stack } from './story-kit';

const meta: Meta = { title: 'Inputs/Filter toggle' };
export default meta;

function Demo({ start }: { start: boolean }) {
  const [on, setOn] = useState(start);
  return <FilterToggle pressed={on} onPressedChange={setOn}>Only overdue (3)</FilterToggle>;
}

export const OffAndOn: StoryObj = {
  name: 'Off and on',
  render: () => (
    <Stack>
      <Section title="An on/off filter above a list" note="Border, hover, pointer and focus ring like every control; a tick and the selected fill when on. For one choice out of several, use Segment.">
        <Row>
          <Demo start={false} />
          <Demo start />
        </Row>
      </Section>
    </Stack>
  ),
};
