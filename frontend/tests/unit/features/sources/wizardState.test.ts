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
const run = (...actions: WizardAction[]): WizardState =>
  actions.reduce(wizardReducer, INITIAL_WIZARD);
const loaded = (): WizardAction[] => [
  { type: "url", url: "https://x.de/jobs" },
  { type: "linksLoaded", links: LINKS },
];

const PATTERN = "/jobsuche/p/";
const confirmed = (pattern = PATTERN): WizardAction[] => [
  { type: "toggle", url: LINKS[0]!.url },
  { type: "confirmPattern", pattern },
  { type: "next", pattern },
];

describe("wizard state", () => {
  it("found links open step 2 with nothing preselected", () => {
    const state = run(...loaded());
    expect([state.step, state.selected]).toEqual([2, []]);
  });

  it("a new check drops the earlier choice, typed pattern and confirmation", () => {
    const state = run(
      ...loaded(),
      { type: "toggle", url: LINKS[0]!.url },
      { type: "pattern", pattern: "/p/" },
      { type: "confirmPattern", pattern: "/p/" },
      { type: "linksLoaded", links: LINKS },
    );
    expect([state.selected, state.customPattern, state.confirmedPattern]).toEqual([[], null, null]);
  });

  it("Weiter with a chosen link and the confirmed pattern keeps that pattern for the setup", () => {
    const state = run(...loaded(), ...confirmed(` ${PATTERN} `));
    expect([state.step, state.pattern, state.errors]).toEqual([3, PATTERN, {}]);
  });

  it("Zurück and Weiter keep every entry", () => {
    const state = run(
      ...loaded(),
      { type: "toggle", url: LINKS[2]!.url },
      { type: "pattern", pattern: "/p/" },
      ...confirmed("/p/"),
      { type: "back" },
    );
    expect([state.step, state.selected.length, state.customPattern]).toEqual([2, 2, "/p/"]);
  });

  it("Weiter needs a link", () => {
    const state = run(...loaded(), { type: "next", pattern: PATTERN });
    expect([state.step, state.errors.links]).toEqual([2, "sources.wizard.pickOne"]);
  });

  it("Weiter needs a valid pattern", () => {
    const state = run(...loaded(), ...confirmed("/"));
    expect([state.step, state.errors.url_pattern]).toEqual([2, "sources.error.pattern"]);
  });

  it("Weiter needs the shown pattern confirmed; a confirmation of another pattern does not count", () => {
    const unconfirmed = run(
      ...loaded(),
      { type: "toggle", url: LINKS[0]!.url },
      {
        type: "next",
        pattern: PATTERN,
      },
    );
    const stale = run(
      ...loaded(),
      { type: "toggle", url: LINKS[0]!.url },
      { type: "confirmPattern", pattern: "/jobsuche/" },
      { type: "next", pattern: PATTERN },
    );
    expect([unconfirmed.step, unconfirmed.errors.patternConfirm]).toEqual([
      2,
      "sources.wizard.patternConfirm",
    ]);
    expect(stale.step).toBe(2);
  });

  it("Weiter is refused while the pattern for a changed selection is still derived", () => {
    const state = run(
      ...loaded(),
      { type: "toggle", url: LINKS[0]!.url },
      { type: "confirmPattern", pattern: PATTERN },
      { type: "next", pattern: null },
    );
    expect([state.step, state.errors.patternConfirm]).toEqual([2, "sources.wizard.patternWait"]);
  });

  it("filters over text and path, and select all only takes the visible ones", () => {
    const filtered = run(...loaded(), { type: "filter", filter: "kotlin" });
    expect(visibleLinks(filtered).map((link) => link.text)).toEqual(["Kotlin"]);
    const urls = visibleLinks(filtered).map((link) => link.url);
    expect(wizardReducer(filtered, { type: "selectAll", urls }).selected).toEqual([LINKS[1]!.url]);
  });

  it("server field errors jump to the earliest step that holds one", () => {
    const state = run(...loaded(), ...confirmed(), {
      type: "serverErrors",
      fields: ["name", "url_pattern"],
    });
    expect([state.step, state.errors.url_pattern]).toEqual([2, "sources.error.pattern"]);
  });

  it("is dirty from the first typed character", () => {
    const typed = wizardReducer(INITIAL_WIZARD, { type: "url", url: "h" });
    expect([isWizardDirty(INITIAL_WIZARD), isWizardDirty(typed)]).toEqual([false, true]);
  });
});
