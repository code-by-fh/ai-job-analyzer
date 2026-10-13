import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { UnsavedChangesProvider, useUnsavedChanges } from "@/ui/UnsavedChanges";

let navigated: string[] = [];
const recordNavigation = (event: MouseEvent) => {
  const anchor = (event.target as Element).closest("a");
  if (anchor) navigated.push(anchor.getAttribute("href") ?? "");
  event.preventDefault();
};

function Harness({ dirty }: { dirty: boolean }) {
  const [answer, setAnswer] = useState("");
  const { setDirty, setUnloadWarning, requestLeave } = useUnsavedChanges();
  return (
    <>
      <button onClick={() => setDirty(dirty)}>mark</button>
      <button onClick={() => setUnloadWarning(true)}>warn on unload</button>
      <button onClick={() => void requestLeave().then((leave) => setAnswer(String(leave)))}>
        ask
      </button>
      <output>{answer}</output>
      <a href="/inbox">intern</a>
      <a href="https://example.org/x">extern</a>
      <a href="/inbox" target="_blank">
        neues Fenster
      </a>
      <a href="#oben">Anker</a>
    </>
  );
}

function show(dirty = true) {
  navigated = [];
  document.addEventListener("click", recordNavigation);
  render(
    <UnsavedChangesProvider>
      <Harness dirty={dirty} />
    </UnsavedChangesProvider>,
  );
}

afterEach(() => document.removeEventListener("click", recordNavigation));

describe("unsaved changes guard", () => {
  it("lets same-origin links through while nothing is unsaved", async () => {
    show();
    await userEvent.click(screen.getByText("intern"));
    expect(navigated).toEqual(["/inbox"]);
  });

  it("holds a same-origin link click behind the dialog and follows it on confirm", async () => {
    show();
    await userEvent.click(screen.getByText("mark"));
    await userEvent.click(screen.getByText("intern"));
    expect(navigated).toEqual([]);
    await userEvent.click(await screen.findByRole("button", { name: "Änderungen verwerfen" }));
    expect(navigated).toEqual(["/inbox"]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stays on the page when the dialog is cancelled", async () => {
    show();
    await userEvent.click(screen.getByText("mark"));
    await userEvent.click(screen.getByText("intern"));
    await userEvent.click(await screen.findByRole("button", { name: "Weiter bearbeiten" }));
    expect(navigated).toEqual([]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each(["extern", "neues Fenster", "Anker"])("does not intercept %s", async (name) => {
    show();
    await userEvent.click(screen.getByText("mark"));
    await userEvent.click(screen.getByText(name));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not intercept modified clicks", async () => {
    show();
    const user = userEvent.setup();
    await user.click(screen.getByText("mark"));
    await user.keyboard("{Control>}");
    await user.click(screen.getByText("intern"));
    await user.keyboard("{/Control}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("warns on unload for an unload-only registration without asking in the app", async () => {
    show();
    await userEvent.click(screen.getByText("warn on unload"));
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    await userEvent.click(screen.getByText("ask"));
    expect(await screen.findByText("true")).toBeInTheDocument();
    await userEvent.click(screen.getByText("intern"));
    expect(navigated).toEqual(["/inbox"]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
