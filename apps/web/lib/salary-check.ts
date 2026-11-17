// Answer 2370: "Confirm it's you" was cancelled on a salary page (the API's salary re-check, batch B item 1). Pages then
// show "Confirm it's you to see salary details" with Try again (the kit's SalaryCheckContext), not "no access".
export const SALARY_RECHECK_MESSAGE = 'Confirm it is you to open salary details.';
let salaryCheckCancelled = false;
const salaryCheckListeners = new Set<() => void>();
export const salaryCheck = {
  get: () => salaryCheckCancelled,
  set(cancelled: boolean) {
    if (cancelled === salaryCheckCancelled) return;
    salaryCheckCancelled = cancelled;
    salaryCheckListeners.forEach((l) => l());
  },
  subscribe(listener: () => void) {
    salaryCheckListeners.add(listener);
    return () => void salaryCheckListeners.delete(listener);
  },
};
