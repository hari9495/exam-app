import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@yukthix/ui";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import YxReportAccidentPage from "./(app)/desk/accidents/report/page";
import YxAccidentPage from "./(app)/desk/accidents/[id]/page";
import YxCasesPage from "./(app)/desk/cases/page";
import YxMyCasesPage from "./(app)/desk/my-cases/page";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
  useSearchParams: jest.fn(),
  useParams: jest.fn(),
}));
jest.mock("../../lib/api-client", () => ({
  apiFetch: jest.fn(),
  apiFetchAnonymous: jest.fn(),
  apiFetchBlob: jest.fn(),
  API_BASE: "",
}));
jest.mock("../../lib/auth-context", () => ({ useAuth: jest.fn() }));

// Helpdesk › accident cases (HLP-12): the designed screens with `live`, positive and negative.
const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
const api = apiFetch as jest.Mock;
const push = jest.fn();
const FORM = {
  locations: [{ id: "hsr", name: "Hosur plant" }],
  injuryTypes: ["Crush", "Fall"],
  ready: true,
  meEmployeeId: "e1",
  me: { id: "e1", name: "Sathish Kumar" },
};
const MANAGER = {
  view: "manager",
  id: "a1",
  number: "ACC-0001",
  injuredName: "Sathish Kumar",
  leaveFrom: "2026-11-02",
  leaveTo: "2026-11-09",
  leaveStatus: "approved",
};
const notFound = Object.assign(new Error("Not found."), { status: 404 });

beforeEach(() => {
  api.mockReset();
  push.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: "tok" });
  (useParams as jest.Mock).mockReturnValue({ id: "a1" });
});

describe("Helpdesk › accident cases (HLP-12 live)", () => {
  it("a report goes with the sign-in and the time in India; then back to the Help centre", async () => {
    api.mockImplementation(async (path: string) =>
      path === "/desk/accidents/form" ? FORM : { id: "a9", number: "ACC-0009" },
    );
    wrap(<YxReportAccidentPage />);
    await userEvent.type(
      await screen.findByRole("textbox", { name: /Time/ }),
      "10:30 am",
    );
    await userEvent.tab();
    await userEvent.type(
      screen.getByRole("textbox", { name: /Where exactly/ }),
      "Packing line 2",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /What happened/ }),
      "Hand caught in the machine guard.",
    );
    await userEvent.click(
      screen.getByRole("combobox", { name: /Injury type/ }),
    );
    await userEvent.click(await screen.findByRole("option", { name: "Crush" }));
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));
    const call = await (async () => {
      for (let i = 0; i < 50; i++) {
        const c = api.mock.calls.find(
          ([p, o]) => p === "/desk/accidents" && o?.method === "POST",
        );
        if (c) return c;
        await new Promise((r) => setTimeout(r, 20));
      }
      return undefined;
    })();
    expect(call).toBeDefined();
    expect(call![2]).toBe("tok");
    expect(JSON.parse(call![1].body)).toMatchObject({
      injuredKind: "employee",
      injuredEmployeeId: "e1",
      locationId: "hsr",
      injuryType: "Crush",
    });
    expect(JSON.parse(call![1].body).occurredAt).toMatch(/T10:30:00\+05:30$/);
    await screen.findAllByText("Accident ACC-0009 reported");
    expect(push).toHaveBeenCalledWith("/yx/desk/help");
  });

  it("the manager gets the leave dates only", async () => {
    api.mockResolvedValue(MANAGER);
    wrap(<YxAccidentPage />);
    expect(
      await screen.findByText("Injury leave · Sathish Kumar"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Shifts in this period are marked as injury leave"),
    ).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith("/desk/accidents/a1", {}, "tok");
  });

  it("someone not on the case sees Not found", async () => {
    api.mockRejectedValue(notFound);
    wrap(<YxAccidentPage />);
    expect(await screen.findByText("Not found")).toBeInTheDocument();
  });

  it("the Cases list shows accident rows too and opens them in the accident workspace", async () => {
    api.mockImplementation(async (path: string) =>
      path === "/desk/cases/disciplinary/people"
        ? { people: [] }
        : path === "/desk/accidents"
          ? [
              {
                id: "a1",
                ref: "ACC-0001",
                kind: "accident",
                subject: "Crush, Packing line 2",
                location: "Hosur plant",
                stage: "ESIC accident report due",
                raisedBy: "Ravi",
                anonymous: false,
                owner: "Safety team",
                next: { label: "ESIC accident report", on: "2026-11-02" },
                overdue: true,
                status: "action",
              },
            ]
          : [],
    );
    wrap(<YxCasesPage />);
    await userEvent.click(await screen.findByText("Crush, Packing line 2"));
    expect(push).toHaveBeenCalledWith("/yx/desk/accidents/a1");
  });

  it("the injured person picker searches on the server (2 letters or more)", async () => {
    api.mockImplementation(async (path: string) =>
      path === "/desk/accidents/form"
        ? FORM
        : path.startsWith("/desk/accidents/people")
          ? [{ id: "e7", name: "Murali Iyer" }]
          : {},
    );
    wrap(<YxReportAccidentPage />);
    await userEvent.click(
      await screen.findByRole("combobox", { name: /^Name/ }),
    );
    await userEvent.type(
      await screen.findByPlaceholderText("Type 2 or more letters of the name"),
      "Mu",
    );
    expect(
      await screen.findByRole("option", { name: "Murali Iyer" }),
    ).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith("/desk/accidents/people?q=Mu", {}, "tok");
  });

  it("My cases lists accidents the person reported and opens one from its own route, status only", async () => {
    (useSearchParams as jest.Mock).mockReturnValue(
      new URLSearchParams("case=a1"),
    );
    api.mockImplementation(async (path: string) =>
      path === "/desk/my/cases"
        ? []
        : path === "/desk/accidents/mine"
          ? [
              {
                id: "a1",
                ref: "ACC-0001",
                kind: "accident",
                role: "reporter",
                stage: "Received",
                status: "open",
                next: null,
                unread: 0,
              },
            ]
          : path === "/desk/accidents/mine/a1"
            ? {
                id: "a1",
                ref: "ACC-0001",
                kind: "accident",
                role: "reporter",
                stage: "Received",
                status: "open",
                openedOn: "2026-11-01",
                dates: [],
                datesSource: "",
                messages: [],
                outcome: null,
                appealUntil: null,
              }
            : Promise.reject(new Error(`unexpected ${path}`)),
    );
    wrap(<YxMyCasesPage />);
    expect(
      (await screen.findAllByText("The safety team has your report")).length,
    ).toBeGreaterThan(0);
    expect(api.mock.calls.some(([p]) => p === "/desk/my/cases/a1")).toBe(false);
  });
});
