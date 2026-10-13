import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { A4Preview } from "@/ui/A4Preview";
import { Disclosure } from "@/ui/Disclosure";
import { CheckField, SelectField } from "@/ui/Field";
import { Markdown } from "@/ui/Markdown";
import { Monogram } from "@/ui/Monogram";
import { Stepper } from "@/ui/Stepper";

const PDF_URL = "blob:http://localhost/1234";

afterEach(() => {
  // Some tests pretend a browser without an inline PDF viewer.
  Reflect.deleteProperty(navigator, "pdfViewerEnabled");
});

describe("Stepper states", () => {
  const STEPS = [
    { key: "OPEN", label: "Treffer", state: "past" as const },
    { key: "DRAFTED", label: "Vorgemerkt", state: "skipped" as const },
    { key: "CLOSED", label: "Absage erhalten", state: "closed" as const, date: "07.10." },
  ];

  it("names skipped and closed phases in text", () => {
    render(<Stepper steps={STEPS} label="Phase der Bewerbung" />);
    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveClass("step", "skipped");
    expect(items[1]).toHaveTextContent("übersprungen");
    expect(items[2]).toHaveTextContent("abgeschlossen");
    expect(items[2]).toHaveAttribute("aria-current", "step");
  });

  it("names an unreached phase in text", () => {
    const steps = [{ key: "X", label: "Interview", state: "unreached" as const }];
    render(<Stepper steps={steps} label="Phase" />);
    expect(screen.getByRole("listitem")).toHaveTextContent("nicht erreicht");
  });

  it("links a level-3 heading to the list", () => {
    render(<Stepper steps={STEPS} label="Phase" headingLevel={3} />);
    const heading = screen.getByRole("heading", { level: 3, name: "Phase" });
    expect(screen.getByRole("list")).toHaveAttribute("aria-labelledby", heading.id);
  });

  it("can show its label as a visible heading", () => {
    render(<Stepper steps={STEPS} label="Phase" headingLevel={2} />);
    expect(screen.getByRole("heading", { level: 2, name: "Phase" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Phase" })).toBeInTheDocument();
  });
});

describe("A4Preview", () => {
  it("shows the PDF from its blob URL", () => {
    const { container } = render(
      <A4Preview title="Lebenslauf" pdfUrl={PDF_URL} slug="Probedruck" />,
    );
    expect(container.querySelector("object")?.getAttribute("data")).toMatch(/^blob:/);
  });

  it("offers open and download when inline PDFs are unsupported", () => {
    Object.defineProperty(navigator, "pdfViewerEnabled", { value: false, configurable: true });
    render(<A4Preview title="Lebenslauf" pdfUrl={PDF_URL} downloadName="cv.pdf" slug="" />);
    expect(screen.getByRole("link", { name: "PDF öffnen" })).toHaveAttribute("href", PDF_URL);
    expect(screen.getByRole("link", { name: "Herunterladen" })).toHaveAttribute(
      "download",
      "cv.pdf",
    );
  });

  it("shows the empty text without a PDF", () => {
    render(<A4Preview title="Lebenslauf" pdfUrl={null} emptyText="Noch nicht erstellt" slug="" />);
    expect(screen.getByText("Noch nicht erstellt")).toBeInTheDocument();
  });

  it("opens a full-screen preview", async () => {
    render(<A4Preview title="Lebenslauf" pdfUrl={PDF_URL} slug="" />);
    await userEvent.click(screen.getByRole("button", { name: "Vorschau groß öffnen" }));
    expect(screen.getByRole("dialog", { name: "Lebenslauf" })).toBeInTheDocument();
  });

  it("names the embedded PDF", () => {
    const { container } = render(<A4Preview title="Lebenslauf" pdfUrl={PDF_URL} slug="" />);
    expect(container.querySelector("object")).toHaveAttribute("aria-label", "Lebenslauf");
  });

  it("renders the explanation text in the fallback", () => {
    Object.defineProperty(navigator, "pdfViewerEnabled", { value: false, configurable: true });
    render(<A4Preview title="Lebenslauf" pdfUrl={PDF_URL} slug="" />);
    expect(screen.getByText("Dein Browser zeigt PDFs hier nicht direkt an.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vorschau groß öffnen" })).not.toBeInTheDocument();
  });

  it("traps focus in the full-screen preview and closes it with Escape", async () => {
    render(<A4Preview title="Lebenslauf" pdfUrl={PDF_URL} slug="" />);
    await userEvent.click(screen.getByRole("button", { name: "Vorschau groß öffnen" }));
    const dialog = screen.getByRole("dialog", { name: "Lebenslauf" });
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("marks a busy sheet with a static note", () => {
    const { container } = render(<A4Preview title="Lebenslauf" pdfUrl={PDF_URL} slug="" busy />);
    expect(container.querySelector(".paper")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Wird erzeugt");
  });

  it("draws the blank sheet lines without inline styles", () => {
    const { container } = render(<A4Preview title="Lebenslauf" pdfUrl={null} slug="" />);
    const lines = container.querySelectorAll(".pp-lines i");
    expect(lines.length).toBeGreaterThan(0);
    expect([...lines].filter((line) => line.hasAttribute("style"))).toEqual([]);
  });

  it("keeps one status region, so the busy note is announced when it appears", () => {
    const view = render(<A4Preview title="Lebenslauf" pdfUrl={PDF_URL} slug="" />);
    const live = screen.getByRole("status");
    expect(live).toBeEmptyDOMElement();
    view.rerender(<A4Preview title="Lebenslauf" pdfUrl={PDF_URL} slug="" busy />);
    expect(screen.getByRole("status")).toBe(live);
    expect(live).toHaveTextContent("Wird erzeugt");
  });

  it("shows its children instead of the PDF (editing)", () => {
    render(
      <A4Preview title="Lebenslauf" pdfUrl={PDF_URL} slug="">
        <p>Editor</p>
      </A4Preview>,
    );
    expect(screen.getByText("Editor")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vorschau groß öffnen" })).not.toBeInTheDocument();
  });
});

describe("Markdown", () => {
  it("renders headings, lists, bold text and safe links", () => {
    render(<Markdown source={"## Ergebnis\n- **Kotlin** passt\n\n[Blog](https://acme.de)"} />);
    expect(screen.getByRole("heading", { name: "Ergebnis" })).toBeInTheDocument();
    expect(screen.getByText("Kotlin").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "Blog" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });
});

describe("Disclosure", () => {
  it("toggles its region", async () => {
    render(<Disclosure label="Vollständige Begründung">Text</Disclosure>);
    const button = screen.getByRole("button", { name: "Vollständige Begründung" });
    expect(screen.getByText("Text")).not.toBeVisible();
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Text")).toBeVisible();
  });

  it("follows its open prop and reports toggles in controlled mode", async () => {
    const changes: boolean[] = [];
    const { rerender } = render(
      <Disclosure
        label="Abgeschlossen (2)"
        open={false}
        onOpenChange={(open) => changes.push(open)}
      >
        Inhalt
      </Disclosure>,
    );
    const toggle = screen.getByRole("button", { name: "Abgeschlossen (2)" });
    await userEvent.click(toggle);
    expect(changes).toEqual([true]);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    rerender(
      <Disclosure label="Abgeschlossen (2)" open onOpenChange={(open) => changes.push(open)}>
        Inhalt
      </Disclosure>,
    );
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Inhalt")).toBeVisible();
  });

  it("keeps its own state and still reports toggles without an open prop", async () => {
    const changes: boolean[] = [];
    render(
      <Disclosure label="Vollständige Begründung" onOpenChange={(open) => changes.push(open)}>
        Text
      </Disclosure>,
    );
    const button = screen.getByRole("button", { name: "Vollständige Begründung" });
    await userEvent.click(button);
    expect(changes).toEqual([true]);
    expect(button).toHaveAttribute("aria-expanded", "true");
  });
});

describe("Fields", () => {
  it("connects a select to its hint and error", () => {
    render(
      <SelectField id="kind" label="Art" hint="Pflicht" error="Bitte wählen">
        <option value="">-</option>
      </SelectField>,
    );
    expect(screen.getByLabelText("Art")).toHaveAttribute(
      "aria-describedby",
      "kind-hint kind-error",
    );
    expect(screen.getByLabelText("Art")).toHaveAttribute("aria-invalid", "true");
  });

  it("reports a checkbox change as a boolean", async () => {
    const changes: boolean[] = [];
    render(
      <CheckField
        id="sent"
        label="Abgeschickt"
        checked={false}
        onChange={(v) => changes.push(v)}
      />,
    );
    await userEvent.click(screen.getByLabelText("Abgeschickt"));
    expect(changes).toEqual([true]);
  });
});

describe("Monogram", () => {
  it("is decorative", () => {
    const { container } = render(<Monogram name="ACME GmbH" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container).toHaveTextContent("AC");
  });
});
