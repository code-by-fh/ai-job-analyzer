import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tabs } from "@/ui/Tabs";

describe("Tabs suffix", () => {
  it("shows the suffix after the label inside the tab", () => {
    render(
      <Tabs
        items={[{ key: "a", label: "Neu", suffix: <span>3</span> }]}
        selected="a"
        onSelect={() => undefined}
        label="Filter"
        idPrefix="t"
      />,
    );
    expect(screen.getByRole("tab", { name: "Neu 3" })).toBeInTheDocument();
  });

  it("names a tab without a suffix by its label alone", () => {
    render(
      <Tabs
        items={[{ key: "a", label: "Neu" }]}
        selected="a"
        onSelect={() => undefined}
        label="Filter"
        idPrefix="t"
      />,
    );
    expect(screen.getByRole("tab", { name: "Neu" })).toBeInTheDocument();
  });
});
