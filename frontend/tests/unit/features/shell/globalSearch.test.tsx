import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SEARCH_LIMITS } from "@/api/adminPaths";
import type { SearchResultBody } from "@/api/search";
import { GlobalSearch, requestSearch } from "@/features/shell/GlobalSearch";
import { blockAnchorNavigation } from "../../support/blockNavigation";
import { jsonResponse } from "../../support/fakeFetch";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

blockAnchorNavigation();
afterEach(() => vi.useRealTimers());

const FIELD = "Stellen und Firmen durchsuchen";
const JOB_HIT: SearchResultBody["jobs"][number] = {
  id: "j1",
  title: "Kotlin Dev",
  company: "ACME",
  company_domain: "acme.de",
  status: "OPEN",
  is_archived: false,
};
const COMPANY_HIT = { domain: "acme.de", name: "ACME" };
const COMPANY_LINK = /^ACME acme\.de$/;
const HITS: SearchResultBody = { jobs: [JOB_HIT], companies: [COMPANY_HIT] };

const field = () => screen.getByLabelText(FIELD);
const dialog = () => screen.getByRole("dialog", { name: "Suche" });
const searchCalls = (calls: { url: string }[]) =>
  calls.filter((call) => new URL(call.url).pathname === "/search");

async function searchFor(text: string, answer: SearchResultBody | (() => Response) = HITS) {
  const calls = stubRoutes({ "GET /search": answer });
  renderWithProviders(<GlobalSearch />);
  await userEvent.keyboard("/");
  await userEvent.type(field(), text);
  return calls;
}

describe("global search", () => {
  it("one request after typing stops, none below two characters", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const calls = await searchFor("k");
    expect(screen.getByText("Mindestens 2 Zeichen.")).toBeVisible();
    await userEvent.type(field(), "otl");
    await act(() => vi.advanceTimersByTimeAsync(SEARCH_LIMITS.debounceMs));
    await screen.findByRole("link", { name: /Kotlin Dev/ });
    expect(searchCalls(calls)).toHaveLength(1);
    expect(new URL(calls[0]!.url).searchParams.get("q")).toBe("kotl");
  });

  it("caps the field at 200 characters", async () => {
    await searchFor("ko");
    expect(field()).toHaveAttribute("maxLength", String(SEARCH_LIMITS.max));
  });

  it("arrow keys move through results and Enter on a company closes the dialog", async () => {
    await searchFor("acme");
    const company = await screen.findByRole("link", { name: COMPANY_LINK });
    expect(company).toHaveAttribute("href", "/companies?domain=acme.de");
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("link", { name: /Kotlin Dev/ })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(company).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Home and End jump in the results, ArrowUp from the first result returns to the field", async () => {
    await searchFor("acme");
    const job = await screen.findByRole("link", { name: /Kotlin Dev/ });
    await userEvent.keyboard("{ArrowDown}{End}");
    expect(screen.getByRole("link", { name: COMPANY_LINK })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(job).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(field()).toHaveFocus();
  });

  it("Home and End in the field move the caret, not the focus", async () => {
    await searchFor("acme");
    await screen.findByRole("link", { name: /Kotlin Dev/ });
    await userEvent.keyboard("{Home}");
    expect(field()).toHaveFocus();
    expect((field() as HTMLInputElement).selectionStart).toBe(0);
  });

  it("says when nothing matches and announces the count", async () => {
    await searchFor("zz", { jobs: [], companies: [] });
    expect(await screen.findByText("Nichts gefunden für „zz“.")).toBeVisible();
    expect(within(dialog()).getByRole("status")).toHaveTextContent("Nichts gefunden");
  });

  it("announces the number of hits", async () => {
    await searchFor("acme");
    await screen.findByRole("link", { name: /Kotlin Dev/ });
    expect(within(dialog()).getByRole("status")).toHaveTextContent("2 Ergebnisse");
  });

  it("announces a single hit in the singular", async () => {
    await searchFor("kotlin", { jobs: [JOB_HIT], companies: [] });
    await screen.findByRole("link", { name: /Kotlin Dev/ });
    expect(within(dialog()).getByRole("status")).toHaveTextContent("1 Ergebnis");
  });

  it("groups the hits under Stellen and Firmen and leaves out an empty group", async () => {
    await searchFor("kotlin", { jobs: [JOB_HIT], companies: [] });
    await screen.findByRole("link", { name: /Kotlin Dev/ });
    expect(screen.getByRole("heading", { level: 3, name: "Stellen" })).toBeVisible();
    expect(screen.queryByRole("heading", { level: 3, name: "Firmen" })).toBeNull();
    expect(screen.getByRole("link", { name: /Kotlin Dev/ })).toHaveTextContent("ACME · Treffer");
  });

  it("an archived job says so", async () => {
    await searchFor("kotlin", { jobs: [{ ...JOB_HIT, is_archived: true }], companies: [] });
    const link = await screen.findByRole("link", { name: /Kotlin Dev/ });
    expect(link).toHaveTextContent("ACME · Aussortiert");
    expect(link).not.toHaveTextContent("Treffer");
  });

  it("a 429 shows the wait sentence, never the server's text", async () => {
    await searchFor("acme", () => jsonResponse(429, { detail: "Rate limit exceeded" }));
    expect(
      await within(dialog()).findByText("Zu viele Anfragen, bitte kurz warten."),
    ).toBeVisible();
    expect(screen.queryByText(/Rate limit exceeded/)).toBeNull();
  });

  it("closing clears the text", async () => {
    await searchFor("acme");
    await userEvent.keyboard("{Escape}");
    act(() => requestSearch());
    expect(field()).toHaveValue("");
  });
});
