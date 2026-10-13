import { describe, expect, it } from "vitest";
import {
  INITIAL_WIZARD,
  isWizardDirty,
  visibleLinks,
  wizardReducer,
  type WizardAction,
  type WizardState,
} from "@/features/sources/wizard/wizardState";

const LINKS = [
  { url: "https://x.de/jobsuche/p/java-1", text: "Java" },
  { url: "https://x.de/jobsuche/p/kotlin-2", text: "Kotlin" },
  { url: "https://x.de/unternehmen/top", text: "Unternehmen entdecken" },
];
const ALL_URLS = LINKS.map((link) => link.url);
const run = (...actions: WizardAction[]): WizardState =>
  actions.reduce(wizardReducer, INITIAL_WIZARD);
const loaded = (): WizardAction[] => [
  { type: "url", url: "https://x.de/jobs" },
  { type: "linksLoaded", links: LINKS },
];

describe("wizard state", () => {
  it("found links open step 2 with the job links preselected", () => {
    const state = run(...loaded());
    expect([state.step, state.selected]).toEqual([2, [LINKS[0]!.url, LINKS[1]!.url]]);
  });

  it("Zurück and Weiter keep every entry", () => {
    const state = run(
      ...loaded(),
      { type: "toggle", url: LINKS[2]!.url },
      { type: "pattern", pattern: "/p/" },
      { type: "back" },
      { type: "next" },
    );
    expect([state.step, state.selected.length, state.pattern]).toEqual([2, 3, "/p/"]);
  });

  it("Weiter needs a link", () => {
    const state = run(...loaded(), { type: "selectNone", urls: ALL_URLS }, { type: "next" });
    expect([state.step, state.errors.links]).toEqual([2, "sources.wizard.pickOne"]);
  });

  it("filters over text and path, and select all only takes the visible ones", () => {
    const filtered = run(
      ...loaded(),
      { type: "selectNone", urls: ALL_URLS },
      { type: "filter", filter: "kotlin" },
    );
    expect(visibleLinks(filtered).map((link) => link.text)).toEqual(["Kotlin"]);
    const urls = visibleLinks(filtered).map((link) => link.url);
    expect(wizardReducer(filtered, { type: "selectAll", urls }).selected).toEqual([LINKS[1]!.url]);
  });

  it("server field errors jump to the earliest step and open Erweitert for the pattern", () => {
    const state = run(
      ...loaded(),
      { type: "next" },
      { type: "serverErrors", fields: ["name", "url_pattern"] },
    );
    expect([state.step, state.advancedOpen, state.errors.url_pattern]).toEqual([
      2,
      true,
      "sources.error.pattern",
    ]);
  });

  it("is dirty from the first typed character", () => {
    const typed = wizardReducer(INITIAL_WIZARD, { type: "url", url: "h" });
    expect([isWizardDirty(INITIAL_WIZARD), isWizardDirty(typed)]).toEqual([false, true]);
  });
});
