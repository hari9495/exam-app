// Story steps for the People popups: fill a form, press its button, as a person would (design stories of live dialogs).
import { userEvent, within } from 'storybook/test';

type Screen = ReturnType<typeof within>;
type Step = (s: Screen) => Promise<unknown>;

export const type = (name: string | RegExp, text: string): Step => async (s) => userEvent.type(await s.findByRole('textbox', { name }), text);
export const clear = (name: string | RegExp): Step => async (s) => userEvent.clear(await s.findByRole('textbox', { name }));
/** A DatePicker: typed, then Enter. */
export const date = (name: string, text: string): Step => type(name, `${text}{Enter}`);
export const pick = (name: string, option: string | RegExp): Step => async (s) => {
  await userEvent.click(await s.findByRole('combobox', { name }));
  await userEvent.click(await s.findByRole('option', { name: option }));
};
export const press = (name: string | RegExp): Step => async (s) => userEvent.click((await s.findAllByRole('button', { name })).at(-1)!);
export const tick = (name: string | RegExp): Step => async (s) => userEvent.click(await s.findByRole('checkbox', { name }));
export const choose = (name: string | RegExp): Step => async (s) => userEvent.click(await s.findByRole('radio', { name }));

/** A story's play: the steps in order, on the whole page (dialogs render in a portal). */
export const play =
  (...steps: Step[]) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const s = within(canvasElement.ownerDocument.body);
    for (const step of steps) await step(s);
  };

/** A handler that fails as the server would. */
export const fails = (message: string) => async (): Promise<never> => {
  throw new Error(message);
};
export const ok = async () => undefined;
export const never = () => new Promise<never>(() => undefined);
