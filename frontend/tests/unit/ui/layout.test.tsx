import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Inbox } from "lucide-react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyState } from "@/ui/EmptyState";
import { Masthead } from "@/ui/Masthead";
import { PageSkeleton } from "@/ui/Skeleton";
import { Stepper } from "@/ui/Stepper";
import { nextTabIndex, TabPanel, Tabs, type TabItem } from "@/ui/Tabs";

type TabKey = "fit" | "docs" | "history";
const TAB_ITEMS: readonly TabItem<TabKey>[] = [
  { key: "fit", label: "Passung" },
  { key: "docs", label: "Unterlagen" },
  { key: "history", label: "Verlauf" },
];

function TabsHarness() {
  const [selected, setSelected] = useState<TabKey>("fit");
  return (
    <>
      <Tabs
        items={TAB_ITEMS}
        selected={selected}
        onSelect={setSelected}
        label="Bereiche"
        idPrefix="job"
      />
      <TabPanel idPrefix="job" selected={selected}>
        Inhalt {selected}
      </TabPanel>
    </>
  );
}

describe("Masthead", () => {
  it("renders the page heading with its section number hidden from screen readers", () => {
    render(<Masthead number="01" title="Eingang" deck="3 neue Treffer" />);
    expect(screen.getByRole("heading", { level: 1, name: "Eingang" })).toBeInTheDocument();
    expect(screen.getByText("01")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("EmptyState", () => {
  it("shows title, text and actions", () => {
    render(
      <EmptyState
        icon={Inbox}
        title="Alles gesichtet"
        actions={<button type="button">Quelle hinzufügen</button>}
      >
        Neue Treffer erscheinen nach dem nächsten Lauf.
      </EmptyState>,
    );
    expect(screen.getByRole("heading", { name: "Alles gesichtet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quelle hinzufügen" })).toBeInTheDocument();
  });
});

describe("PageSkeleton", () => {
  it("is a busy region with a translated label", () => {
    render(<PageSkeleton />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Lädt …");
  });
});

interface StripStub {
  strip: string;
  item: string;
  overflow: boolean;
}

/** jsdom has no layout: strip is 100px wide at x=0, the matching item sits at x=300 (width 100). */
function stubStripLayout({ strip, item, overflow }: StripStub): void {
  const rect = (left: number) => ({ left, width: 100, right: left + 100 }) as DOMRect;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this.classList.contains(strip)) return rect(0);
    return this.matches(item) ? rect(300) : rect(0);
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(100);
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(overflow ? 600 : 100);
}

afterEach(() => vi.restoreAllMocks());

describe("Tabs", () => {
  it("only scrolls the tab strip horizontally, never the page", () => {
    stubStripLayout({ strip: "tabs", item: '[role="tab"][aria-selected="true"]', overflow: true });
    const pageScroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const intoView = vi.fn();
    Element.prototype.scrollIntoView = intoView;
    render(<TabsHarness />);
    expect(screen.getByRole("tablist").scrollLeft).toBe(300);
    expect(pageScroll).not.toHaveBeenCalled();
    expect(intoView).not.toHaveBeenCalled();
  });

  it("leaves browser shortcuts such as Alt+ArrowLeft alone", async () => {
    render(<TabsHarness />);
    await userEvent.click(screen.getByRole("tab", { name: "Passung" }));
    await userEvent.keyboard("{Alt>}{ArrowLeft}{/Alt}");
    expect(screen.getByRole("tab", { name: "Passung" })).toHaveAttribute("aria-selected", "true");
  });

  it("makes the panel focusable", () => {
    render(<TabsHarness />);
    expect(screen.getByRole("tabpanel")).toHaveAttribute("tabindex", "0");
  });

  it("selects a tab by click and links it to the panel", async () => {
    render(<TabsHarness />);
    await userEvent.click(screen.getByRole("tab", { name: "Unterlagen" }));
    expect(screen.getByRole("tab", { name: "Unterlagen" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel", { name: "Unterlagen" })).toHaveTextContent("Inhalt docs");
  });

  it("moves selection and focus with the arrow keys", async () => {
    render(<TabsHarness />);
    await userEvent.click(screen.getByRole("tab", { name: "Passung" }));
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Verlauf" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Verlauf" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("nextTabIndex", () => {
  it.each([
    ["ArrowRight", 2, 0],
    ["ArrowLeft", 0, 2],
    ["Home", 1, 0],
    ["End", 0, 2],
  ])("%s from %i goes to %i of three tabs", (key, current, target) => {
    expect(nextTabIndex(key, current, 3)).toBe(target);
  });

  it("ignores other keys", () => {
    expect(nextTabIndex("Enter", 1, 3)).toBeNull();
  });
});

describe("Stepper", () => {
  const STEPS = [
    { key: "OPEN", label: "Treffer", state: "past" as const },
    { key: "DRAFTED", label: "Vorgemerkt", date: "07.10.", state: "current" as const },
    { key: "APPLIED", label: "Beworben", state: "future" as const },
  ];

  it("marks past, current and future phases", () => {
    render(<Stepper steps={STEPS} label="Phase der Bewerbung" />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveClass("step", "past");
    expect(items[1]).toHaveClass("step", "current");
    expect(items[2]).toHaveClass("step", "future");
    expect(items[1]).toHaveAttribute("aria-current", "step");
  });

  it("states done, current and upcoming in text, not only by colour", () => {
    render(<Stepper steps={STEPS} label="Phase der Bewerbung" />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("erledigt");
    expect(items[1]).toHaveTextContent("aktuell");
    expect(items[2]).toHaveTextContent("offen");
  });

  it("centres the current step inside an overflowing strip", () => {
    stubStripLayout({ strip: "stepper", item: ".step.current", overflow: true });
    render(<Stepper steps={STEPS} label="Phase der Bewerbung" />);
    expect(screen.getByRole("list").scrollLeft).toBe(300);
  });

  it("does not scroll a strip that fits", () => {
    stubStripLayout({ strip: "stepper", item: ".step.current", overflow: false });
    render(<Stepper steps={STEPS} label="Phase der Bewerbung" />);
    expect(screen.getByRole("list").scrollLeft).toBe(0);
  });

  it("is read-only", () => {
    render(<Stepper steps={STEPS} label="Phase der Bewerbung" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
