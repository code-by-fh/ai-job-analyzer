import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationsPage } from "@/features/applications/ApplicationsPage";
import { SEARCH_DEBOUNCE_MS } from "@/features/applications/useSearchDraft";
import {
  applicationsJobs,
  applicationsStubs,
  type ApplicationsServer,
} from "../../support/applicationsRoutes";
import type { RecordedCall } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { buildListItem } from "../../support/listItemFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/applications"),
);

const SETTLE_MS = SEARCH_DEBOUNCE_MS + 100;
const FIELD = { name: "Bewerbungen durchsuchen" };

function server(): ApplicationsServer {
  return {
    active: [
      buildListItem({ id: "d1", title: "Platform Engineer", company: "Otto", status: "DRAFTED" }),
      buildListItem({ id: "a1", title: "Kotlin Developer", company: "N26", status: "APPLIED" }),
      buildListItem({ id: "a2", title: "Java Developer", company: "Hermes", status: "APPLIED" }),
    ],
    closed: [],
  };
}

const searched = (calls: RecordedCall[]) =>
  new Set(calls.map((call) => new URL(call.url).searchParams.get("q")).filter(Boolean));

async function openPage() {
  renderWithProviders(<ApplicationsPage />);
  await screen.findByRole("region", { name: "Beworben" });
  return screen.getByRole("searchbox", FIELD);
}

beforeEach(() => liveNavigation.reset());

