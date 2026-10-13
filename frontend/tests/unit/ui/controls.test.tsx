import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Inbox } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { CountBadge } from "@/ui/CountBadge";
import { TextField } from "@/ui/Field";
import { Notice } from "@/ui/Notice";
import { ScoreMeter } from "@/ui/ScoreMeter";
import { Seg } from "@/ui/Seg";

describe("Button", () => {
  it("defaults to type=button so it never submits a form by accident", () => {
    render(<Button>Speichern</Button>);
    expect(screen.getByRole("button", { name: "Speichern" })).toHaveAttribute("type", "button");
  });

  it("maps the variant to the prototype class", () => {
    render(
      <Button variant="primary" icon={Inbox}>
        Vormerken
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Vormerken" })).toHaveClass("btn", "btn-primary");
  });

  it("ignores clicks while busy but stays focusable", async () => {
    const onClick = vi.fn();
    render(
      <Button busy onClick={onClick}>
        Erzeugen
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Erzeugen" });
    await userEvent.click(button);
    button.focus();
    expect(onClick).not.toHaveBeenCalled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveFocus();
  });

  it("ignores activation while inactive but stays focusable and not busy", async () => {
    const onClick = vi.fn();
    render(
      <Button inactive onClick={onClick}>
        Übernehmen
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Übernehmen" });
    button.focus();
    await userEvent.keyboard("{Enter}");
    expect(onClick).not.toHaveBeenCalled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toHaveAttribute("aria-busy");
    expect(button).toHaveFocus();
  });

  it("marks a busy button for assistive technology", () => {
    render(<Button busy>Erzeugen</Button>);
    expect(screen.getByRole("button", { name: "Erzeugen" })).toHaveAttribute("aria-busy", "true");
  });
});

describe("Seg", () => {
  const OPTIONS = [
    { value: "light", label: "Hell" },
    { value: "dark", label: "Dunkel" },
  ] as const;

  it("marks the selected option and reports a new choice", async () => {
    const onChange = vi.fn();
    render(<Seg options={OPTIONS} value="light" onChange={onChange} label="Darstellung" />);
    expect(screen.getByRole("button", { name: "Hell" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Dunkel" }));
    expect(onChange).toHaveBeenCalledWith("dark");
  });
});

describe("Chip", () => {
  it("toggles through onToggle", async () => {
    const onToggle = vi.fn();
    render(
      <Chip pressed={false} onToggle={onToggle}>
        Remote
      </Chip>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Remote" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe("TextField", () => {
  it("labels the input and links hint and error", () => {
    render(<TextField id="role" label="Rolle" hint="Wie im Lebenslauf" error="Bitte ausfüllen." />);
    const input = screen.getByLabelText("Rolle");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Wie im Lebenslauf Bitte ausfüllen.");
  });

  it("announces its error as an alert, since errors only appear after a submit", () => {
    render(<TextField id="role" label="Rolle" error="Bitte ausfüllen." />);
    expect(screen.getByText("Bitte ausfüllen.").closest('[role="alert"]')).not.toBeNull();
  });

  it("is not marked invalid without an error", () => {
    render(<TextField id="role" label="Rolle" />);
    expect(screen.getByLabelText("Rolle")).not.toHaveAttribute("aria-invalid");
  });
});

describe("CountBadge", () => {
  it("shows the number and announces the label", () => {
    render(<CountBadge count={3} label="3 neue Treffer" />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("3 neue Treffer")).toHaveClass("sr-only");
  });
});

describe("Notice", () => {
  it("announces errors as alerts", () => {
    render(<Notice tone="error">Laden fehlgeschlagen.</Notice>);
    expect(screen.getByRole("alert")).toHaveTextContent("Laden fehlgeschlagen.");
  });
});

describe("ScoreMeter", () => {
  it("shows the rounded score with its band word and strong styling", () => {
    const { container } = render(<ScoreMeter score={83.6} />);
    expect(screen.getByText("84")).toBeInTheDocument();
    expect(screen.getByText("Stark")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("score", "strong");
  });

  it("explains the score in its title", () => {
    const { container } = render(<ScoreMeter score={42} />);
    expect(container.firstChild).toHaveAttribute("title", "Passung 42 von 100: Schwach");
  });
});
