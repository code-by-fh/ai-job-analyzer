import { describe, expect, it } from "vitest";
import { countFailingPlatforms, type Platform } from "@/api/platforms";
import {
  addFromParam,
  CUSTOM_TEMPLATE,
  DEFAULT_TEMPLATE,
  dayRuns,
  failingSources,
  firstErrorStep,
  isName,
  linkPath,
  matchingCount,
  MAX_NAME_LENGTH,
  nextSourceId,
  parseRecipients,
  sortSources,
  sourceIdFromParam,
  sourcesHref,
  sourceState,
  suggestJobLinks,
  templateChoice,
  toSourceField,
} from "@/domain/sources";
import { scheduleOf } from "@/domain/schedule";
import { SOURCES_ADD_HREF } from "@/features/shell/navigation";
import { scheduleText } from "@/features/sources/labels";
import { translatorFor } from "@/i18n/translate";

const t = translatorFor("de");
const platform = (overrides: Partial<Platform> = {}): Platform => ({
  id: 1,
  name: "StepStone",
  url: "https://www.stepstone.de/jobs",
  is_active: true,
  setup_status: "active",
  ...overrides,
});
const run = (error: string | null) => ({
  finished_at: "2026-10-08T06:00:00+00:00",
  error,
});

describe("URL state", () => {
  it("builds the onboarding link and a source link, add winning", () => {
    expect(sourcesHref({ add: true })).toBe(SOURCES_ADD_HREF);
    expect(sourcesHref({ sourceId: 7 })).toBe("/sources?quelle=7");
    expect(sourcesHref({ sourceId: 7, add: true })).toBe("/sources?add=1");
    expect(sourcesHref()).toBe("/sources");
  });

  it("reads only positive integer ids and add=1", () => {
    expect(["7", "0", "-1", "abc", "1.5", null].map(sourceIdFromParam)).toEqual([
      7,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect([addFromParam("1"), addFromParam("true"), addFromParam(null)]).toEqual([
      true,
      false,
      false,
    ]);
  });
});

describe("source state", () => {
  it("orders running, setup, paused, failing, ok", () => {
    const failing = platform({ last_run: run("unreachable") });
    expect([
      sourceState(failing, true),
      sourceState(platform({ setup_status: "pending_setup" }), false),
      sourceState(platform({ is_active: false, last_run: run("failed") }), false),
      sourceState(failing, false),
      sourceState(platform(), false),
    ]).toEqual(["running", "setup", "paused", "failing", "ok"]);
  });

  it("a cancelled run is not an error, an unknown text is", () => {
    const list = [
      platform({ id: 1, name: "B", last_run: run("cancelled") }),
      platform({ id: 2, name: "A", last_run: run("Seite kaputt") }),
      platform({ id: 3, name: "C", last_run: run(null) }),
    ];
    expect(failingSources(list).map((p) => p.id)).toEqual([2]);
    expect(countFailingPlatforms(list)).toBe(1);
  });

  it("a paused source with a failed run is not failing", () => {
    const paused = platform({ id: 4, is_active: false, last_run: run("unreachable") });
    expect(sourceState(paused, false)).toBe("paused");
    expect(failingSources([paused])).toEqual([]);
    expect(countFailingPlatforms([paused])).toBe(0);
  });

  it("a source whose setup never finished is not failing", () => {
    const pending = platform({ id: 5, setup_status: "pending_setup", last_run: run("failed") });
    expect(sourceState(pending, false)).toBe("setup");
    expect(failingSources([pending])).toEqual([]);
    expect(countFailingPlatforms([pending])).toBe(0);
  });

  it("sorts umlauts and mixed case the German way, independent of the environment", () => {
    const list = [
      platform({ id: 1, name: "Zeit" }),
      platform({ id: 2, name: "österreich" }),
      platform({ id: 3, name: "Arbeit" }),
      platform({ id: 4, name: "arbeit" }),
      platform({ id: 5, name: "Ostsee" }),
    ];
    expect(sortSources(list).map((p) => p.id)).toEqual([3, 4, 2, 5, 1]);
  });

  it("sorts by name, then id", () => {
    const list = [
      platform({ id: 3, name: "b" }),
      platform({ id: 2, name: "a" }),
      platform({ id: 1, name: "b" }),
    ];
    expect(sortSources(list).map((p) => p.id)).toEqual([2, 1, 3]);
  });
});

describe("nextSourceId", () => {
  const list = [
    platform({ id: 3, name: "c" }),
    platform({ id: 1, name: "a" }),
    platform({ id: 2, name: "b" }),
  ];

  it("is the source after the given one in list order", () => {
    expect(nextSourceId(list, 1)).toBe(2);
    expect(nextSourceId(list, 2)).toBe(3);
  });

  it("is null for the last source and for an unknown id", () => {
    expect(nextSourceId(list, 3)).toBeNull();
    expect(nextSourceId(list, 9)).toBeNull();
  });
});

describe("schedule", () => {
  it("parses only HH:MM in range with real weekdays", () => {
    expect(scheduleOf({ schedule_time: "08:00", schedule_days: [4, 0, 0, 9] })).toEqual({
      time: "08:00",
      days: [0, 4],
    });
    expect(scheduleOf({ schedule_time: "24:00", schedule_days: [0] })).toBeNull();
    expect(scheduleOf({ schedule_time: "08:00", schedule_days: [] })).toBeNull();
    expect(scheduleOf({ schedule_time: null, schedule_days: null })).toBeNull();
  });

  it("groups consecutive days", () => {
    expect(dayRuns([0, 1, 2, 3, 4])).toEqual([[0, 4]]);
    expect(dayRuns([5, 0, 2])).toEqual([
      [0, 0],
      [2, 2],
      [5, 5],
    ]);
  });

  it("formats ranges and single days", () => {
    expect(scheduleText({ time: "08:00", days: [0, 1, 2, 3, 4] }, t)).toBe("Mo–Fr 08:00");
    expect(scheduleText({ time: "07:30", days: [0, 2] }, t)).toBe("Mo, Mi 07:30");
    expect(scheduleText({ time: "07:30", days: [5, 6] }, t)).toBe("Sa, So 07:30");
    expect(scheduleText({ time: "06:00", days: [0, 1, 2, 3, 4, 5, 6] }, t)).toBe("täglich 06:00");
    expect(scheduleText(null, t)).toBe("Nur manuell");
  });
});

describe("wizard links", () => {
  const links = [
    { url: "https://x.de/jobsuche/p/java-1", text: "Java" },
    { url: "https://x.de/jobsuche/p/kotlin-2", text: "Kotlin" },
    { url: "https://x.de/jobsuche/p/go-3", text: "Go" },
    { url: "https://x.de/unternehmen/top", text: "Unternehmen entdecken" },
    { url: "https://x.de/impressum", text: "Impressum" },
  ];

  it("preselects the largest group of similar links", () => {
    expect(suggestJobLinks(links)).toEqual(links.slice(0, 3).map((link) => link.url));
  });

  it("groups one-segment slugs by their first word (StepStone)", () => {
    const slugs = ["a--1-inline.html", "b--2-inline.html"].map((slug) => ({
      url: `https://www.stepstone.de/stellenangebote--${slug}`,
      text: slug,
    }));
    expect(
      suggestJobLinks([...slugs, { url: "https://www.stepstone.de/impressum", text: "" }]),
    ).toEqual(slugs.map((link) => link.url));
  });

  it("falls back to deep links when no group has two", () => {
    const lonely = [
      { url: "https://x.de/a/b/c", text: "" },
      { url: "https://x.de/d", text: "" },
    ];
    expect(suggestJobLinks(lonely)).toEqual(["https://x.de/a/b/c"]);
  });

  it("counts links containing the pattern and shows paths", () => {
    expect([matchingCount(links, " /jobsuche/p/ "), matchingCount(links, "")]).toEqual([3, 0]);
    expect(linkPath("https://x.de/jobs?q=1")).toBe("/jobs?q=1");
  });
});

describe("forms", () => {
  it("maps server fields and finds the first step with an error", () => {
    expect([toSourceField("schedule_days"), toSourceField("cv_data")]).toEqual([
      "schedule_days",
      null,
    ]);
    expect([firstErrorStep(["name", "url_pattern"]), firstErrorStep([])]).toEqual([2, null]);
  });

  it("splits recipients and flags an invalid one", () => {
    expect(parseRecipients(" a@x.de, b@y.de ;")).toEqual({
      list: ["a@x.de", "b@y.de"],
      invalid: false,
    });
    expect(parseRecipients("a@x.de, nope").invalid).toBe(true);
  });

  it("names the stored template: default, a listed one, or custom", () => {
    const templates = [{ id: 4, content: "Neu: $title" }];
    expect([
      templateChoice(null, templates),
      templateChoice("Neu: $title", templates),
      templateChoice("eigener Text", templates),
    ]).toEqual([DEFAULT_TEMPLATE, "4", CUSTOM_TEMPLATE]);
  });
});

describe("source name rule", () => {
  it("takes 1 to 100 characters after trimming", () => {
    expect(isName("  StepStone  ")).toBe(true);
    expect(isName("x".repeat(MAX_NAME_LENGTH))).toBe(true);
  });

  it("refuses a blank name and one over 100 characters", () => {
    expect(isName("   ")).toBe(false);
    expect(isName("x".repeat(MAX_NAME_LENGTH + 1))).toBe(false);
  });
});
