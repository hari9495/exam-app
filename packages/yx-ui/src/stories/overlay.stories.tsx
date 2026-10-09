import '../components/overlay.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { useState } from 'react';
import { Keyboard, Trash2 } from 'lucide-react';
import { Button } from '../components/button';
import { FormField } from '../components/field';
import { Select } from '../components/select';
import { Text } from '../components/foundations';
import { BottomSheet, ConfirmDialog, Dialog, ShortcutHelp, TypeToConfirmDialog, useShortcutHelp } from '../components/overlay';
import { Row, Section } from './story-kit';

const meta: Meta = { title: 'Overlays/Dialogs and sheets', parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj;

const mobile = { globals: { viewport: { value: 'mobile2', isRotated: false } } };
const never = () => new Promise<void>(() => {});
const clickConfirm = (name: string) => async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  // Dialogs render in a portal on document.body.
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(await body.findByRole('button', { name }));
};

export const Triggers: Story = {
  name: 'Closed · triggers (focus returns here)',
  render: () => (
    <Section title="Each button opens its overlay; closing returns focus to the button">
      <Row>
        <Dialog
          title="Change reporting manager?"
          description="Divya Raghunathan will report to Arjun Kulkarni from 01 Oct 2026. Pending approvals move with her."
          trigger={<Button>Change manager</Button>}
          footer={
            <>
              <Button>Cancel</Button>
              <Button variant="primary">Change manager</Button>
            </>
          }
        />
        <ConfirmDialog
          destructive
          trigger={<Button icon={Trash2}>Delete leave type</Button>}
          title="Delete leave type Casual?"
          consequence="12 employees lose their Casual leave balance. You can't undo this."
          confirmLabel="Delete leave type"
          onConfirm={() => new Promise((r) => setTimeout(r, 1200))}
        />
        <TypeToConfirmDialog
          trigger={<Button>Unlock payroll</Button>}
          objectName="Payroll Sep 2026"
          title="Unlock payroll for September 2026?"
          consequence="248 payslips go back to draft and bank files are cancelled. Payslips already shared stay with employees."
          confirmLabel="Unlock payroll"
          onConfirm={() => new Promise((r) => setTimeout(r, 1200))}
        />
        <ShortcutHelp trigger={<Button icon={Keyboard}>Keyboard shortcuts</Button>} />
      </Row>
    </Section>
  ),
};

export const DialogSmall: Story = {
  name: 'Dialog · 480 px · open',
  render: () => (
    <Dialog
      defaultOpen
      title="Change reporting manager?"
      description="Divya Raghunathan will report to Arjun Kulkarni from 01 Oct 2026. Pending approvals move with her."
      footer={
        <>
          <Button>Cancel</Button>
          <Button variant="primary">Change manager</Button>
        </>
      }
    />
  ),
};

export const DialogMedium: Story = {
  name: 'Dialog · 640 px · with body',
  render: function Render() {
    const [reason, setReason] = useState<string | null>('restructure');
    return (
      <Dialog
        defaultOpen
        size="md"
        title="Move 14 employees to Chennai?"
        description="Their attendance policy, holiday list and professional tax state change from 01 Nov 2026."
        footer={
          <>
            <Button>Cancel</Button>
            <Button variant="primary">Move employees</Button>
          </>
        }
      >
        <FormField label="Reason" required>
          <Select
            value={reason}
            onChange={setReason}
            options={[
              { value: 'restructure', label: 'Team restructure' },
              { value: 'request', label: 'Employee request' },
              { value: 'project', label: 'Client project' },
            ]}
          />
        </FormField>
        <Text as="p" tone="secondary" size="sm">
          Employees get an email with the new office address and their reporting time. Payroll picks up the new state from the November run.
        </Text>
      </Dialog>
    );
  },
};

export const ConfirmDestructive: Story = {
  name: 'Confirm · destructive · open',
  render: () => (
    <ConfirmDialog
      defaultOpen
      destructive
      title="Delete leave type Casual?"
      consequence="12 employees lose their Casual leave balance. You can't undo this."
      confirmLabel="Delete leave type"
      onConfirm={() => {}}
    />
  ),
};

export const ConfirmSafe: Story = {
  name: 'Confirm · non-destructive',
  render: () => (
    <ConfirmDialog
      defaultOpen
      title="Publish holiday list 2027?"
      consequence="All 248 employees see the list on their calendar and get an email."
      confirmLabel="Publish list"
      onConfirm={() => {}}
    />
  ),
};

