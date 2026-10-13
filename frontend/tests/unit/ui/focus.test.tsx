import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { closeThenFocus } from "@/ui/focus";

const TARGET_ID = "focus-target";

/** Reports from inside the confirm handler whether the dialog's close has already committed. */
function DialogHost({ report }: { report: (dialogGone: boolean) => void }) {
  const [open, setOpen] = useState(true);
  const confirm = () => {
    closeThenFocus(
      () => setOpen(false),
      () => document.getElementById(TARGET_ID),
    );
    report(document.querySelector('[role="dialog"]') === null);
  };
  return (
    <>
      <button type="button" id={TARGET_ID}>
        Ziel
      </button>
      {open ? (
        <div role="dialog" aria-label="Frage">
          <button type="button" onClick={confirm}>
            Ja
          </button>
        </div>
      ) : null}
    </>
  );
}

describe("closeThenFocus", () => {
  it("commits the close inside the handler and focuses the target one frame later", async () => {
    const report = vi.fn();
    render(<DialogHost report={report} />);
    await userEvent.click(screen.getByRole("button", { name: "Ja" }));
    expect(report).toHaveBeenCalledWith(true);
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Ziel" })).toHaveFocus());
  });
});
