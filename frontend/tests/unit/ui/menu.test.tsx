import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "@/ui/Dialog";
import { MenuButton, menuFocusIndex, type MenuItem } from "@/ui/Menu";

type Key = "a" | "b" | "c";
const ITEMS: readonly MenuItem<Key>[] = [
  { key: "a", label: "Vorgemerkt" },
  { key: "b", label: "Beworben", checked: true },
  { key: "c", label: "Interview", disabled: true },
];

function renderMenu(onSelect = vi.fn()) {
  render(
    <MenuButton
      buttonLabel="Phase ändern"
      menuLabel="Phase ändern"
      items={ITEMS}
      onSelect={onSelect}
    />,
  );
  return { onSelect, button: screen.getByRole("button", { name: "Phase ändern" }) };
}

describe("menuFocusIndex", () => {
  it.each([
    ["ArrowDown", 2, 3, 0],
    ["ArrowUp", 0, 3, 2],
    ["Home", 2, 3, 0],
    ["End", 0, 3, 2],
  ])("%s from %i of %i goes to %i", (key, current, count, target) => {
    expect(menuFocusIndex(key, current, count)).toBe(target);
  });

  it("ignores other keys", () => {
    expect(menuFocusIndex("a", 0, 3)).toBeNull();
  });
});

describe("MenuButton", () => {
  it("is a menu button that starts closed", () => {
    const { button } = renderMenu();
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("opens on click and focuses the checked item", async () => {
    const { button } = renderMenu();
    await userEvent.click(button);
    expect(screen.getByRole("menu", { name: "Phase ändern" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Beworben" })).toHaveFocus();
    expect(screen.getByRole("menuitemradio", { name: "Beworben" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("moves focus with the arrow keys", async () => {
    const { button } = renderMenu();
    await userEvent.click(button);
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemradio", { name: "Interview" })).toHaveFocus();
  });

  it("closes on Escape and returns focus to the button", async () => {
    const { button } = renderMenu();
    await userEvent.click(button);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("reports the chosen item and closes", async () => {
    const { button, onSelect } = renderMenu();
    await userEvent.click(button);
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Vorgemerkt" }));
    expect(onSelect).toHaveBeenCalledWith("a");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("ignores a disabled item", async () => {
    const { button, onSelect } = renderMenu();
    await userEvent.click(button);
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Interview" }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("opens with ArrowDown from the button", async () => {
    const { button } = renderMenu();
    button.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("closes on Tab without trapping focus", async () => {
    const { button } = renderMenu();
    await userEvent.click(button);
    await userEvent.tab();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("jumps with Home and End", async () => {
    const { button } = renderMenu();
    await userEvent.click(button);
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("menuitemradio", { name: "Interview" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("menuitemradio", { name: "Vorgemerkt" })).toHaveFocus();
  });

  it("wraps ArrowUp from the first item to the last", async () => {
    const { button } = renderMenu();
    await userEvent.click(button);
    await userEvent.keyboard("{Home}{ArrowUp}");
    expect(screen.getByRole("menuitemradio", { name: "Interview" })).toHaveFocus();
  });

  it("closes on a click outside", async () => {
    const { button } = renderMenu();
    await userEvent.click(button);
    await userEvent.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes only the menu on Escape inside an open dialog", async () => {
    const onDialogClose = vi.fn();
    render(
      <Dialog open onClose={onDialogClose} label="Dialog">
        <MenuButton buttonLabel="Phase ändern" menuLabel="Phase" items={ITEMS} onSelect={vi.fn()} />
      </Dialog>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Phase ändern" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Dialog" })).toBeInTheDocument();
    expect(onDialogClose).not.toHaveBeenCalled();
  });
});
