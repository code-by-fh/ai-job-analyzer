import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/features/settings/ConfirmDialog";
import { renderWithProviders } from "../../support/render";

const TITLE = "Wirklich?";
const TEXT = "Das lässt sich nicht rückgängig machen.";

function renderDialog(options: { busy?: boolean; field?: boolean } = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  renderWithProviders(
    <ConfirmDialog
      title={TITLE}
      confirmLabel="Löschen"
      busy={options.busy ?? false}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <p className="prose">{TEXT}</p>
      {options.field ? <input aria-label="Passwort" type="password" data-autofocus /> : null}
    </ConfirmDialog>,
  );
  return { onConfirm, onClose };
}

describe("ConfirmDialog", () => {
  it("first focuses the close button", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Schließen" })).toHaveFocus();
  });

  it("first focuses a child that carries data-autofocus", () => {
    renderDialog({ field: true });
    expect(screen.getByLabelText("Passwort")).toHaveFocus();
  });

  // Review M3: implicit submission from a field (the T9 password).
  it("Enter in a field confirms", async () => {
    const { onConfirm, onClose } = renderDialog({ field: true });
    await userEvent.type(screen.getByLabelText("Passwort"), "geheim{Enter}");
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  // Review M3: a click on the text focuses the form, and Enter there confirms too.
  it("Enter while the dialog text has the focus confirms", async () => {
    const { onConfirm } = renderDialog();
    await userEvent.click(screen.getByText(TEXT));
    expect(screen.getByRole("button", { name: "Schließen" })).not.toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("Enter on Abbrechen cancels and does not confirm", async () => {
    const { onConfirm, onClose } = renderDialog();
    screen.getByRole("button", { name: "Abbrechen" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("a busy dialog does not confirm again", async () => {
    const { onConfirm } = renderDialog({ busy: true, field: true });
    await userEvent.type(screen.getByLabelText("Passwort"), "{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Löschen" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
