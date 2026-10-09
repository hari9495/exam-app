import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { AiBadge, Avatar, AvatarGroup, Badge, PersonLabel, Tag } from '../components/display';
import { Row, Section, Stack } from './story-kit';

const meta: Meta = { title: 'Data display/Badges, tags, avatars' };
export default meta;

const TEAM = ['Divya Raghunathan', 'Arjun Kulkarni', 'Sana Nizami', 'Prakash Menon', 'Thomas George', 'Lakshmi Venkatesan'];

export const All: StoryObj = {
  render: function Render() {
    const [tags, setTags] = useState(['Night shift', 'Forklift licence', 'Kannada']);
    return (
      <Stack>
        <Section title="Status badges (§24)" note="Always text. One vocabulary per object. Colour follows meaning (§3).">
          <Row>
            <Badge>Draft</Badge>
            <Badge tone="warning">Pending approval</Badge>
            <Badge tone="success">Approved</Badge>
            <Badge tone="success">Paid</Badge>
            <Badge tone="danger">Rejected</Badge>
            <Badge tone="danger">UAN missing</Badge>
            <Badge tone="info">New</Badge>
            <Badge>Locked</Badge>
            <AiBadge />
          </Row>
        </Section>
        <Section title="Tags · user-defined, removable">
          <Row gap={8}>
            {tags.map((t) => (
              <Tag key={t} onRemove={() => setTags(tags.filter((x) => x !== t))}>
                {t}
              </Tag>
            ))}
          </Row>
        </Section>
        <Section title="Avatars · 20 / 24 / 32 / 40 / 64, initials on a muted tint">
          <Row>
            {([20, 24, 32, 40, 64] as const).map((s) => (
              <Avatar key={s} name="Divya Raghunathan" size={s} />
            ))}
          </Row>
          <Row>
            {TEAM.map((n) => (
              <Avatar key={n} name={n} />
            ))}
          </Row>
          <AvatarGroup people={TEAM.map((name) => ({ name }))} />
        </Section>
        <Section title="Person label · how people appear in tables and pickers (§20)">
          <PersonLabel name="Divya Raghunathan" secondary="Senior QA Engineer · Engineering" />
          <PersonLabel name="Arjun Kulkarni" secondary="Plant Supervisor" size={32} />
        </Section>
      </Stack>
    );
  },
};
