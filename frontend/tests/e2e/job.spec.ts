import type { Page } from "@playwright/test";
import type { JobDetailBody } from "../../src/api/jobs";
import { COLOR_SCHEMES, SCREENSHOT_SIZES, VIEWPORTS } from "./support/constants";
import {
  COMPANY_PROFILE,
  fixNow,
  jobBody,
  jobRoutes,
  jobUrl,
  PREP_MATERIAL,
  READY,
} from "./support/jobFixtures";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const JOB = jobBody({ status: "DRAFTED" });
const STATES = {
  open: jobBody({ status: "OPEN" }),
  drafted: jobBody({ status: "DRAFTED", ...READY }),
  // The interview date is its own column (ruling G2); next_follow_up_at stays the follow-up.
  interview: jobBody({ status: "INTERVIEW", ...READY, interview_at: "2026-10-09T08:00:00+00:00" }),
} as const;
type JobState = keyof typeof STATES;
const TAB_OF_STATE: Record<JobState, string | undefined> = {
  open: undefined,
  drafted: "unterlagen",
  interview: "verlauf",
};
const NAV = "Hauptnavigation";

test.beforeEach(async ({ page }) => fixNow(page));

for (const state of Object.keys(STATES) as JobState[]) {
  const job = STATES[state];
  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      test(`job page (${state}) renders at ${size}px in ${scheme} mode`, async ({
        page,
        mockApi,
      }) => {
        await mockApi(jobRoutes(job));
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(jobUrl(TAB_OF_STATE[state]));
        await expect(
          page.getByRole("heading", { level: 1, name: "Senior Backend Engineer (Kotlin)" }),
        ).toBeVisible();
        expect(await horizontalOverflow(page)).toBe(0);
        await saveScreenshot(page, `job-${state}-${size}-${scheme}`);
      });
    }
  }

  test(`job page (${state}) has no horizontal scroll at 375 px`, async ({ page, mockApi }) => {
    await mockApi(jobRoutes(job));
    await page.setViewportSize(VIEWPORTS.narrow);
    await page.goto(jobUrl(TAB_OF_STATE[state]));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
  });
}

