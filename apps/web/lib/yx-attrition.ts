// T2-G 47 (answer 2747): the Headcount and attrition page's period choices.

/** Months back from a YYYY-MM. */
const back = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 - n, 1)).toISOString().slice(0, 7);
};

/** The period choices: the last 12, 6 or 24 complete months and this year so far (value "from|to"). */
export function attritionPeriods(today: string) {
  const now = today.slice(0, 7);
  const last = back(now, 1);
  return [
    { value: `${back(last, 11)}|${last}`, label: 'Last 12 months' },
    { value: `${back(last, 5)}|${last}`, label: 'Last 6 months' },
    { value: `${back(last, 23)}|${last}`, label: 'Last 24 months' },
    { value: `${now.slice(0, 4)}-01|${now}`, label: 'This year so far' },
  ];
}
