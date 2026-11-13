import { redirect } from 'next/navigation';

// Retired (answer 1885): the plan, usage and invoices are read on Settings › Billing & Account; payment is by bank
// transfer. Old bookmarks and the payment provider's return links land on Plan & add-ons.
export default function V2BillingPage() {
  redirect('/yx/settings/account/plan-and-add-ons');
}