test("the default tab follows the phase", async ({ page, mockApi }) => {
  await mockApi(jobRoutes(JOB));
  await page.goto(jobUrl());
  await expect(page.getByRole("tab", { name: "Unterlagen" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("highlights Eingang for a match", async ({ page, mockApi }) => {
  await mockApi(jobRoutes(STATES.open));
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto(jobUrl());
  const nav = page.getByRole("navigation", { name: NAV });
  await expect(nav.getByRole("link", { name: /Eingang/ })).toHaveAttribute("aria-current", "page");
});

test("highlights Bewerbungen for an application", async ({ page, mockApi }) => {
  await mockApi(jobRoutes(STATES.drafted));
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto(jobUrl());
  const nav = page.getByRole("navigation", { name: NAV });
  await expect(nav.getByRole("link", { name: /Bewerbungen/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("opens the A4 preview full screen on mobile", async ({ page, mockApi }) => {
  await mockApi(jobRoutes(STATES.drafted));
  // Headless Chromium reports no PDF viewer; the full-screen preview is offered only with one.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "pdfViewerEnabled", { value: true });
  });
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto(jobUrl("unterlagen"));
  await page.getByRole("tabpanel").getByRole("button", { name: "Vorschau groß öffnen" }).click();
  await expect(page.getByRole("dialog", { name: "Lebenslauf" })).toBeVisible();
  await saveScreenshot(page, "job-preview-fullscreen-390-light");
});

// WCAG 1.4.3 text and 1.4.11 control borders.
const MIN_TEXT_CONTRAST = 4.5;
const MIN_BORDER_CONTRAST = 3;

/** Contrast of two CSS colours, resolved by the browser (canvas) so lab()/oklch() work. */
function contrastIn(page: Page, colors: readonly [string, string]): Promise<number> {
  return page.evaluate(([first, second]) => {
    const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("no 2d canvas");
    const luminance = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b] = [...context.getImageData(0, 0, 1, 1).data].map((channel) => {
        const c = channel / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
  }, colors);
}

test("keeps the PDF fallback buttons readable on the white sheet in dark mode at 390px", async ({
  page,
  mockApi,
}) => {
  await mockApi(jobRoutes(STATES.drafted));
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(jobUrl("unterlagen"));
  const open = page.getByRole("tabpanel").getByRole("link", { name: "PDF öffnen" });
  await expect(open).toBeVisible();
  const [text, border, paper] = await open.evaluate((element) => {
    const style = getComputedStyle(element);
    const sheet = getComputedStyle(element.closest(".paper") ?? element);
    return [style.color, style.borderTopColor, sheet.backgroundColor];
  });
  expect(await contrastIn(page, [text, paper])).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  expect(await contrastIn(page, [border, paper])).toBeGreaterThanOrEqual(MIN_BORDER_CONTRAST);
});

test("shows the next step beside the tabs on desktop", async ({ page, mockApi }) => {
  await mockApi(jobRoutes(STATES.drafted));
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto(jobUrl());
  const card = await page.getByRole("complementary", { name: "Nächster Schritt" }).boundingBox();
  const tabs = await page.getByRole("tablist").boundingBox();
  expect(card && tabs && card.x > tabs.x + tabs.width).toBe(true);
});

const NEXT_STEP_JOBS: ReadonlyArray<readonly [string, JobDetailBody]> = [
  ["match", { ...JOB, status: "OPEN" }],
  [
    "overdue-follow-up",
    {
      ...JOB,
      status: "APPLIED",
      cv_html_present: true,
      cover_letter_html_present: true,
      next_follow_up_at: "2026-09-30T07:00:00+00:00",
    },
  ],
];

for (const [name, job] of NEXT_STEP_JOBS) {
  for (const [size, viewport] of SCREENSHOT_SIZES) {
    test(`next step card (${name}) at ${size}px`, async ({ page, mockApi }) => {
      await mockApi(jobRoutes(job));
      await page.setViewportSize(viewport);
      await page.goto("/jobs/job-1");
      const side = page.getByRole("complementary", { name: "Nächster Schritt" });
      await expect(side).toBeVisible();
      // Guards against the card losing its base rule (the signal bar).
      await expect(side.locator(".next")).toHaveCSS("border-left-width", "5px");
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `job-next-${name}-${size}`);
    });
  }
}

test("puts a due follow-up on the amber field in dark mode at 1440px", async ({
  page,
  mockApi,
}) => {
  const [, overdue] = NEXT_STEP_JOBS[1];
  await mockApi(jobRoutes(overdue));
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/jobs/job-1");
  const card = page.getByRole("complementary", { name: "Nächster Schritt" }).locator(".next");
  await expect(card).toHaveClass(/tone-warn/);
  // Resolve the tokens through a probe, so both sides use the browser's computed colour format.
  const colorOf = (token: string) =>
    page.evaluate((name) => {
      const probe = document.createElement("div");
      probe.style.backgroundColor = `var(${name})`;
      document.body.append(probe);
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    }, token);
  const background = await card.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(background).toBe(await colorOf("--warn-soft"));
  expect(background).not.toBe(await colorOf("--accent-soft"));
  await saveScreenshot(page, "job-next-overdue-follow-up-1440-dark");
});

test("the next step column sticks while the tab panel scrolls at 1440px", async ({
  page,
  mockApi,
}) => {
  await mockApi(jobRoutes({ ...JOB, status: "OPEN" }));
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/jobs/job-1");
  const side = page.getByRole("complementary", { name: "Nächster Schritt" });
  await expect(side).toBeVisible();
  // No ancestor may clip or scroll, otherwise sticky silently degrades to static.
  const clipping = await side.evaluate((element) => {
    const found: string[] = [];
    for (let node = element.parentElement; node; node = node.parentElement) {
      const overflow = getComputedStyle(node).overflow;
      if (overflow !== "visible") found.push(`${node.tagName}.${node.className}:${overflow}`);
    }
    return found;
  });
  expect(clipping).toEqual([]);
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.style.height = "2400px";
    document.querySelector(".jd-main")?.append(spacer);
  });
  await page.evaluate(() => window.scrollTo(0, 800));
  const top = await side.evaluate((element) => element.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(0);
  expect(top).toBeLessThanOrEqual(40);
  await saveScreenshot(page, "job-next-sticky-1440");
});

test("on mobile the order is header, next step, tabs, panel", async ({ page, mockApi }) => {
  await mockApi(jobRoutes({ ...JOB, status: "OPEN" }));
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto("/jobs/job-1");
  const tops = await Promise.all([
    page.getByRole("heading", { level: 1 }).evaluate((e) => e.getBoundingClientRect().top),
    page
      .getByRole("complementary", { name: "Nächster Schritt" })
      .evaluate((e) => e.getBoundingClientRect().top),
    page.getByRole("tablist").evaluate((e) => e.getBoundingClientRect().top),
    page.getByRole("tabpanel").evaluate((e) => e.getBoundingClientRect().top),
  ]);
  expect(tops).toEqual([...tops].sort((a, b) => a - b));
});

test("a side column taller than a short desktop window scrolls inside instead of overflowing", async ({
  page,
  mockApi,
}) => {
  const SHORT_WINDOW = { width: 1440, height: 560 };
  await mockApi(jobRoutes({ ...JOB, status: "APPLIED" }));
  await page.setViewportSize(SHORT_WINDOW);
  await page.goto("/jobs/job-1");
  const side = page.getByRole("complementary", { name: "Nächster Schritt" });
  await expect(side.getByRole("region", { name: "Termine & Daten" })).toBeVisible();
  const height = await side.evaluate((element) => element.getBoundingClientRect().height);
  expect(height).toBeLessThanOrEqual(SHORT_WINDOW.height);
  // The last control must be reachable: scrolled into view inside the aside, and focusable.
  const last = side.locator("button, a, input").last();
  await last.focus();
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport();
});

for (const [size, viewport] of SCREENSHOT_SIZES) {
  test(`fit tab shows reasoning and re-analysis at ${size}px`, async ({ page, mockApi }) => {
    await mockApi(jobRoutes(JOB));
    await page.setViewportSize(viewport);
    await page.goto("/jobs/job-1?tab=passung");
    await expect(page.getByRole("heading", { name: /^Passt/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Lücken/ })).toBeVisible();
    await expect(
      page.getByText("Bewirb dich und betone den Umbau des Zahlungsdienstes."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Neu bewerten" })).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
    await saveScreenshot(page, `job-fit-${size}`);
  });
}

test("an unscored job shows a dash and offers the first analysis", async ({ page, mockApi }) => {
  await mockApi(jobRoutes({ ...JOB, status: "OPEN", match_score: null, reasoning: null }));
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/jobs/job-1?tab=passung");
  await expect(page.getByText("Noch nicht bewertet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Jetzt bewerten" })).toBeVisible();
  await saveScreenshot(page, "job-fit-unscored-1440");
});

for (const [size, viewport] of SCREENSHOT_SIZES) {
  test(`documents tab shows the A4 proof from a blob URL at ${size}px`, async ({
    page,
    mockApi,
  }) => {
    await mockApi(jobRoutes(STATES.drafted));
    await page.setViewportSize(viewport);
    await page.goto("/jobs/job-1");
    await expect(page.locator(".proof-slug")).toContainText("Probedruck vom");
    // Inline viewers get an <object>, browsers without one (mobile, headless) the open/download fallback.
    await expect(page.locator(".paper-pdf, .a4-fallback").first()).toBeVisible();
    await expect(
      page
        .getByRole("group", { name: "Lebenslauf" })
        .getByRole("button", { name: "PDF herunterladen", exact: true }),
    ).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
    await saveScreenshot(page, `job-documents-${size}`);
  });
}

for (const [size, viewport] of SCREENSHOT_SIZES) {
  test(`company tab asks for the web address at ${size}px`, async ({ page, mockApi }) => {
    await mockApi(jobRoutes(JOB));
    await page.setViewportSize(viewport);
    await page.goto("/jobs/job-1?tab=firma");
    await expect(page.getByLabel("Web-Adresse der Firma")).toBeVisible();
    await page.getByLabel("Web-Adresse der Firma").fill("ACME GmbH");
    await page.getByRole("button", { name: "Firma recherchieren" }).click();
    await expect(page.getByText("Bitte eine Web-Adresse wie acme.de eingeben.")).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
    await saveScreenshot(page, `job-company-domain-${size}`);
  });

  test(`company tab shows the profile at ${size}px`, async ({ page, mockApi }) => {
    await mockApi(
      jobRoutes(
        { ...JOB, company_domain: "acme.de" },
        { "GET /companies/acme.de": { body: COMPANY_PROFILE } },
      ),
    );
    await page.setViewportSize(viewport);
    await page.goto("/jobs/job-1?tab=firma");
    await expect(page.getByRole("heading", { name: "Gesamtbewertung" })).toBeVisible();
    await expect(page.getByRole("link", { name: "https://acme.de/karriere" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Neu recherchieren" })).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
    await saveScreenshot(page, `job-company-${size}`);
  });
}

for (const [size, viewport] of SCREENSHOT_SIZES) {
  test(`interview tab offers a preparation at ${size}px`, async ({ page, mockApi }) => {
    await mockApi(jobRoutes({ ...JOB, status: "INTERVIEW" }));
    await page.setViewportSize(viewport);
    await page.goto("/jobs/job-1?tab=interview");
    await expect(
      page.getByRole("tabpanel").getByRole("button", { name: "Vorbereitung erstellen" }),
    ).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
    await saveScreenshot(page, `job-interview-empty-${size}`);
  });

  test(`interview tab shows the preparation at ${size}px`, async ({ page, mockApi }) => {
    await mockApi(
      jobRoutes({
        ...JOB,
        status: "INTERVIEW",
        interview_prep_material: PREP_MATERIAL,
        interview_at: "2026-10-12T08:00:00Z",
      }),
    );
    await page.setViewportSize(viewport);
    await page.goto("/jobs/job-1?tab=interview");
    await expect(
      page.getByText("Deine Erfahrung mit Zahlungssystemen ist der stärkste Punkt."),
    ).toBeVisible();
    await expect(page.getByText(/Termin:/)).toBeVisible();
    await expect(page.getByRole("link", { name: "https://acme.de/karriere" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Neu erstellen" })).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
    await saveScreenshot(page, `job-interview-${size}`);
  });
}
