import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './Tabs';

describe('Tabs', () => {
  it('switches visible content when a different tab is selected', async () => {
    render(
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="sections">Sections</TabsTrigger>
        </TabsList>
        <TabsContent value="details">Details panel</TabsContent>
        <TabsContent value="sections">Sections panel</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText('Details panel')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Sections' }));
    expect(screen.getByText('Sections panel')).toBeInTheDocument();
  });

  it('uses slate tokens on the trigger, not raw gray', () => {
    render(
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="details">Details panel</TabsContent>
      </Tabs>,
    );
    const trigger = screen.getByRole('tab', { name: 'Details' });
    expect(trigger.className).toContain('text-muted');
    expect(trigger.className).not.toContain('text-gray-600');
    expect(trigger.className).toContain('data-[state=active]:text-primary');
  });
});
