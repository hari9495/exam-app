'use client';

import { OneOnOnesPage } from './one-on-ones-view';

// PRF-11 1:1s: the list; /one-on-ones/[id] opens the same screen with that 1:1's record.
export default function YxOneOnOnesPage() {
  return <OneOnOnesPage openId={null} />;
}
