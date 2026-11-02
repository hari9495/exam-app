// Page actions on the person record (verify, download): a refusal shows as a plain message, never an uncaught error.
export const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That did not work. Try again in a moment.');
/** Runs a page action; a refusal goes to `show` in plain words instead of an uncaught error (the row stays as it was). */
export const reportErrors = (run: () => unknown, show: (message: string) => void): Promise<void> => Promise.resolve().then(run).then(() => undefined, (e) => show(errorText(e)));
