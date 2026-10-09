import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Archive, Copy, Download, MoreHorizontal, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { Button, ButtonGroup, IconButton, Link, SplitButton } from '../components/button';
import { Menu, MenuCheckboxItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '../components/menu';
import { Tooltip } from '../components/tooltip';
import { Text } from '../components/foundations';
import { Row, Section, Stack } from './story-kit';

const meta: Meta<typeof Button> = {
  title: 'Actions/Button',
  component: Button,
  args: { children: 'Run payroll', variant: 'primary', size: 'md', loading: false, disabled: false },
  argTypes: {
    variant: { control: 'inline-radio', options: ['primary', 'secondary', 'danger'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
  },
};
export default meta;
type S = StoryObj<typeof Button>;

export const Playground: S = {};

export const AllVariantsAndStates: S = {
  render: () => (
    <Stack>
      <Section title="Variants (§15)" note="Every text button has a border or fill; secondary is the default, including Cancel and Clear filters. One primary per view. Danger only for irreversible actions, always confirmed. Borderless is allowed only for icon-only buttons.">
        <Row>
          <Button variant="primary">Run payroll</Button>
          <Button>Preview</Button>
          <Button>Cancel</Button>
          <Button>Clear filters</Button>
          <Button variant="danger">Delete pay run</Button>
          <Link href="#">View policy</Link>
        </Row>
      </Section>
      <Section title="Sizes · 32 / 36 / 40">
        <Row>
          <Button size="sm">Approve</Button>
          <Button size="md">Approve</Button>
          <Button size="lg">Approve</Button>
          <Button variant="primary" size="sm" icon={Plus}>
            Add
          </Button>
          <Button variant="primary" icon={Plus}>
            Add employee
          </Button>
        </Row>
      </Section>
      <Section title="States" note="Loading keeps the width and blocks repeat clicks. Prefer enabled + explain over disabled.">
        <Row>
          <Button variant="primary" loading>
            Run payroll
          </Button>
          <Button loading icon={Upload}>
            Import
          </Button>
          <Button variant="primary" disabled>
            Run payroll
          </Button>
          <Button disabled>Preview</Button>
        </Row>
      </Section>
      <Section title="Icon buttons need a label (tooltip + accessible name)">
        <Row>
          <IconButton icon={Pencil} label="Edit" />
          <IconButton icon={Copy} label="Duplicate" variant="secondary" />
          <IconButton icon={Trash2} label="Delete" size="sm" />
          <IconButton icon={MoreHorizontal} label="More actions" size="lg" />
        </Row>
      </Section>
    </Stack>
  ),
};

export const GroupsAndSplit: S = {
  render: function Render() {
    const [view, setView] = useState('list');
    return (
      <Stack>
        <Section title="Button group as a segmented choice">
          <ButtonGroup aria-label="View">
            {['list', 'board', 'calendar'].map((v) => (
              <Button key={v} size="sm" aria-pressed={view === v} onClick={() => setView(v)}>
                {v[0].toUpperCase() + v.slice(1)}
              </Button>
            ))}
          </ButtonGroup>
        </Section>
        <Section title="Split button (§15)">
          <Row>
            <SplitButton
              variant="primary"
              menuLabel="More approve options"
              onClick={() => {}}
              menu={
                <>
                  <MenuItem>Approve with note</MenuItem>
                  <MenuItem>Approve and forward</MenuItem>
                </>
              }
            >
              Approve
            </SplitButton>
            <SplitButton menuLabel="More export options" menu={<MenuItem icon={Download}>Export as Excel</MenuItem>}>
              Export CSV
            </SplitButton>
          </Row>
        </Section>
      </Stack>
    );
  },
};

export const MenusAndTooltips: S = {
  render: function Render() {
    const [cols, setCols] = useState({ dept: true, loc: true, ctc: false });
    return (
      <Stack>
        <Section title="Menu (§33)" note="About 8 items at most, grouped, destructive last in red.">
          <Row>
            <Menu>
              <MenuTrigger asChild>
                <Button icon={MoreHorizontal}>Actions</Button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem icon={Pencil} shortcut="E">
                  Edit
                </MenuItem>
                <MenuItem icon={Copy}>Duplicate</MenuItem>
                <MenuItem icon={Archive}>Archive</MenuItem>
                <MenuSeparator />
                <MenuItem icon={Trash2} destructive>
                  Delete
                </MenuItem>
              </MenuContent>
            </Menu>
            <Menu>
              <MenuTrigger asChild>
                <Button>Columns</Button>
              </MenuTrigger>
              <MenuContent>
                <MenuLabel>Show columns</MenuLabel>
                <MenuCheckboxItem checked={cols.dept} onCheckedChange={(v) => setCols({ ...cols, dept: v === true })}>
                  Department
                </MenuCheckboxItem>
                <MenuCheckboxItem checked={cols.loc} onCheckedChange={(v) => setCols({ ...cols, loc: v === true })}>
                  Location
                </MenuCheckboxItem>
                <MenuCheckboxItem checked={cols.ctc} onCheckedChange={(v) => setCols({ ...cols, ctc: v === true })}>
                  Monthly CTC
                </MenuCheckboxItem>
              </MenuContent>
            </Menu>
          </Row>
        </Section>
        <Section title="Tooltip · 500 ms delay, icon-only buttons and truncated text only">
          <Row>
            <Tooltip content="Divya Raghunathan, Senior QA Engineer, Engineering">
              <Text style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }} tabIndex={0}>
                Divya Raghunathan, Senior QA Engineer, Engineering
              </Text>
            </Tooltip>
          </Row>
        </Section>
      </Stack>
    );
  },
};

const STATE_ROW = (id: string, label: string) => (
  <Section title={label}>
    <div id={id}>
      <Row>
        <Button variant="primary">Run payroll</Button>
        <Button>Preview</Button>
        <Button variant="danger">Delete pay run</Button>
        <IconButton icon={Pencil} label={`Edit (${label})`} noTooltip />
        <IconButton icon={Copy} label={`Duplicate (${label})`} variant="secondary" noTooltip />
        <Link href="#">View policy</Link>
      </Row>
    </div>
  </Section>
);

export const InteractionStates: S = {
  name: 'Hover, focus, pressed',
  parameters: {
    pseudo: {
      hover: ['#st-hover .yx-button', '#st-hover .yx-link'],
      focusVisible: ['#st-focus .yx-button', '#st-focus .yx-link'],
      active: ['#st-active .yx-button'],
    },
  },
  render: () => (
    <Stack>
      {STATE_ROW('st-default', 'Default')}
      {STATE_ROW('st-hover', 'Hover · background tint only, no lift or glow (§0)')}
      {STATE_ROW('st-focus', 'Keyboard focus · 2 px Azure ring')}
      {STATE_ROW('st-active', 'Pressed')}
    </Stack>
  ),
};

export const MoreOptions: S = {
  name: 'Other options',
  render: () => (
    <Stack width={640}>
      <Section title="Full width · mobile sheets and narrow cards">
        <Button variant="primary" fullWidth>
          Apply leave
        </Button>
        <Button fullWidth>Cancel</Button>
      </Section>
      <Section title="Rendered as a link (asChild) · navigation that looks like a button">
        <Row>
          <Button asChild variant="primary">
            <a href="#payroll">Open payroll</a>
          </Button>
          <Button asChild>
            <a href="#help">Read the guide</a>
          </Button>
        </Row>
      </Section>
      <Section title="Danger with icon and loading · always behind a confirmation (§17)">
        <Row>
          <Button variant="danger" icon={Trash2}>
            Delete employee
          </Button>
          <Button variant="danger" loading>
            Delete employee
          </Button>
          <Button variant="danger" disabled>
            Delete employee
          </Button>
        </Row>
      </Section>
      <Section title="Icon buttons · disabled and sizes">
        <Row>
          <IconButton icon={Pencil} label="Edit" size="sm" />
          <IconButton icon={Pencil} label="Edit" />
          <IconButton icon={Pencil} label="Edit" size="lg" />
          <IconButton icon={Trash2} label="Delete (locked)" disabled />
          <IconButton icon={Trash2} label="Delete (locked)" variant="secondary" disabled />
        </Row>
      </Section>
      <Section title="Split button · danger, loading, disabled">
        <Row>
          <SplitButton variant="danger" menuLabel="More reject options" menu={<MenuItem>Reject with note</MenuItem>}>
            Reject
          </SplitButton>
          <SplitButton variant="primary" loading menuLabel="More approve options" menu={<MenuItem>Approve with note</MenuItem>}>
            Approve
          </SplitButton>
          <SplitButton disabled menuLabel="More export options" menu={<MenuItem>Export as Excel</MenuItem>}>
            Export CSV
          </SplitButton>
        </Row>
      </Section>
      <Section title="Links · default and muted">
        <Row>
          <Link href="#">View policy</Link>
          <Link href="#" tone="muted">
            Last changed by Lakshmi Venkatesan
          </Link>
        </Row>
      </Section>
    </Stack>
  ),
};

export const MenuOpen: S = {
  name: 'Open · menu',
  render: () => (
    <div style={{ minHeight: 320 }}>
      <Menu defaultOpen modal={false}>
        <MenuTrigger asChild>
          <Button icon={MoreHorizontal}>Actions</Button>
        </MenuTrigger>
        <MenuContent>
          <MenuLabel>Divya Raghunathan</MenuLabel>
          <MenuItem icon={Pencil} shortcut="E">
            Edit
          </MenuItem>
          <MenuItem icon={Copy}>Duplicate</MenuItem>
          <MenuItem icon={Download} disabled>
            Download payslips (none yet)
          </MenuItem>
          <MenuCheckboxItem checked>Pin to favourites</MenuCheckboxItem>
          <MenuSeparator />
          <MenuItem icon={Archive}>Archive</MenuItem>
          <MenuItem icon={Trash2} destructive>
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  ),
};

export const TooltipOpen: S = {
  name: 'Open · tooltip',
  render: () => (
    <div style={{ padding: '48px 0 0 48px' }}>
      <Tooltip content="Delete row" open>
        <button type="button" className="yx-button" data-variant="ghost" data-icon-only aria-label="Delete row">
          <Trash2 size={16} strokeWidth={1.5} aria-hidden />
        </button>
      </Tooltip>
    </div>
  ),
};
