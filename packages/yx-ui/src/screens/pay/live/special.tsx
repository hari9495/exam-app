import { useState } from 'react';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/choice';
import { Badge, type BadgeTone } from '../../../components/display';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { FormField, type FormErrorItem } from '../../../components/field';
import { TextField } from '../../../components/inputs';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import { FileButton } from './compliance';
import { PersonPicker, type PersonHit } from './inputs';
import { FormDrawer } from './operations';
import { monthText } from './periods';
import { rupees } from './runs';
import { EntityPicker } from './setup';
import type { LoadState } from './types';
import type { SetupEntity } from './types-5b';

// Batch 5i, wired (PAY-9.01 … 9.12): special pay sent to payroll for approval (piece-rate, incentives, tips, on-call,
// union dues, settlements, lay-off, VRS), earned wage access, equity, the actuarial census and valuations, and country
// packs. Every action is checked again by the API (keys, entities, maker ≠ checker, the database pay guard).

const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
type Search = (q: string) => Promise<PersonHit[]>;

function Failed({ error }: { error: string | null }) {
  return error ? (
    <InlineAlert tone="danger" title="That did not work">
      {error}
    </InlineAlert>
  ) : null;
}


  );
}


}


  );
}

  );
}

  );
}

  );
}

  );
}