export const ConfirmLoading: Story = {
  name: 'Confirm · loading',
  render: () => (
    <ConfirmDialog
      defaultOpen
      destructive
      title="Delete leave type Casual?"
      consequence="12 employees lose their Casual leave balance. You can't undo this."
      confirmLabel="Delete leave type"
      onConfirm={never}
    />
  ),
  play: clickConfirm('Delete leave type'),
};

export const ConfirmError: Story = {
  name: 'Confirm · error inline',
  render: () => (
    <ConfirmDialog
      defaultOpen
      destructive
      title="Delete leave type Casual?"
      consequence="12 employees lose their Casual leave balance. You can't undo this."
      confirmLabel="Delete leave type"
      onConfirm={() => Promise.reject(new Error("We couldn't delete Casual because 3 leave requests are still pending. Approve or reject them, then try again."))}
    />
  ),
  play: clickConfirm('Delete leave type'),
};

export const TypeToConfirmEmpty: Story = {
  name: 'Type to confirm · empty (button disabled)',
  render: () => (
    <TypeToConfirmDialog
      defaultOpen
      objectName="Payroll Sep 2026"
      title="Unlock payroll for September 2026?"
      consequence="248 payslips go back to draft and bank files are cancelled. Payslips already shared stay with employees."
      confirmLabel="Unlock payroll"
      onConfirm={() => {}}
    />
  ),
};

export const TypeToConfirmMatched: Story = {
  name: 'Type to confirm · name typed',
  render: () => (
    <TypeToConfirmDialog
      defaultOpen
      objectName="Hosur plant"
      title="Delete location Hosur plant?"
      consequence="96 employees, 4 shift patterns and the Tamil Nadu holiday list are linked to it. Move them first or they lose their location."
      confirmLabel="Delete location"
      onConfirm={() => {}}
    />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(await body.findByLabelText('Type "Hosur plant" to confirm'), 'Hosur plant');
  },
};

export const LongText: Story = {
  name: 'Dialog · long text',
  render: () => (
    <Dialog
      defaultOpen
      title="Apply the revised overtime policy to Bengaluru, Chennai and Hosur plant from the October payroll?"
      description="Overtime above 9 hours a day and 48 hours a week is paid at twice the ordinary rate under the Factories Act. Employees in grades G1 to G4 at the three locations move to the new policy. Overtime already approved for September is paid at the old rate. Managers get an email explaining the change, and employees see it on their attendance page."
      footer={
        <>
          <Button>Cancel</Button>
          <Button variant="primary">Apply policy</Button>
        </>
      }
    />
  ),
};

export const MobileBottomSheet: Story = {
  name: 'Bottom sheet · mobile · open',
  ...mobile,
  render: () => (
    <BottomSheet
      defaultOpen
      title="Apply leave"
      description="Casual leave · 4 days left"
      footer={
        <>
          <Button>Cancel</Button>
          <Button variant="primary">Apply leave</Button>
        </>
      }
    >
      <FormField label="Leave type" required>
        <Select
          value="casual"
          onChange={() => {}}
          options={[
            { value: 'casual', label: 'Casual leave' },
            { value: 'sick', label: 'Sick leave' },
            { value: 'earned', label: 'Earned leave' },
          ]}
        />
      </FormField>
      <Text as="p" tone="secondary" size="sm">
        Your manager Arjun Kulkarni approves this. You'll get a notification when it's decided.
      </Text>
    </BottomSheet>
  ),
};

export const MobileBottomSheetMenu: Story = {
  name: 'Bottom sheet · mobile · as a menu',
  ...mobile,
  render: () => (
    <BottomSheet defaultOpen title="Divya Raghunathan">
      <Row>
        <Button fullWidth>View profile</Button>
        <Button fullWidth>Message</Button>
        <Button fullWidth>Assign shift</Button>
        <Button fullWidth variant="danger">
          Start exit
        </Button>
      </Row>
    </BottomSheet>
  ),
};

export const Shortcuts: Story = {
  name: 'Shortcut help · open',
  render: () => <ShortcutHelp defaultOpen />,
};

export const ShortcutsHook: Story = {
  name: 'Shortcut help · press ?',
  render: function Render() {
    const help = useShortcutHelp();
    return (
      <Section title="Press ? anywhere on this page (not inside a text field) to open the list">
        <ShortcutHelp {...help} />
      </Section>
    );
  },
};
