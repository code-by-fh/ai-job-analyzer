import { describe, expect, it } from "vitest";
import {
  passwordProblem,
  settingsHref,
  settingsSectionFromParam,
  timeZoneOptions,
  visibleSections,
} from "@/domain/settings";
import {
  ACCOUNT_HREF,
  AI_SETTINGS_HREF,
  NOTIFICATION_SETTINGS_HREF,
} from "@/features/shell/navigation";

describe("settings sections", () => {
  it("serves the phase 3/5 contracts", () => {
    expect(settingsHref("notifications")).toBe(NOTIFICATION_SETTINGS_HREF);
    expect(settingsHref("account")).toBe(ACCOUNT_HREF);
    expect(settingsHref("general")).toBe("/settings");
  });
  it("reads an unknown or missing value as Allgemein", () => {
    expect(settingsSectionFromParam(null, false)).toBe("general");
    expect(settingsSectionFromParam("passwoerter", true)).toBe("general");
    expect(settingsSectionFromParam("account", false)).toBe("account");
  });
  it("shows admin sections to admins only", () => {
    expect(settingsSectionFromParam("ai", true)).toBe("ai");
    expect(settingsSectionFromParam("ai", false)).toBe("general");
    expect(visibleSections(false)).toEqual(["general", "notifications", "account"]);
    expect(visibleSections(true)).toEqual([
      "general",
      "notifications",
      "account",
      "ai",
      "users",
      "system",
    ]);
    expect(settingsHref("ai")).toBe(AI_SETTINGS_HREF);
  });
});

describe("timeZoneOptions", () => {
  it("adds a stored zone the browser does not list and sorts", () => {
    expect(timeZoneOptions("Etc/Legacy", ["UTC", "Europe/Berlin"])).toEqual([
      "Etc/Legacy",
      "Europe/Berlin",
      "UTC",
    ]);
  });
});

describe("passwordProblem", () => {
  it("names the first problem", () => {
    expect(passwordProblem({ next: "kurz", repeat: "kurz" })).toBe("tooShort");
    expect(passwordProblem({ next: "x".repeat(129), repeat: "x".repeat(129) })).toBe("tooLong");
    expect(passwordProblem({ next: "lang-genug", repeat: "anders-123" })).toBe("mismatch");
    expect(passwordProblem({ next: "lang-genug", repeat: "lang-genug" })).toBeNull();
  });

  it("accepts the bounds the server accepts: 8 characters and 72 UTF-8 bytes", () => {
    expect(passwordProblem({ next: "x".repeat(8), repeat: "x".repeat(8) })).toBeNull();
    expect(passwordProblem({ next: "x".repeat(72), repeat: "x".repeat(72) })).toBeNull();
  });

  it("refuses more than 72 UTF-8 bytes like routers/auth.py (bcrypt reads no further)", () => {
    expect(passwordProblem({ next: "x".repeat(73), repeat: "x".repeat(73) })).toBe("tooLong");
    // 37 umlauts are 37 characters but 74 bytes.
    expect(passwordProblem({ next: "ä".repeat(37), repeat: "ä".repeat(37) })).toBe("tooLong");
  });

  it("counts characters as the server does, not UTF-16 units", () => {
    // Four emoji are 8 UTF-16 units but 4 characters: the server refuses them as too short.
    const emoji = "\u{1F600}".repeat(4);
    expect(passwordProblem({ next: emoji, repeat: emoji })).toBe("tooShort");
  });
});