describe("Bewerbungen search", () => {
  it("writes the settled value to the URL once and asks the server only with it", async () => {
    const calls = stubRoutes(applicationsStubs(server()));
    await userEvent.type(await openPage(), "Kotlin");
    await waitFor(() =>
      expect(liveNavigation.replace).toHaveBeenCalledWith("/applications?q=Kotlin", {
        scroll: false,
      }),
    );
    expect(liveNavigation.replace).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(searched(calls)).toEqual(new Set(["Kotlin"])));
  });

  it("narrows the sections and announces the result", async () => {
    stubRoutes(applicationsStubs(server()));
    await userEvent.type(await openPage(), "Kotlin");
    expect(await screen.findByText("1 Bewerbung gefunden")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Beworben" })).getAllByRole("listitem"),
    ).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "Vorgemerkt" })).not.toBeInTheDocument();
  });

  it("keeps the previous rows, marked busy, while the next answer loads", async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const jobs = applicationsJobs(server());
    stubRoutes(
      applicationsStubs(server(), {
        "GET /jobs": async (call: RecordedCall) => {
          if (new URL(call.url).searchParams.get("q") === "Java") await held;
          return jobs(call);
        },
      }),
    );
    await userEvent.type(await openPage(), "Java");
    await waitFor(() =>
      expect(document.querySelector(".apps-sections")).toHaveAttribute("aria-busy", "true"),
    );
    expect(screen.getByRole("link", { name: "Kotlin Developer" })).toBeInTheDocument();
    release();
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Kotlin Developer" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: "Java Developer" })).toBeInTheDocument();
  });

  it("treats spaces as no search", async () => {
    const calls = stubRoutes(applicationsStubs(server()));
    await userEvent.type(await openPage(), "   ");
    await act(() => new Promise((resolve) => setTimeout(resolve, SETTLE_MS)));
    expect(liveNavigation.replace).not.toHaveBeenCalled();
    expect(searched(calls)).toEqual(new Set());
  });

  it("offers to reset a search without hits and hands focus to the field", async () => {
    stubRoutes(applicationsStubs(server()));
    const field = await openPage();
    await userEvent.type(field, "Rust");
    expect(await screen.findByText("Keine Bewerbung passt zu „Rust“.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Suche zurücksetzen" }));
    expect(field).toHaveValue("");
    expect(field).toHaveFocus();
    expect(await screen.findByRole("region", { name: "Vorgemerkt" })).toBeInTheDocument();
  });

  it("starts from the URL's search", async () => {
    liveNavigation.reset("q=Kotlin");
    stubRoutes(applicationsStubs(server()));
    renderWithProviders(<ApplicationsPage />);
    expect(await screen.findByRole("searchbox", FIELD)).toHaveValue("Kotlin");
    expect(await screen.findByRole("link", { name: "Kotlin Developer" })).toBeInTheDocument();
  });

  it("adopts a search change made outside the field", async () => {
    stubRoutes(applicationsStubs(server()));
    const field = await openPage();
    await userEvent.type(field, "Kotlin");
    await waitFor(() => expect(liveNavigation.replace).toHaveBeenCalledTimes(1));
    act(() => void liveNavigation.replace("/applications"));
    await waitFor(() => expect(field).toHaveValue(""));
  });

  it("keeps typing made after a trailing-space commit when the router answers late", async () => {
    stubRoutes(applicationsStubs(server()));
    const field = await openPage();
    liveNavigation.defer();
    await userEvent.type(field, "Kotlin ");
    await waitFor(() => expect(liveNavigation.replace).toHaveBeenCalledTimes(1));
    await userEvent.type(field, "D");
    act(() => liveNavigation.release());
    expect(field).toHaveValue("Kotlin D");
  });

  it("does not reset the field to an older commit whose answer arrives late", async () => {
    stubRoutes(applicationsStubs(server()));
    const field = await openPage();
    liveNavigation.defer();
    await userEvent.type(field, "Ja");
    await waitFor(() => expect(liveNavigation.replace).toHaveBeenCalledTimes(1));
    await userEvent.type(field, "va");
    await waitFor(() => expect(liveNavigation.replace).toHaveBeenCalledTimes(2));
    act(() => liveNavigation.release(1));
    expect(field).toHaveValue("Java");
    act(() => liveNavigation.release(1));
    expect(field).toHaveValue("Java");
  });

  it("follows Back to an earlier search", async () => {
    stubRoutes(applicationsStubs(server()));
    const field = await openPage();
    await userEvent.type(field, "Kotlin");
    await waitFor(() => expect(liveNavigation.replace).toHaveBeenCalledTimes(1));
    await userEvent.clear(field);
    await userEvent.type(field, "Java");
    await waitFor(() =>
      expect(liveNavigation.replace).toHaveBeenLastCalledWith("/applications?q=Java", {
        scroll: false,
      }),
    );
    act(() => void liveNavigation.replace("/applications?q=Kotlin"));
    await waitFor(() => expect(field).toHaveValue("Kotlin"));
  });

  it("announces only the settled answer, not the kept previous rows", async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const jobs = applicationsJobs(server());
    stubRoutes(
      applicationsStubs(server(), {
        "GET /jobs": async (call: RecordedCall) => {
          if (new URL(call.url).searchParams.get("q") === "Java") await held;
          return jobs(call);
        },
      }),
    );
    await userEvent.type(await openPage(), "Java");
    await waitFor(() =>
      expect(document.querySelector(".apps-sections")).toHaveAttribute("aria-busy", "true"),
    );
    const status = document.querySelector("p.sr-only[role=status]");
    expect(status).toBeEmptyDOMElement();
    release();
    await waitFor(() => expect(status).toHaveTextContent("1 Bewerbung gefunden"));
  });

  it("announces a search without hits with its own text", async () => {
    stubRoutes(applicationsStubs(server()));
    await userEvent.type(await openPage(), "Rust");
    await waitFor(() =>
      expect(document.querySelector("p.sr-only[role=status]")).toHaveTextContent(
        "Keine Bewerbung gefunden",
      ),
    );
  });

  it("announces an identical answer again by clearing the text in between", async () => {
    stubRoutes(applicationsStubs(server()));
    const field = await openPage();
    const status = document.querySelector("p.sr-only[role=status]")!;
    const heard: string[] = [];
    new MutationObserver(() => heard.push(status.textContent ?? "")).observe(status, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    await userEvent.type(field, "Kotlin");
    await waitFor(() => expect(status).toHaveTextContent("1 Bewerbung gefunden"));
    await userEvent.clear(field);
    await userEvent.type(field, "Java");
    await waitFor(() =>
      expect(liveNavigation.replace).toHaveBeenLastCalledWith("/applications?q=Java", {
        scroll: false,
      }),
    );
    await waitFor(() => expect(heard.filter((text) => text !== "")).toHaveLength(2));
    const first = heard.indexOf("1 Bewerbung gefunden");
    const second = heard.indexOf("1 Bewerbung gefunden", first + 1);
    expect(heard.slice(first, second)).toContain("");
  });

  it("announces that the search was cleared", async () => {
    stubRoutes(applicationsStubs(server()));
    const field = await openPage();
    await userEvent.type(field, "Kotlin");
    await waitFor(() => expect(liveNavigation.replace).toHaveBeenCalledTimes(1));
    await userEvent.type(field, "{Escape}");
    await waitFor(() =>
      expect(document.querySelector("p.sr-only[role=status]")).toHaveTextContent(
        "Suche zurückgesetzt",
      ),
    );
  });

  it("clears the search with Escape, keeps focus and writes no q", async () => {
    stubRoutes(applicationsStubs(server()));
    const field = await openPage();
    await userEvent.type(field, "Kotlin");
    await waitFor(() => expect(liveNavigation.replace).toHaveBeenCalledTimes(1));
    await userEvent.type(field, "{Escape}");
    expect(field).toHaveValue("");
    expect(field).toHaveFocus();
    expect(liveNavigation.replace).toHaveBeenLastCalledWith("/applications", { scroll: false });
  });

  it("does not claim a search without hits while the answer for the new search is loading", async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const jobs = applicationsJobs(server());
    const calls = stubRoutes(
      applicationsStubs(server(), {
        "GET /jobs": async (call: RecordedCall) => {
          if (new URL(call.url).searchParams.get("q") === "Rus") await held;
          return jobs(call);
        },
      }),
    );
    const field = await openPage();
    await userEvent.type(field, "Rust");
    expect(await screen.findByText("Keine Bewerbung passt zu „Rust“.")).toBeInTheDocument();
    await userEvent.type(field, "{Backspace}");
    await waitFor(() => expect(searched(calls)).toContain("Rus"));
    expect(screen.queryByText(/Keine Bewerbung passt zu/)).not.toBeInTheDocument();
    release();
    expect(await screen.findByText("Keine Bewerbung passt zu „Rus“.")).toBeInTheDocument();
  });

  it("shows the search's no-match text, not the phase text, in an empty filtered phase", async () => {
    liveNavigation.reset("q=Kotlin&phase=angebot");
    stubRoutes(applicationsStubs(server()));
    renderWithProviders(<ApplicationsPage />);
    expect(await screen.findByText("Keine Bewerbung passt zu „Kotlin“.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suche zurücksetzen" })).toBeInTheDocument();
  });
});
