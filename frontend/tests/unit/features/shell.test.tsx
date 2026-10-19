import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { activityLabel } from "@/features/shell/ActivityButton";
import { GlobalSearch, isTypingTarget, requestSearch } from "@/features/shell/GlobalSearch";
import { initialOf, isActivePath, isMoreActive } from "@/features/shell/navigation";
import { NavBadge } from "@/features/shell/Sidebar";
import { translatorFor } from "@/i18n/translate";
import { renderWithProviders } from "../support/render";

const t = translatorFor("de");

describe("navigation", () => {
  it("treats nested paths as active", () => {
    expect(isActivePath("/sources", "/sources")).toBe(true);
    expect(isActivePath("/sources/3", "/sources")).toBe(true);
  });

  it("does not match a path that only shares a prefix", () => {
    expect(isActivePath("/inbox-archive", "/inbox")).toBe(false);
  });

  it("marks Mehr active on profile and settings pages", () => {
    expect(isMoreActive("/settings")).toBe(true);
    expect(isMoreActive("/inbox")).toBe(false);
  });

  it("derives the avatar initial from the username", () => {
    expect(initialOf(" admin")).toBe("A");
  });
});

describe("activityLabel", () => {
  it.each([
    [0, "Aktivität"],
    [1, "1 Aufgabe läuft"],
    [3, "3 Aufgaben laufen"],
  ])("%i running tasks read %s", (running, label) => {
    expect(activityLabel(running, t)).toBe(label);
  });
});

describe("NavBadge", () => {
  it("shows new matches on the inbox", () => {
    render(<NavBadge itemKey="inbox" counts={{ inbox: 3, sourceErrors: 0, applicationsDue: 0 }} />);
    expect(screen.getByText("3 neue Treffer")).toBeInTheDocument();
  });

  it("shows failing sources as text", () => {
    render(
      <NavBadge itemKey="sources" counts={{ inbox: 0, sourceErrors: 1, applicationsDue: 0 }} />,
    );
    expect(screen.getByText("1 Fehler")).toBeInTheDocument();
  });

  it("renders nothing for zero counts", () => {
    const { container } = render(
      <NavBadge itemKey="inbox" counts={{ inbox: 0, sourceErrors: 0, applicationsDue: 0 }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("GlobalSearch", () => {
  it("opens with the / key", async () => {
    renderWithProviders(<GlobalSearch />);
    await userEvent.keyboard("/");
    expect(screen.getByRole("dialog", { name: "Suche" })).toBeInTheDocument();
    expect(screen.getByLabelText("Stellen und Firmen durchsuchen")).toHaveFocus();
  });

  it("does not open while typing in a field", async () => {
    render(
      <>
        <input aria-label="Notiz" />
        <GlobalSearch />
      </>,
    );
    await userEvent.type(screen.getByLabelText("Notiz"), "a/b");
    expect(screen.getByLabelText("Notiz")).toHaveValue("a/b");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes with Escape", async () => {
    renderWithProviders(<GlobalSearch />);
    await userEvent.keyboard("/");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("search entry in the Mehr sheet", () => {
  it("opens the search dialog on request", async () => {
    renderWithProviders(<GlobalSearch />);
    act(() => requestSearch());
    expect(screen.getByRole("dialog", { name: "Suche" })).toBeInTheDocument();
  });
});

describe("isTypingTarget", () => {
  it("recognises editable elements", () => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(editor)).toBe(true);
    expect(isTypingTarget(document.body)).toBe(false);
  });
});
