import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { APPLICATIONS_PAGE_SIZE } from "@/api/jobList";
import { ApplicationsPage } from "@/features/applications/ApplicationsPage";
import { LIST_ID, useListFocus } from "@/features/applications/useListFocus";
import { applicationsStubs } from "../../support/applicationsRoutes";
import { liveNavigation } from "../../support/liveNavigation";
import { buildListItem } from "../../support/listItemFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/applications"),
);

type Place = "a" | "b" | "none";

/** Two lists; `where` says which list holds the job, as two phase sections would. */
function Lists({ where }: { where: Place }) {
  const ref = useListFocus();
  const link = <Link href="/jobs/job-7">Kotlin Developer</Link>;
  return (
    <>
      <button type="button">Outside</button>
      <div id={LIST_ID} ref={ref} tabIndex={-1}>
        <ul>{where === "a" ? <li>{link}</li> : null}</ul>
        <ul>{where === "b" ? <li>{link}</li> : null}</ul>
        <button type="button">Inside</button>
      </div>
    </>
  );
}

const kotlin = () => screen.getByRole("link", { name: "Kotlin Developer" });
const list = () => document.getElementById(LIST_ID);
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => liveNavigation.reset());

describe("useListFocus", () => {
  it("follows the focused job when its row moves to another section", async () => {
    const view = render(<Lists where="a" />);
    kotlin().focus();
    view.rerender(<Lists where="b" />);
    await waitFor(() => expect(kotlin()).toHaveFocus());
  });

  it("hands focus to the list when the focused row leaves it", async () => {
    const view = render(<Lists where="a" />);
    kotlin().focus();
    view.rerender(<Lists where="none" />);
    await waitFor(() => expect(list()).toHaveFocus());
  });

  it("keeps the job when the browser reports a blur without a new target", async () => {
    // Chrome fires focusout (relatedTarget null) on a focused element that is removed.
    const view = render(<Lists where="a" />);
    kotlin().focus();
    fireEvent.focusOut(kotlin(), { relatedTarget: null });
    view.rerender(<Lists where="b" />);
    await waitFor(() => expect(kotlin()).toHaveFocus());
  });

  it("leaves focus alone when it is outside the list", async () => {
    const view = render(<Lists where="a" />);
    kotlin().focus();
    screen.getByRole("button", { name: "Outside" }).focus();
    view.rerender(<Lists where="none" />);
    await nextTask();
    expect(screen.getByRole("button", { name: "Outside" })).toHaveFocus();
  });

  it("does not pull focus back after it left the list and then dropped to the body", async () => {
    // E.g. a toast button outside the list took focus and then went away without a return.
    const view = render(<Lists where="a" />);
    kotlin().focus();
    const outside = screen.getByRole("button", { name: "Outside" });
    outside.focus();
    outside.blur();
    view.rerender(<Lists where="none" />);
    await nextTask();
    expect(list()).not.toHaveFocus();
    expect(document.activeElement).toBe(document.body);
  });

  it("leaves focus alone while the focused element stays", async () => {
    const view = render(<Lists where="a" />);
    screen.getByRole("button", { name: "Inside" }).focus();
    view.rerender(<Lists where="b" />);
    await nextTask();
    expect(screen.getByRole("button", { name: "Inside" })).toHaveFocus();
  });
});

describe("the applications list", () => {
  it("is one named group around the sections, not another landmark", async () => {
    stubRoutes(applicationsStubs({ active: [buildListItem({ status: "APPLIED" })], closed: [] }));
    renderWithProviders(<ApplicationsPage />);
    const group = await screen.findByRole("group", { name: "Bewerbungen nach Phase" });
    expect(group).toHaveAttribute("id", LIST_ID);
    expect(group).toHaveAttribute("tabindex", "-1");
    expect(screen.queryByRole("region", { name: "Bewerbungen nach Phase" })).toBeNull();
  });

  it("keeps focus in the list when Weitere laden leaves after the last page", async () => {
    const active = Array.from({ length: APPLICATIONS_PAGE_SIZE + 1 }, (_, index) =>
      buildListItem({ id: `d${index}`, title: `Drafted ${index}`, status: "DRAFTED" }),
    );
    stubRoutes(applicationsStubs({ active, closed: [] }));
    renderWithProviders(<ApplicationsPage />);
    expect(await screen.findByText("100 von 101 Bewerbungen geladen.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Weitere laden" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Weitere laden" })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(list()).toHaveFocus());
  });
});
