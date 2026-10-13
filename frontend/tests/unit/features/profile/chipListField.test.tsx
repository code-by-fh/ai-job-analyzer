import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ChipListField } from "@/features/profile/goal/ChipListField";
import { renderWithProviders } from "../../support/render";

function Harness({ initial }: { initial: string[] }) {
  const [items, setItems] = useState(initial);
  return (
    <form>
      <ChipListField
        id="chips"
        label="Kenntnisse"
        items={items}
        onChange={setItems}
        limits={{ maxItems: 3, maxLength: 10, noComma: true }}
      />
    </form>
  );
}

describe("ChipListField", () => {
  it("adds with Enter without submitting the form and clears the input", async () => {
    renderWithProviders(<Harness initial={["Kotlin"]} />);
    await userEvent.type(screen.getByLabelText("Kenntnisse"), "Go{Enter}");
    expect(screen.getByRole("list", { name: "Kenntnisse: Einträge" })).toHaveTextContent(
      "KotlinGo",
    );
    expect(screen.getByLabelText("Kenntnisse")).toHaveValue("");
  });

  it("refuses a duplicate, a comma and a full list with a fixed sentence", async () => {
    renderWithProviders(<Harness initial={["Kotlin", "Java", "Go"]} />);
    const input = screen.getByLabelText("Kenntnisse");
    await userEvent.type(input, "kotlin{Enter}");
    expect(screen.getByText("Schon in der Liste.")).toBeVisible();
    await userEvent.clear(input);
    await userEvent.type(input, "a,b{Enter}");
    expect(screen.getByText("Ohne Komma: jede Kenntnis einzeln hinzufügen.")).toBeVisible();
    await userEvent.clear(input);
    await userEvent.type(input, "Rust{Enter}");
    expect(screen.getByText("Höchstens 3 Einträge.")).toBeVisible();
  });

  it("clears its refusal when the entry changes", async () => {
    renderWithProviders(<Harness initial={["Kotlin"]} />);
    const input = screen.getByLabelText("Kenntnisse");
    await userEvent.type(input, "kotlin{Enter}");
    expect(screen.getByText("Schon in der Liste.")).toBeVisible();
    await userEvent.type(input, "x");
    expect(screen.queryByText("Schon in der Liste.")).toBeNull();
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("clears its refusal when a chip is removed", async () => {
    renderWithProviders(<Harness initial={["Kotlin", "Java", "Go"]} />);
    await userEvent.type(screen.getByLabelText("Kenntnisse"), "Rust{Enter}");
    expect(screen.getByText("Höchstens 3 Einträge.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Go entfernen" }));
    expect(screen.queryByText("Höchstens 3 Einträge.")).toBeNull();
  });

  it("removes a chip by its named button and moves focus to the input", async () => {
    renderWithProviders(<Harness initial={["Kotlin", "Java"]} />);
    await userEvent.click(screen.getByRole("button", { name: "Kotlin entfernen" }));
    expect(screen.queryByRole("button", { name: "Kotlin entfernen" })).toBeNull();
    expect(screen.getByLabelText("Kenntnisse")).toHaveFocus();
  });
});
