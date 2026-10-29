import type { Meta, StoryObj } from '@storybook/react-vite';
import { EwaAdminScreen, MyEwaScreen, MyIncentivesScreen } from './special';
import { ENTITIES } from './fixtures-ops';

// Batch 5i screens with sample data (the affordance guard opens these in light and dark).
const ok = async () => ({}) as never;
const meta: Meta = { title: 'Screens/Pay/Live 5i', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const nameOf = (id: string) => ({ p1: 'Lakshmi Devi', p2: 'Ravi Kumar' })[id] ?? 'Someone';
const search = async () => [{ id: 'p1', name: 'Lakshmi Devi', employeeCode: 'GW-014' }];

};

    />
  ),
};

};
