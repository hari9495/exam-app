// TIM-42: public-holiday feeds behind an adapter. Provider: TO DECIDE (recorded in docs/yukthix/time-design-map.md);
// until then the dev-fake below answers locally. A real provider implements HolidayProvider and is bound to
// HOLIDAY_PROVIDER in time.module.ts; nothing else changes.

export interface FeedHoliday {
  on: string;
  name: string;
}

export interface HolidayProvider {
  /** Short name stored on each feed, e.g. "dev-fake". */
  readonly name: string;
  /** The state's public holidays for a calendar year (state as ISO 3166-2, e.g. IN-TN). Throws when it can't answer. */
  holidays(state: string, year: number): Promise<FeedHoliday[]>;
}

export const HOLIDAY_PROVIDER = Symbol('HOLIDAY_PROVIDER');

/** States the feed screen offers (India; the ISO 3166-2 code and its name). */
export const FEED_STATES: Record<string, string> = {
  'IN-AP': 'Andhra Pradesh', 'IN-DL': 'Delhi', 'IN-GJ': 'Gujarat', 'IN-HR': 'Haryana', 'IN-KA': 'Karnataka', 'IN-KL': 'Kerala',
  'IN-MH': 'Maharashtra', 'IN-TN': 'Tamil Nadu', 'IN-TG': 'Telangana', 'IN-UP': 'Uttar Pradesh', 'IN-WB': 'West Bengal',
};

/** Dev-fake: the same fixed dates every year (national days plus one state day), so local checks are repeatable. */
export class DevFakeHolidayProvider implements HolidayProvider {
  readonly name = 'dev-fake';

  async holidays(state: string, year: number): Promise<FeedHoliday[]> {
    if (!FEED_STATES[state]) throw new Error(`No feed for ${state}`);
    const day: Record<string, [string, string]> = { 'IN-TN': ['01-15', 'Pongal'], 'IN-KA': ['11-01', 'Kannada Rajyotsava'], 'IN-KL': ['08-28', 'Thiruvonam'], 'IN-MH': ['05-01', 'Maharashtra Day'] };
    const own = day[state] ?? ['11-01', `${FEED_STATES[state]} Formation Day`];
    return [
      { on: `${year}-01-26`, name: 'Republic Day' },
      { on: `${year}-${own[0]}`, name: own[1] },
      { on: `${year}-08-15`, name: 'Independence Day' },
      { on: `${year}-10-02`, name: 'Gandhi Jayanti' },
    ].sort((a, b) => a.on.localeCompare(b.on));
  }
}
