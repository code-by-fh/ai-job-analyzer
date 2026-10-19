import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ViewerDialog } from "@/ui/ViewerDialog";

const TITLE = "Lebenslauf";
const SUBTITLE = "ACME GmbH";

function ViewerHarness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const close = () => {
    onClose?.();
    setOpen(false);
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Öffnen
      </button>
      {open ? (
        <ViewerDialog
          title={TITLE}
          subtitle={SUBTITLE}
          actions={<button type="button">Bearbeiten</button>}
          notice={<p>Hinweis</p>}
          onClose={close}
        >
          <p>Seite</p>
        </ViewerDialog>
      ) : null}
    </>
  );
}

async function openViewer(onClose?: () => void) {
  render(<ViewerHarness onClose={onClose} />);
  await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
  return screen.getByRole("dialog", { name: TITLE });
}

// A plain header, not role="toolbar": that role promises arrow-key navigation between the buttons.
const barOf = (dialog: HTMLElement) => dialog.querySelector<HTMLElement>(".viewer-bar")!;

describe("ViewerDialog", () => {
  it("shows title and subtitle in the toolbar, the actions before the close button", async () => {
    const dialog = await openViewer();
    const toolbar = barOf(dialog);
    expect(within(toolbar).getByRole("heading", { level: 2, name: TITLE })).toBeInTheDocument();
    expect(toolbar).toHaveTextContent(SUBTITLE);
    const buttons = within(toolbar).getAllByRole("button");
    expect(
      buttons.map((button) => button.textContent || button.getAttribute("aria-label")),
    ).toEqual(["Bearbeiten", "Schließen"]);
  });

  it("puts the notice between the toolbar and the page", async () => {
    const dialog = await openViewer();
    const notice = within(dialog).getByText("Hinweis");
    const page = within(dialog).getByText("Seite");
    expect(barOf(dialog).compareDocumentPosition(notice)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(notice.compareDocumentPosition(page)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("closes with the close button and with Escape, returning focus to the opener", async () => {
    const onClose = vi.fn();
    const dialog = await openViewer(onClose);
    await userEvent.click(within(dialog).getByRole("button", { name: "Schließen" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Öffnen" })).toHaveFocus();
  });

  it("is the frameless large viewer variant of the dialog", async () => {
    const dialog = await openViewer();
    expect(dialog).toHaveClass("dialog", "viewer");
  });
});
