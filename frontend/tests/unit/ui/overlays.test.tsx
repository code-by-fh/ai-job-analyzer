import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "@/ui/Dialog";
import { Drawer } from "@/ui/Drawer";
import { PanelHeader } from "@/ui/PanelHeader";
import { Popover } from "@/ui/Popover";

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Öffnen
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} label="Suche">
        <button type="button">Erste</button>
        <input aria-label="Suchbegriff" data-autofocus />
        <button type="button">Letzte</button>
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  it("moves focus to the autofocus element when it opens", async () => {
    render(<DialogHarness />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    expect(screen.getByRole("dialog", { name: "Suche" })).toBeInTheDocument();
    expect(screen.getByLabelText("Suchbegriff")).toHaveFocus();
  });

  it("closes on Escape and returns focus to the opener", async () => {
    render(<DialogHarness />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Öffnen" })).toHaveFocus();
  });

  it("keeps Tab inside the dialog", async () => {
    render(<DialogHarness />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    screen.getByRole("button", { name: "Letzte" }).focus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Erste" })).toHaveFocus();
  });

  it("locks page scrolling while open", async () => {
    render(<DialogHarness />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    expect(document.body.style.overflow).toBe("hidden");
    await userEvent.keyboard("{Escape}");
    expect(document.body.style.overflow).toBe("");
  });
});

describe("Popover", () => {
  function renderPopover(onClose: () => void) {
    render(
      <div>
        <p>Außerhalb</p>
        <div className="pop-anchor">
          <button type="button">Menü</button>
          <Popover open onClose={onClose} placement="up" label="Benutzermenü">
            <button type="button">Abmelden</button>
          </Popover>
        </div>
      </div>,
    );
  }

  it("closes on a click outside its anchor", () => {
    const onClose = vi.fn();
    renderPopover(onClose);
    fireEvent.mouseDown(screen.getByText("Außerhalb"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open for clicks inside the anchor", () => {
    const onClose = vi.fn();
    renderPopover(onClose);
    fireEvent.mouseDown(screen.getByRole("button", { name: "Abmelden" }));
    fireEvent.mouseDown(screen.getByRole("button", { name: "Menü" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    renderPopover(onClose);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

function StackHarness() {
  const [drawer, setDrawer] = useState(false);
  const [dialog, setDialog] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setDrawer(true)}>
        Drawer auf
      </button>
      <Drawer open={drawer} onClose={() => setDrawer(false)} label="Seitenleiste">
        <button type="button" onClick={() => setDialog(true)}>
          Dialog auf
        </button>
        <button type="button">Drawer-Knopf</button>
      </Drawer>
      <Dialog open={dialog} onClose={() => setDialog(false)} label="Rückfrage">
        <button type="button">Ja</button>
        <button type="button">Nein</button>
      </Dialog>
    </>
  );
}

async function openStack() {
  await userEvent.click(screen.getByRole("button", { name: "Drawer auf" }));
  await userEvent.click(screen.getByRole("button", { name: "Dialog auf" }));
}

describe("stacked modals", () => {
  it("close one layer per Escape and return focus to each trigger", async () => {
    render(<StackHarness />);
    await openStack();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Rückfrage" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Seitenleiste" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dialog auf" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Drawer auf" })).toHaveFocus();
  });

  it("keep Tab inside the top layer", async () => {
    render(<StackHarness />);
    await openStack();
    screen.getByRole("button", { name: "Nein" }).focus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Ja" })).toHaveFocus();
  });
});

describe("focus handling", () => {
  it("wraps Shift+Tab from the first element to the last", async () => {
    render(<DialogHarness />);
    await userEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    screen.getByRole("button", { name: "Erste" }).focus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Letzte" })).toHaveFocus();
  });

  it("keeps focus on the panel when nothing inside is focusable", async () => {
    render(
      <Dialog open onClose={vi.fn()} label="Leer">
        <p>Nur Text</p>
      </Dialog>,
    );
    const panel = screen.getByRole("dialog", { name: "Leer" });
    expect(panel).toHaveFocus();
    await userEvent.tab();
    expect(panel).toHaveFocus();
  });

  it("skips hidden and disabled elements when trapping", async () => {
    render(
      <Dialog open onClose={vi.fn()} label="Mit Verstecktem">
        <button type="button">Eins</button>
        <button type="button">Zwei</button>
        <button type="button" hidden>
          Versteckt
        </button>
        <div aria-hidden="true">
          <button type="button">Ausgeblendet</button>
        </div>
      </Dialog>,
    );
    screen.getByRole("button", { name: "Zwei" }).focus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Eins" })).toHaveFocus();
  });

  it("restores scroll and focus when the parent unmounts while open", async () => {
    document.body.style.overflow = "scroll";
    const Holder = () => (
      <Dialog open onClose={vi.fn()} label="Offen">
        <button type="button">Innen</button>
      </Dialog>
    );
    const view = (mounted: boolean) => (
      <>
        <button type="button">Auslöser</button>
        {mounted ? <Holder /> : null}
      </>
    );
    const { rerender } = render(view(false));
    const trigger = screen.getByRole("button", { name: "Auslöser" });
    trigger.focus();
    rerender(view(true));
    expect(screen.getByRole("button", { name: "Innen" })).toHaveFocus();
    rerender(view(false));
    expect(document.body.style.overflow).toBe("scroll");
    expect(trigger).toHaveFocus();
    document.body.style.overflow = "";
  });
});

describe("Popover inside a modal", () => {
  function PopInDialog({ onPopClose }: { onPopClose: () => void }) {
    const [dialog, setDialog] = useState(true);
    const [pop, setPop] = useState(false);
    return (
      <Dialog open={dialog} onClose={() => setDialog(false)} label="Rahmen">
        <div className="pop-anchor">
          <button type="button" onClick={() => setPop(true)}>
            Menü
          </button>
          <Popover
            open={pop}
            onClose={() => {
              onPopClose();
              setPop(false);
            }}
            placement="down-right"
            label="Optionen"
          >
            <button type="button">Eintrag</button>
          </Popover>
        </div>
      </Dialog>
    );
  }

  it("closes only the popover on Escape", async () => {
    const onPopClose = vi.fn();
    render(<PopInDialog onPopClose={onPopClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Menü" }));
    await userEvent.keyboard("{Escape}");
    expect(onPopClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Rahmen" })).toBeInTheDocument();
  });

  it("returns focus to the trigger when Escape closes it", async () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <div className="pop-anchor">
          <button type="button" onClick={() => setOpen(true)}>
            Menü
          </button>
          <Popover open={open} onClose={() => setOpen(false)} placement="up" label="Optionen">
            <button type="button">Eintrag</button>
          </Popover>
        </div>
      );
    }
    render(<Harness />);
    screen.getByRole("button", { name: "Eintrag" }).focus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Menü" })).toHaveFocus();
  });
});

describe("Drawer and PanelHeader", () => {
  it("renders a labelled drawer with a close button that calls onClose", async () => {
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} label="Details" variant="narrow">
        <PanelHeader title="Details" onClose={onClose} />
      </Drawer>,
    );
    const drawer = screen.getByRole("dialog", { name: "Details" });
    expect(drawer).toHaveClass("drawer", "narrow");
    expect(screen.getByRole("heading", { name: "Details" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Schließen|Close/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders nothing while closed", () => {
    render(
      <Drawer open={false} onClose={vi.fn()} label="Zu">
        <p>Inhalt</p>
      </Drawer>,
    );
    expect(screen.queryByText("Inhalt")).not.toBeInTheDocument();
  });
});

describe("Popover focus return", () => {
  it("returns focus to the element focused when it opened, not the first sibling", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <div className="pop-anchor">
          <span>Beschriftung</span>
          <button type="button">Vorher</button>
          <button type="button" onClick={() => setOpen(true)}>
            Menü
          </button>
          <Popover open={open} onClose={() => setOpen(false)} placement="up" label="Optionen">
            <button type="button">Eintrag</button>
          </Popover>
        </div>
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Menü" }));
    screen.getByRole("button", { name: "Eintrag" }).focus();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Menü" })).toHaveFocus();
  });
});
