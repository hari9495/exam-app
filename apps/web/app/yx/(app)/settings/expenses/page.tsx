"use client";

import {
  PolicyMatrixScreen,
  type CityTier,
  type ExpenseCategory,
  type FxRateRow,
  type GstRegistration,
  type Policies,
  type Rates,
  type SetupCheck,
} from "@yukthix/ui/expenses";
import type { LegalEntity } from "@yukthix/ui/org";
import { loadState, useOrg, useYxPermissions } from "../../../../../lib/yx-org";
import {
  policyRequest,
  useExp,
  useExpWrite,
} from "../../../../../lib/yx-expenses";

// Settings › Expenses (EXP-07, the designed Expense policy screen with `live`): the grade band grid for policies that
// apply to one grade and the other policies below it (founder answer 6), rates, categories, city tiers, GST registrations
// and exchange rates, with the set-up check and the YukthiX starters. The API checks expense.policy.manage.
export default function YxExpenseSetupPage() {
  const check = useExp<SetupCheck>("/setup-check");
  const categories = useExp<ExpenseCategory[]>("/categories");
  const tiers = useExp<CityTier[]>("/tiers");
  const policies = useExp<Policies>("/policies");
  const rates = useExp<Rates>("/rates");
  const gst = useExp<GstRegistration[]>("/gst-registrations");
  const entities = useOrg<LegalEntity[]>("/legal-entities");
  const fx = useExp<FxRateRow[]>("/fx-rates");
  const write = useExpWrite();
  // HR with expense.policy.view only sees the policy; every edit needs expense.policy.manage (the API checks it too).
  const canEdit = useYxPermissions().has('expense.policy.manage');
  const all = [check, categories, tiers, policies, rates, gst];
  return (
    <PolicyMatrixScreen
      live={{
        state: loadState(...all),
        canEdit,
        onRetry: () => void Promise.all(all.map((q) => q.refetch())),
        check: check.data ?? null,
        categories: categories.data ?? [],
        tiers: tiers.data ?? [],
        policies: policies.data ?? null,
        rates: rates.data ?? null,
        gst: gst.data ?? [],
        entities: (entities.data ?? [])
          .filter((e) => e.country === "IN")
          .map((e) => ({ value: e.id, label: e.name })),
        onUseStarters: () => write("POST", "/setup/from-starter"),
        onSaveCategory: ({ id, ...c }) =>
          write(
            id ? "PUT" : "POST",
            id ? `/categories/${encodeURIComponent(id)}` : "/categories",
            c,
          ),
        onSaveTier: ({ id, ...t }) =>
          write(
            id ? "PUT" : "POST",
            id ? `/tiers/${encodeURIComponent(id)}` : "/tiers",
            t,
          ),
        onSavePolicy: (s) => {
          const r = policyRequest(s);
          return write(r.method, r.path, r.body);
        },
        onAddMileage: (r) => write("POST", "/mileage-rates", r),
        onAddPerDiem: (r) => write("POST", "/per-diem-rates", r),
        onAddGst: (r) => write("POST", "/gst-registrations", r),
        onEndGst: (id, validTo) =>
          write("POST", `/gst-registrations/${encodeURIComponent(id)}/end`, {
            validTo,
          }),
        fxRates: fx.data ?? [],
        payCurrency:
          (entities.data ?? []).find((e) => e.isDefault)?.currency ??
          (entities.data ?? [])[0]?.currency ??
          "INR",
        onAddFxRate: (r) => write("POST", "/fx-rates", { rows: [r] }),
      }}
    />
  );
}
