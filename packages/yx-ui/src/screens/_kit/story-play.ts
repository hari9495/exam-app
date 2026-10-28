// Story steps for design stories of live popups (Time, Pay, Helpdesk): the People steps, plus a few more.
import { fireEvent, userEvent, within } from 'storybook/test';

export { choose, clear, date, fails, never, ok, pick, play, press, tick, type } from '../people/popup-play';

type Screen = ReturnType<typeof within>;
type Step = (s: Screen) => Promise<unknown>;

/** A native date, time or number input set by its label (a person types it; the browser's picker cannot be typed into). */
export const fill = (label: string | RegExp, value: string): Step => async (s) => fireEvent.change(await s.findByLabelText(label), { target: { value } });
/** Opens a tab. */
export const tab = (name: string | RegExp): Step => async (s) => userEvent.click(await s.findByRole('tab', { name }));
/** Presses the first button with this name (a row action; `press` takes the last, a footer). */
export const pressFirst = (name: string | RegExp): Step => async (s) => userEvent.click((await s.findAllByRole('button', { name }))[0]!);
/** Waits for text to show (a server answer, a preview). */
export const see = (text: string | RegExp): Step => async (s) => s.findAllByText(text);
